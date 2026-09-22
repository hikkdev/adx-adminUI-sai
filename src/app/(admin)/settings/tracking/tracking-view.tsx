"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/adx/section-card";
import { SETTING_BOUNDS, changedKeys, parseBounded, parseBoundedDecimal, settingsService, type TrackingSettings } from "@/services/settings";

interface TrackingViewProps {
    /** `settings.tracking`: null when the backend did not serve the section. */
    settings: TrackingSettings | null;
    live: boolean;
    onSaved: () => void;
}

interface Draft {
    pingMovingSec: string;
    pingStillSec: string;
    mode: TrackingSettings["mode"];
    retentionDays: string;
    geofenceRadiusM: string;
    idleAlertMin: string;
    lateGraceMin: string;
    offRouteKm: string;
    offlineAfterMin: string;
    partiesSeeEta: boolean;
}

const toDraft = (settings: TrackingSettings): Draft => ({
    pingMovingSec: String(settings.pingMovingSec),
    pingStillSec: String(settings.pingStillSec),
    mode: settings.mode,
    retentionDays: String(settings.retentionDays),
    geofenceRadiusM: String(settings.geofenceRadiusM),
    idleAlertMin: String(settings.idleAlertMin),
    lateGraceMin: String(settings.lateGraceMin),
    offRouteKm: String(settings.offRouteKm),
    offlineAfterMin: String(settings.offlineAfterMin),
    partiesSeeEta: settings.partiesSeeEta,
});

/** The draft as the section, or null while a number is outside what the schema takes. */
export function fromDraft(draft: Draft): TrackingSettings | null {
    const pingMovingSec = parseBounded(draft.pingMovingSec, SETTING_BOUNDS["tracking.pingMovingSec"]);
    const pingStillSec = parseBounded(draft.pingStillSec, SETTING_BOUNDS["tracking.pingStillSec"]);
    const retentionDays = parseBounded(draft.retentionDays, SETTING_BOUNDS["tracking.retentionDays"]);
    const geofenceRadiusM = parseBounded(draft.geofenceRadiusM, SETTING_BOUNDS["tracking.geofenceRadiusM"]);
    const idleAlertMin = parseBounded(draft.idleAlertMin, SETTING_BOUNDS["tracking.idleAlertMin"]);
    const lateGraceMin = parseBounded(draft.lateGraceMin, SETTING_BOUNDS["tracking.lateGraceMin"]);
    const offRouteKm = parseBoundedDecimal(draft.offRouteKm, SETTING_BOUNDS["tracking.offRouteKm"]);
    const offlineAfterMin = parseBounded(draft.offlineAfterMin, SETTING_BOUNDS["tracking.offlineAfterMin"]);
    if ([pingMovingSec, pingStillSec, retentionDays, geofenceRadiusM, idleAlertMin, lateGraceMin, offRouteKm, offlineAfterMin].some((value) => value === null)) return null;
    // A still ping slower than a moving one is the only order that makes sense.
    if ((pingStillSec as number) < (pingMovingSec as number)) return null;
    return {
        pingMovingSec: pingMovingSec as number,
        pingStillSec: pingStillSec as number,
        mode: draft.mode,
        retentionDays: retentionDays as number,
        geofenceRadiusM: geofenceRadiusM as number,
        idleAlertMin: idleAlertMin as number,
        lateGraceMin: lateGraceMin as number,
        offRouteKm: offRouteKm as number,
        offlineAfterMin: offlineAfterMin as number,
        partiesSeeEta: draft.partiesSeeEta,
    };
}

/**
 * LT-1 (live agent tracking): Settings › Live tracking — how often the
 * agent app reports on a job, how long the trails are kept, the geofence
 * that counts as arrived, the alert thresholds behind the live map, and
 * whether the parties see an ETA. The map itself is Ops › Live map; the
 * feature switch (`ops.live-map`) is under Feature flags.
 */
export function TrackingView({ settings, live, onSaved }: TrackingViewProps) {
    if (!live || !settings) {
        return (
            <SectionCard title="Live tracking" description="How the agent app reports its position and how the live map reads it">
                <p className="text-sm text-muted-foreground">
                    {!live ? (
                        "Not connected to the ADX backend — the section is read from the platform row and cannot be shown from fixtures."
                    ) : (
                        <>
                            This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">tracking</code> section of the platform row, so live tracking cannot be configured here.
                        </>
                    )}
                </p>
            </SectionCard>
        );
    }
    return <TrackingForm key={JSON.stringify(settings)} settings={settings} onSaved={onSaved} />;
}

function NumberField({ id, label, hint, value, bounds, decimal, onChange, unit }: { id: string; label: string; hint: string; value: string; bounds: { min: number; max: number }; decimal?: boolean; unit: string; onChange: (value: string) => void }) {
    const parsed = decimal ? parseBoundedDecimal(value, bounds) : parseBounded(value, bounds);
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>
                {label} <span className="text-muted-foreground">({unit})</span>
            </Label>
            <Input id={id} inputMode={decimal ? "decimal" : "numeric"} value={value} onChange={(event) => onChange(event.target.value)} className="w-32 tabular-nums" aria-invalid={parsed === null ? true : undefined} />
            <p className="text-xs text-muted-foreground">
                {bounds.min} to {bounds.max}. {hint}
            </p>
        </div>
    );
}

function TrackingForm({ settings, onSaved }: { settings: TrackingSettings; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<Draft>(() => toDraft(settings));
    const [busy, setBusy] = React.useState(false);
    const next = fromDraft(draft);
    const patch = next ? changedKeys(settings as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>) : null;
    const dirty = patch !== null && Object.keys(patch).length > 0;
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
    const orderProblem = next === null && parseBounded(draft.pingMovingSec, SETTING_BOUNDS["tracking.pingMovingSec"]) !== null && parseBounded(draft.pingStillSec, SETTING_BOUNDS["tracking.pingStillSec"]) !== null;

    async function save() {
        if (!patch || !dirty || busy) return;
        setBusy(true);
        try {
            await settingsService.update({ tracking: patch as never });
            toast.success("Live tracking settings saved", { description: "The agent app reads the new cadence at its next sign-in; the map reads the thresholds at once." });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the live tracking settings.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            className="space-y-5"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <SectionCard title="Reporting" description="How often the agent app tells ADX where the agent is, and when. The switch for the whole feature is under Feature flags (ops.live-map).">
                <div className="grid gap-4 sm:grid-cols-3">
                    <NumberField id="tracking-moving" label="Ping while moving" unit="seconds" hint="The brief said 30–60 s on a job." value={draft.pingMovingSec} bounds={SETTING_BOUNDS["tracking.pingMovingSec"]} onChange={(value) => set("pingMovingSec", value)} />
                    <NumberField id="tracking-still" label="Ping while still" unit="seconds" hint="Slower once the agent has stopped moving; never faster than the moving ping." value={draft.pingStillSec} bounds={SETTING_BOUNDS["tracking.pingStillSec"]} onChange={(value) => set("pingStillSec", value)} />
                    <div className="space-y-1.5">
                        <Label>Reports</Label>
                        <Select value={draft.mode} onValueChange={(value) => set("mode", value as TrackingSettings["mode"])}>
                            <SelectTrigger aria-label="Reporting mode">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="WHILE_USING">While the app is open</SelectItem>
                                <SelectItem value="BACKGROUND">In the background too</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">The current agent build reports only while open; “in the background” waits on a foreground-service build and is read as “while open” until then.</p>
                    </div>
                </div>
                {orderProblem ? <p className="mt-3 text-xs text-destructive">The still ping must not be faster than the moving ping.</p> : null}
            </SectionCard>

            <SectionCard title="Trails and arrival" description="What ADX keeps of the route and what counts as being there">
                <div className="grid gap-4 sm:grid-cols-2">
                    <NumberField id="tracking-retention" label="Keep trails for" unit="days" hint="The nightly sweep drops older trails and their fixes; the last position itself lives a day." value={draft.retentionDays} bounds={SETTING_BOUNDS["tracking.retentionDays"]} onChange={(value) => set("retentionDays", value)} />
                    <NumberField id="tracking-geofence" label="Arrived within" unit="metres" hint="A fix this close to the site (or the print partner) marks the leg arrived and the site-visit or job step reached." value={draft.geofenceRadiusM} bounds={SETTING_BOUNDS["tracking.geofenceRadiusM"]} onChange={(value) => set("geofenceRadiusM", value)} />
                </div>
            </SectionCard>

            <SectionCard title="Alerts" description="When the live map flags an agent on a job">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <NumberField id="tracking-idle" label="Idle after" unit="minutes" hint="Standing still, on a job, not at the destination." value={draft.idleAlertMin} bounds={SETTING_BOUNDS["tracking.idleAlertMin"]} onChange={(value) => set("idleAlertMin", value)} />
                    <NumberField id="tracking-late" label="Late after the slot by" unit="minutes" hint="Past the slot’s start and not arrived." value={draft.lateGraceMin} bounds={SETTING_BOUNDS["tracking.lateGraceMin"]} onChange={(value) => set("lateGraceMin", value)} />
                    <NumberField id="tracking-offroute" label="Off route beyond" unit="km" hint="Off the straight line from the first fix to the destination." decimal value={draft.offRouteKm} bounds={SETTING_BOUNDS["tracking.offRouteKm"]} onChange={(value) => set("offRouteKm", value)} />
                    <NumberField id="tracking-offline" label="Gone dark after" unit="minutes" hint="No fix at all for this long while active." value={draft.offlineAfterMin} bounds={SETTING_BOUNDS["tracking.offlineAfterMin"]} onChange={(value) => set("offlineAfterMin", value)} />
                </div>
            </SectionCard>

            <SectionCard title="The parties" description="What the publisher and the advertiser see of the agent on their own tracking screens">
                <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={draft.partiesSeeEta} onCheckedChange={(value) => set("partiesSeeEta", value === true)} className="mt-0.5" />
                    <span>
                        Show the parties an ETA
                        <span className="block text-xs text-muted-foreground">Beside the agent’s position on the installation tracking screen — a straight-line estimate, never a promise.</span>
                    </span>
                </label>
            </SectionCard>

            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    See the agents on the{" "}
                    <Link href="/live-map" className="text-primary hover:underline">
                        Live map
                    </Link>
                    .
                </p>
                <Button type="submit" size="sm" disabled={!dirty || busy || next === null}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </form>
    );
}
