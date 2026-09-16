"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/adx/section-card";
import { SETTING_BOUNDS, changedKeys, parseBounded, settingsService, type GeoSettings } from "@/services/settings";

interface GeoSettingsCardProps {
    /** `settings.geo`: null when the backend did not serve the section, undefined when the platform row could not be read. */
    geo: GeoSettings | null | undefined;
    onSaved: () => void;
}

interface GeoDraft {
    launchMinListings: string;
    launchNeedsPrintPartner: boolean;
    comingSoonWaitlist: boolean;
}

const toDraft = (geo: GeoSettings): GeoDraft => ({
    launchMinListings: String(geo.launchMinListings),
    launchNeedsPrintPartner: geo.launchNeedsPrintPartner,
    comingSoonWaitlist: geo.comingSoonWaitlist,
});

/** The draft as a document, or null while the number is not one the schema takes. */
export function fromGeoDraft(draft: GeoDraft): GeoSettings | null {
    const launchMinListings = parseBounded(draft.launchMinListings, SETTING_BOUNDS["geo.launchMinListings"]);
    if (launchMinListings === null) return null;
    return { launchMinListings, launchNeedsPrintPartner: draft.launchNeedsPrintPartner, comingSoonWaitlist: draft.comingSoonWaitlist };
}

/**
 * `settings.geo` on the platform row — the readiness check's floor on
 * live listings, whether a print partner is required, and whether the
 * app's pickers list seeding cities and planned capitals as "coming soon".
 * Diff-only, the way every settings card on the console sends its PUT.
 */
export function GeoSettingsCard({ geo, onSaved }: GeoSettingsCardProps) {
    return (
        <SectionCard title="Rollout settings" description="What a launch is checked against, and the coming-soon list">
            {geo ? (
                <GeoSettingsForm key={`${geo.launchMinListings}:${geo.launchNeedsPrintPartner}:${geo.comingSoonWaitlist}`} geo={geo} onSaved={onSaved} />
            ) : (
                <p className="text-sm text-muted-foreground">
                    {geo === null ? (
                        <>
                            This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">geo</code> section of the platform row, so the
                            rollout settings cannot be read or edited here.
                        </>
                    ) : (
                        "The platform row could not be read; the rollout settings are not shown."
                    )}
                </p>
            )}
        </SectionCard>
    );
}

function GeoSettingsForm({ geo, onSaved }: { geo: GeoSettings; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<GeoDraft>(() => toDraft(geo));
    const [busy, setBusy] = React.useState(false);
    const document = fromGeoDraft(draft);
    const patch = document ? changedKeys(geo as unknown as Record<string, unknown>, document as unknown as Record<string, unknown>) : null;
    const dirty = patch !== null && Object.keys(patch).length > 0;
    const bounds = SETTING_BOUNDS["geo.launchMinListings"];

    async function save() {
        if (!patch || !dirty || busy) return;
        setBusy(true);
        try {
            await settingsService.update({ geo: patch as Partial<GeoSettings> });
            toast.success("Rollout settings saved", { description: "The readiness read and the app's pickers use them from now." });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the rollout settings.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <div className="space-y-1.5">
                <Label htmlFor="geo-min-listings">Live listings before a launch reads ready</Label>
                <Input
                    id="geo-min-listings"
                    inputMode="numeric"
                    value={draft.launchMinListings}
                    onChange={(event) => setDraft((current) => ({ ...current, launchMinListings: event.target.value }))}
                    className="w-32 tabular-nums"
                    aria-invalid={document === null ? true : undefined}
                />
                <p className="text-xs text-muted-foreground">
                    A whole number from {bounds.min} to {bounds.max.toLocaleString("en-IN")}. Advisory — the readiness card names the shortfall; the launch is never refused.
                </p>
            </div>
            <div className="flex items-center justify-between gap-4">
                <div>
                    <Label htmlFor="geo-print-partner">A print partner is required</Label>
                    <p className="text-xs text-muted-foreground">The readiness check wants at least one active print partner in the city.</p>
                </div>
                <Switch id="geo-print-partner" checked={draft.launchNeedsPrintPartner} onCheckedChange={(value) => setDraft((current) => ({ ...current, launchNeedsPrintPartner: value }))} />
            </div>
            <div className="flex items-center justify-between gap-4">
                <div>
                    <Label htmlFor="geo-coming-soon">Coming-soon waitlist</Label>
                    <p className="text-xs text-muted-foreground">The app's pickers list seeding cities and planned capitals as coming soon, for the advertiser waitlist.</p>
                </div>
                <Switch id="geo-coming-soon" checked={draft.comingSoonWaitlist} onCheckedChange={(value) => setDraft((current) => ({ ...current, comingSoonWaitlist: value }))} />
            </div>
            <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!dirty || busy}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </form>
    );
}
