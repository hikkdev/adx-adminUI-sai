"use client";

import * as React from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useOptionalAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import {
    GOOGLE_INDIA_HOLIDAYS_URL,
    employeesService,
    formatSyncTime,
    syncCountsLine,
    syncFailureLine,
    type HolidayCalendarView,
    type HolidaySyncState,
} from "@/services/employees";
import { integrationsService, type HolidayCalendarSettings } from "@/services/integrations";
import { integrationSaveError } from "@/services/verification";

interface HolidayCalendarDraft {
    enabled: boolean;
    includeObservances: boolean;
    /** Blank means Google's Holidays in India. */
    url: string;
}

const draftOf = (stored: HolidayCalendarSettings): HolidayCalendarDraft => ({
    enabled: stored.enabled,
    includeObservances: stored.includeObservances,
    url: stored.url === GOOGLE_INDIA_HOLIDAYS_URL ? "" : stored.url,
});

/**
 * The `holidayCalendar` patch: only what moved. A blank address goes back
 * to Google's calendar (`url: null`); anything typed is sent as typed.
 */
export function holidayCalendarPatch(stored: HolidayCalendarSettings, draft: HolidayCalendarDraft): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const before = draftOf(stored);
    if (draft.enabled !== before.enabled) patch.enabled = draft.enabled;
    if (draft.includeObservances !== before.includeObservances) patch.includeObservances = draft.includeObservances;
    const url = draft.url.trim();
    if (url !== before.url) patch.url = url ? url : null;
    return patch;
}

/** The address problem in the person's words, or null. */
export function holidayCalendarUrlProblem(url: string): string | null {
    const typed = url.trim();
    if (!typed) return null;
    return /^https:\/\/\S+$/.test(typed) ? null : "The calendar address must start with https://";
}

/** "Last synced 2 Oct, 03:00 · 18 added", the failure in plain words, or "Not synced yet". */
export function lastSyncLine(last: HolidaySyncState | null | undefined): string {
    if (!last) return "Not synced yet.";
    if (last.error) return syncFailureLine(last);
    return `Last synced ${formatSyncTime(last.at)} · ${syncCountsLine(last)}.`;
}

/**
 * Settings › Integrations › Holiday calendar — HC-1 (1 Oct 2026).
 *
 * The public calendar the Holidays page follows (Google's "Holidays in
 * India" unless an https address is set), so the year's holidays come in
 * by themselves: weekly, and on "Sync now". `GET /integrations` →
 * `holidayCalendar`; `PUT /integrations { section: "holidayCalendar",
 * patch }`. The last run comes from `GET /hr/holidays/calendar`; "Sync
 * now" is `POST /hr/holidays/sync` and needs `hr.edit`.
 */
export function HolidayCalendarSection({ stored, onChanged }: { stored: HolidayCalendarSettings | undefined; onChanged: () => void }) {
    return (
        <SectionCard
            title="Holiday calendar"
            description="The public calendar the Holidays page follows, so each year's holidays come in by themselves."
            actions={stored ? <StatusBadge status={stored.enabled ? { label: "On", tone: "success" } : { label: "Off", tone: "neutral" }} /> : undefined}
        >
            {stored ? (
                <HolidayCalendarForm key={JSON.stringify(stored)} stored={stored} onChanged={onChanged} />
            ) : (
                <p className="text-sm text-muted-foreground" data-testid="holiday-calendar-absent">
                    This backend does not sync holidays from a calendar yet.
                </p>
            )}
        </SectionCard>
    );
}

function HolidayCalendarForm({ stored, onChanged }: { stored: HolidayCalendarSettings; onChanged: () => void }) {
    const auth = useOptionalAuth();
    const maySync = auth ? auth.can("hr.edit") : false;
    const initial = React.useMemo(() => draftOf(stored), [stored]);
    const [draft, setDraft] = React.useState<HolidayCalendarDraft>(initial);
    const [busy, setBusy] = React.useState(false);
    const [syncing, setSyncing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = React.useState(initial.url !== "");
    const status = useApiResource<HolidayCalendarView>("settings:holiday-calendar", () => employeesService.holidayCalendar());

    const patch = holidayCalendarPatch(stored, draft);
    const dirty = Object.keys(patch).length > 0;
    const urlProblem = holidayCalendarUrlProblem(draft.url);
    const set = <K extends keyof HolidayCalendarDraft>(key: K, value: HolidayCalendarDraft[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));

    const save = async () => {
        if (urlProblem) {
            setError(urlProblem);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await integrationsService.update("holidayCalendar", patch);
            toast.success("Holiday calendar saved");
            onChanged();
        } catch (cause) {
            const message = integrationSaveError(cause, "Could not save the holiday calendar.");
            setError(message);
            toast.error(message);
        } finally {
            setBusy(false);
        }
    };

    const sync = async () => {
        setSyncing(true);
        try {
            const result = await employeesService.syncHolidays();
            toast.success("Holidays synced", { description: `${syncCountsLine(result)}.` });
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not sync the holidays.");
        } finally {
            setSyncing(false);
            status.reload();
        }
    };

    const syncBlockedBy = !stored.enabled
        ? "Turn the calendar on and save first."
        : dirty
          ? "Save your changes first."
          : undefined;

    return (
        <div className="space-y-4" data-testid="holiday-calendar-card">
            <div className="flex items-start justify-between gap-3 rounded-md bg-muted/40 p-3">
                <div className="min-w-0">
                    <Label htmlFor="holidayCalendar-enabled" className="text-xs">
                        Sync holidays from the calendar
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Every Monday morning, and whenever you press Sync now. Days you added or edited yourself are never changed.
                    </p>
                </div>
                <Switch id="holidayCalendar-enabled" checked={draft.enabled} onCheckedChange={(checked) => set("enabled", checked)} disabled={busy} />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md bg-muted/40 p-3">
                <div className="min-w-0">
                    <Label htmlFor="holidayCalendar-observances" className="text-xs">
                        Include observances as optional holidays
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Festivals such as Pongal, Onam and Ganesh Chaturthi come in as Optional. Off, only public holidays come in.
                    </p>
                </div>
                <Switch
                    id="holidayCalendar-observances"
                    checked={draft.includeObservances}
                    onCheckedChange={(checked) => set("includeObservances", checked)}
                    disabled={busy}
                />
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronDown className={advancedOpen ? "size-3.5 rotate-180 transition-transform" : "size-3.5 transition-transform"} />
                    Calendar address (advanced)
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pt-2">
                    <Label htmlFor="holidayCalendar-url" className="text-xs">
                        Calendar address
                    </Label>
                    <Input
                        id="holidayCalendar-url"
                        value={draft.url}
                        placeholder="Google's Holidays in India"
                        autoComplete="off"
                        className="font-mono text-xs"
                        onChange={(event) => set("url", event.target.value)}
                        disabled={busy}
                    />
                    <p className={urlProblem ? "text-[11px] text-danger" : "text-[11px] text-muted-foreground"}>
                        {urlProblem ?? "An https address of an iCal (.ics) calendar. Leave it blank to use Google's Holidays in India."}
                    </p>
                </CollapsibleContent>
            </Collapsible>

            <p className="text-xs text-muted-foreground" data-testid="holiday-calendar-last-sync">
                {status.data ? lastSyncLine(status.data.lastSync) : status.error ? "The last sync could not be read." : "Reading the last sync…"}
            </p>

            {error && (
                <p className="text-sm text-danger" role="alert">
                    {error}
                </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
                {maySync && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 bg-card"
                        disabled={syncing || busy || Boolean(syncBlockedBy)}
                        title={syncBlockedBy}
                        onClick={() => void sync()}
                    >
                        <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
                        {syncing ? "Syncing…" : "Sync now"}
                    </Button>
                )}
                {dirty && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        disabled={busy}
                        onClick={() => {
                            setDraft(initial);
                            setError(null);
                        }}
                    >
                        Discard
                    </Button>
                )}
                <Button size="sm" className="h-8" disabled={!dirty || busy} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save holiday calendar"}
                </Button>
            </div>
        </div>
    );
}
