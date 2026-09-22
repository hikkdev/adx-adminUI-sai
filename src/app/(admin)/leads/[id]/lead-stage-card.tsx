"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { LEAD_STAGES, LOST_REASON_META, STAGE_META, channelLabel, daysInStage, deskMayMove, leadsService, type LeadDetail, type LeadStage } from "@/services/leads";

/**
 * LH2: where the deal is — the stage with how long it has sat there, the
 * next step the server names, the attribution stamps (D14), and the desk's
 * forward move. A loss goes through the reason dialog beside this; the
 * money-bearing stages are the server's and are not offered.
 */
export function LeadStageCard({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const stage = lead.stage;
    if (!stage) return null;
    const days = daysInStage(lead.stageChangedAt);
    const targets = LEAD_STAGES.filter((to) => to !== "LOST" && deskMayMove(stage, to));

    async function move(to: LeadStage) {
        setBusy(true);
        try {
            await leadsService.moveStage(lead.id, { stage: to });
            toast.success(`Moved to ${STAGE_META[to].label}`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="lead-stage">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage</h3>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{STAGE_META[stage].short}</span>
                        <StatusBadge status={STAGE_META[stage]} />
                        {days !== null && <span className="text-xs text-muted-foreground">{days === 0 ? "since today" : `${days} day${days === 1 ? "" : "s"} here`}</span>}
                    </div>
                </div>
                {targets.length > 0 && (
                    <Select value="" onValueChange={(value) => void move(value as LeadStage)} disabled={busy}>
                        <SelectTrigger className="h-8 w-[170px]" aria-label="Move to">
                            <SelectValue placeholder="Move to…" />
                        </SelectTrigger>
                        <SelectContent>
                            {targets.map((to) => (
                                <SelectItem key={to} value={to}>
                                    {STAGE_META[to].short} · {STAGE_META[to].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {lead.nextStep && (
                <p className="mt-3 flex items-start gap-1.5 text-sm text-foreground" data-testid="lead-next-step">
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    {lead.nextStep.label}
                </p>
            )}

            {stage === "LOST" && lead.lostReason && (
                <p className="mt-2 text-xs text-muted-foreground">
                    {LOST_REASON_META[lead.lostReason].label}
                    {lead.lostNote ? ` — ${lead.lostNote}` : ""}
                    {lead.recycleAt ? ` · back in the pool ${formatDateTime(lead.recycleAt)}` : ""}
                </p>
            )}

            {lead.attribution && (lead.attribution.firstContact || lead.attribution.engaged || lead.attribution.converted) && (
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs" data-testid="lead-attribution">
                    {lead.attribution.firstContact && (
                        <>
                            <dt className="text-muted-foreground">First contact</dt>
                            <dd className="text-right text-foreground">{channelLabel(lead.attribution.firstContact.channel)}</dd>
                        </>
                    )}
                    {lead.attribution.engaged && (
                        <>
                            <dt className="text-muted-foreground">Engaged</dt>
                            <dd className="text-right text-foreground">{channelLabel(lead.attribution.engaged.channel)}</dd>
                        </>
                    )}
                    {lead.attribution.converted && (
                        <>
                            <dt className="text-muted-foreground">Converted</dt>
                            <dd className="text-right text-foreground">{channelLabel(lead.attribution.converted.channel)}</dd>
                        </>
                    )}
                </dl>
            )}

            {(lead.activatedAt || lead.retainedAt) && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {lead.activatedAt && (
                        <>
                            <dt className="text-muted-foreground">Activated</dt>
                            <dd className="text-right text-foreground">{formatDateTime(lead.activatedAt)}</dd>
                        </>
                    )}
                    {lead.retainedAt && (
                        <>
                            <dt className="text-muted-foreground">Retained</dt>
                            <dd className="text-right text-foreground">{formatDateTime(lead.retainedAt)}</dd>
                        </>
                    )}
                </dl>
            )}
            {stage === "CONVERTED" || stage === "ONBOARDING" ? (
                <p className="mt-3 text-[11px] text-muted-foreground">Activated and Retained are read off the account by the hourly watch — first listing live or first campaign paid, then a second booking or thirty days live.</p>
            ) : null}
            <Link href="/leads/board" className="mt-2 inline-block text-xs text-primary hover:underline">
                See the board
            </Link>
        </Card>
    );
}
