"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/adx/section-card";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { PayoutSchedule } from "@/services/finance";
import { SETTING_BOUNDS, WEEKDAY_LABEL, cadenceLabel, parseBounded, settingsService, type PayoutBatchCadence } from "@/services/settings";

interface PayoutCadenceProps {
    /** `finance.payoutBatchCadence` off the platform row; undefined when the backend does not serve it, null when the row could not be read. */
    cadence: PayoutBatchCadence | null | undefined;
    /** `GET /finance/payout-batches/schedule` — the next instant and the last draft. Null when that read failed. */
    schedule: PayoutSchedule | null;
    onChanged: () => void;
}

interface Draft {
    enabled: boolean;
    weekday: number;
    hourIst: string;
}

/**
 * Lot G (package CG4, Q124): the weekly payout draft's slot — the
 * `finance.payoutBatchCadence` keys of the platform row, saved through the
 * same deep patch the rails card uses, so only the leaves that moved travel.
 *
 * What the job does with it is stated on the card rather than implied: it
 * builds one DRAFT from every approved withdrawal on a verified method, and
 * nothing here submits, approves or releases — four eyes stay a person's.
 */
export function PayoutCadence({ cadence, schedule, onChanged }: PayoutCadenceProps) {
    if (cadence === undefined) {
        return (
            <SectionCard title="Weekly payout draft" description="When the job drafts the week's batch from the approved withdrawals.">
                <p className="text-sm text-muted-foreground">
                    This backend does not serve <code className="rounded bg-muted px-1 py-0.5 text-xs">finance.payoutBatchCadence</code>, so the
                    cadence cannot be edited here.
                </p>
            </SectionCard>
        );
    }
    if (cadence === null) {
        return (
            <SectionCard title="Weekly payout draft" description="When the job drafts the week's batch from the approved withdrawals.">
                <p className="text-sm text-muted-foreground">The platform settings row could not be read, so the cadence cannot be edited right now.</p>
            </SectionCard>
        );
    }
    return <CadenceForm key={JSON.stringify(cadence)} cadence={cadence} schedule={schedule} onChanged={onChanged} />;
}

function CadenceForm({ cadence, schedule, onChanged }: PayoutCadenceProps & { cadence: PayoutBatchCadence }) {
    const [draft, setDraft] = React.useState<Draft>(() => ({ enabled: cadence.enabled, weekday: cadence.weekday, hourIst: String(cadence.hourIst) }));
    const [busy, setBusy] = React.useState(false);

    const hour = parseBounded(draft.hourIst, SETTING_BOUNDS["finance.payoutBatchCadence.hourIst"]);
    const valid = hour !== null;

    const patch: Partial<PayoutBatchCadence> = {};
    if (draft.enabled !== cadence.enabled) patch.enabled = draft.enabled;
    if (draft.weekday !== cadence.weekday) patch.weekday = draft.weekday;
    if (hour !== null && hour !== cadence.hourIst) patch.hourIst = hour;
    const dirty = Object.keys(patch).length > 0;

    async function save() {
        if (!valid || !dirty) return;
        setBusy(true);
        try {
            await settingsService.update({ finance: { payoutBatchCadence: patch } });
            toast.success("Payout cadence saved", {
                description: draft.enabled
                    ? `${cadenceLabel({ enabled: true, weekday: draft.weekday, hourIst: hour ?? 0 })}. The job picks it up within a minute; the next draft lands on the next slot.`
                    : "The weekly draft is off. Batches are built by hand until it is switched back on.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save the cadence.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Weekly payout draft"
            description="One slot a week at which the job drafts a batch from every approved withdrawal on a verified method. It drafts; a person still submits, approves and releases."
            footer={
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        {valid ? (dirty ? "Only the values that moved are sent." : "Nothing has changed.") : "The hour is 0 to 23, Indian time."}
                    </p>
                    <Button size="sm" disabled={!valid || !dirty || busy} onClick={save}>
                        {busy ? "Saving…" : "Save cadence"}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <label className="flex items-center justify-between gap-4">
                    <span>
                        <span className="block text-sm font-medium text-foreground">Draft a batch every week</span>
                        <span className="block text-xs text-muted-foreground">
                            Off, nothing is drafted on a timer and the Payouts page says so.
                        </span>
                    </span>
                    <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft((state) => ({ ...state, enabled }))} aria-label="Weekly payout draft" />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="cadence-weekday">Weekday</Label>
                        <Select value={String(draft.weekday)} onValueChange={(value) => setDraft((state) => ({ ...state, weekday: Number(value) }))}>
                            <SelectTrigger id="cadence-weekday" disabled={!draft.enabled}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {WEEKDAY_LABEL.map((label, index) => (
                                    <SelectItem key={label} value={String(index)}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="cadence-hour">Hour (IST)</Label>
                        <Input
                            id="cadence-hour"
                            inputMode="numeric"
                            value={draft.hourIst}
                            disabled={!draft.enabled}
                            onChange={(event) => setDraft((state) => ({ ...state, hourIst: event.target.value }))}
                            aria-invalid={hour === null}
                        />
                        <p className="text-xs text-muted-foreground">The whole hour, 0 to 23. The first tick at or after it drafts.</p>
                    </div>
                </div>

                <dl className="grid gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-xs sm:grid-cols-2">
                    <div>
                        <dt className="text-muted-foreground">Next run</dt>
                        <dd className="mt-0.5 font-medium text-foreground">
                            {schedule ? (schedule.enabled && schedule.nextRunAt ? formatDateTime(schedule.nextRunAt) : "Off") : "Could not be read"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Last draft</dt>
                        <dd className="mt-0.5 font-medium text-foreground">
                            {schedule?.lastDraft
                                ? `${schedule.lastDraft.reference} · ${schedule.lastDraft.lineCount} ${schedule.lastDraft.lineCount === 1 ? "line" : "lines"} · ${formatDateTime(schedule.lastDraft.createdAt)}`
                                : schedule
                                  ? "None yet"
                                  : "Could not be read"}
                        </dd>
                    </div>
                </dl>
            </div>
        </SectionCard>
    );
}
