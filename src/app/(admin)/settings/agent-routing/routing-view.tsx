"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import {
    AGENT_GRADES,
    GRADE_META,
    LEAD_BANDS,
    LEAD_BAND_LABEL,
    PARTY_BANDS,
    PARTY_BAND_LABEL,
    agentRoutingService,
    type AgentGrade,
    type LeadBand,
    type PartyBand,
    type RoutingSettings,
} from "@/services/agent-applications";

/**
 * AG-5 (the owner, 20 Sep 2026): "more educated and skilled ones can be
 * used to deal with more important clients or publishers."
 *
 * The band ops sets on a publisher or an advertiser (the size band, the
 * same one the withdrawal ladder reads) and on a lead (its importance)
 * maps here to the agent grade the work is routed to. Dispatch offers a
 * spot's work to agents at or above that grade — the closest fit first,
 * then the higher tier, then the nearer agent — and an agent's lead map
 * shows only the bands their grade may take. The desk may always assign by
 * hand over the band; the log says so.
 */
export function RoutingView({ settings, onSaved }: { settings: RoutingSettings; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<RoutingSettings>(settings);
    const [busy, setBusy] = React.useState(false);
    const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

    const save = async () => {
        setBusy(true);
        try {
            await agentRoutingService.save(draft);
            toast.success("Routing settings saved", { description: "Every dispatch from now reads them." });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The settings did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Agent routing"
                subtitle="Which grade of agent an account or a lead of each band is routed to. The desk can always assign by hand over it."
                actions={
                    <Button onClick={() => void save()} disabled={!dirty || busy} data-testid="routing-save">
                        {busy ? "Saving…" : "Save"}
                    </Button>
                }
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Publishers and advertisers</h3>
                    <p className="mt-1 text-sm text-muted-foreground">The size band on the account — set on its page — and the grade its work goes to.</p>
                    <div className="mt-4 space-y-3">
                        {PARTY_BANDS.map((band) => (
                            <GradeRow key={band} id={`band-${band}`} label={PARTY_BAND_LABEL[band]} value={draft.bands[band]} onChange={(grade) => setDraft((d) => ({ ...d, bands: { ...d.bands, [band]: grade } }))} />
                        ))}
                    </div>
                </Card>
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Leads</h3>
                    <p className="mt-1 text-sm text-muted-foreground">The importance on the lead and the grade that sees it on the map and may be assigned it.</p>
                    <div className="mt-4 space-y-3">
                        {LEAD_BANDS.map((band) => (
                            <GradeRow key={band} id={`lead-${band}`} label={LEAD_BAND_LABEL[band]} value={draft.leadBands[band]} onChange={(grade) => setDraft((d) => ({ ...d, leadBands: { ...d.leadBands, [band]: grade } }))} />
                        ))}
                    </div>
                </Card>
            </div>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <label className="flex cursor-pointer items-center justify-between gap-4" htmlFor="routing-enforce">
                    <span>
                        <span className="block text-sm font-medium text-foreground">Enforce on dispatch</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                            On: agents below the grade are not offered the work, and do not see the lead. Off: the grade is preferred — the closest fit still goes first — but everyone is offered.
                        </span>
                    </span>
                    <Switch id="routing-enforce" checked={draft.enforce} onCheckedChange={(enforce) => setDraft((d) => ({ ...d, enforce }))} data-testid="routing-enforce" />
                </label>
            </Card>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-base font-semibold text-foreground">The grades</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {AGENT_GRADES.map((grade) => (
                        <li key={grade} className="rounded-lg border bg-card p-3 text-sm">
                            <span className="font-medium text-foreground">
                                {grade} · {GRADE_META[grade].label}
                            </span>
                            <span className="block text-xs text-muted-foreground">{GRADE_META[grade].handles}</span>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
}

function GradeRow({ id, label, value, onChange }: { id: string; label: string; value: AgentGrade; onChange: (grade: AgentGrade) => void }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <Label htmlFor={id} className="text-sm text-foreground">
                {label}
            </Label>
            <Select value={value} onValueChange={(v) => onChange(v as AgentGrade)}>
                <SelectTrigger id={id} className="w-56 bg-card" data-testid={id}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {AGENT_GRADES.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                            {grade} · {GRADE_META[grade].label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export type { LeadBand, PartyBand };
