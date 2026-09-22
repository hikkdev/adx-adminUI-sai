"use client";

import * as React from "react";
import Link from "next/link";
import { Flame, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { SCORE_SIGNAL_LABEL, leadsService, pointsLabel, temperatureMeta, type LeadDetail } from "@/services/leads";

/**
 * LH1: why a lead is hot, warm or cold — the five signals with their points
 * and the sentence behind each, the value ADX reads for the business, the
 * agent's flag, and two doors: score it now, flag it hot from the desk.
 */
export function LeadScoreCard({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const meta = temperatureMeta(lead.temperature);
    const closed = lead.status === "CONVERTED" || lead.status === "LOST";
    const flagged = Boolean(lead.agentFlaggedHotAt);

    async function run(label: string, work: () => Promise<unknown>) {
        setBusy(true);
        try {
            await work();
            toast.success(label);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="lead-score">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Temperature</h3>
                    <div className="mt-2 flex items-center gap-2">
                        <StatusBadge status={meta} />
                        {typeof lead.score === "number" && (
                            <span className="text-2xl font-semibold tabular-nums text-foreground" data-testid="lead-score-value">
                                {lead.score}
                            </span>
                        )}
                        <span className="text-xs text-muted-foreground">{meta.hint}</span>
                    </div>
                </div>
                {!closed && (
                    <div className="flex gap-2">
                        <Button size="sm" variant={flagged ? "secondary" : "outline"} disabled={busy} onClick={() => void run(flagged ? "Hot flag cleared" : "Flagged hot for 14 days", () => leadsService.flagHot(lead.id, !flagged))}>
                            <Flame className={cn("mr-1.5 size-3.5", flagged && "text-danger")} /> {flagged ? "Flagged hot" : "Flag hot"}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} aria-label="Score now" onClick={() => void run("Scored", () => leadsService.rescore(lead.id))}>
                            <RefreshCw className="size-3.5" />
                        </Button>
                    </div>
                )}
            </div>

            {lead.scoreReasons && lead.scoreReasons.length > 0 ? (
                <ul className="mt-4 divide-y divide-border" data-testid="lead-score-reasons">
                    {lead.scoreReasons.map((reason) => (
                        <li key={reason.signal} className="flex items-start justify-between gap-3 py-2 text-sm">
                            <div className="min-w-0">
                                <div className="font-medium text-foreground">{SCORE_SIGNAL_LABEL[reason.signal] ?? reason.signal}</div>
                                <div className="text-xs text-muted-foreground">{reason.note}</div>
                            </div>
                            <span className={cn("shrink-0 tabular-nums", reason.points > 0 ? "text-success" : reason.points < 0 ? "text-danger" : "text-muted-foreground")}>{pointsLabel(reason.points)}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-3 text-sm text-muted-foreground">Not scored yet — the nightly re-score or the next touch will place it.</p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Worth to ADX</dt>
                <dd className="text-right tabular-nums text-foreground">{lead.estimatedValue ? formatMoney(lead.estimatedValue) : "—"}</dd>
                <dt className="text-muted-foreground">Last touched</dt>
                <dd className="text-right text-foreground">{lead.lastTouchedAt ? formatDateTime(lead.lastTouchedAt) : "Never"}</dd>
                <dt className="text-muted-foreground">Agent&apos;s flag</dt>
                <dd className="text-right text-foreground">{lead.agentFlaggedHotAt ? formatDateTime(lead.agentFlaggedHotAt) : "—"}</dd>
            </dl>
            <p className="mt-3 text-[11px] text-muted-foreground">
                Weights and thresholds under{" "}
                <Link href="/settings/leads-scoring" className="text-primary hover:underline">
                    Settings › Leads scoring
                </Link>
                .
            </p>
        </Card>
    );
}
