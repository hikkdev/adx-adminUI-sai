"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { TIER_DIRECTION_META, rankOf, type LeaderboardView, type TierView } from "@/services/growth";
import { PinTierDialog } from "./pin-tier-dialog";

interface AgentTierCardProps {
    agentId: string;
    agentName: string;
    /** No city on the profile, so no cohort to rank in. */
    city: string | null;
    /** Null when the API is off. */
    tier: TierView | null;
    /** This week's board for the agent's city; null when the API is off, there is no city, or the read failed. */
    leaderboard: LeaderboardView | null;
    onChanged?: () => void;
}

/**
 * The rung and what it comes with — DR 05 on the agent page.
 *
 * Prints what the agent sees: the rung with its level, the step to the next
 * one, the accounts it climbed on, and the benefits the server lists — real
 * or absent, never promised. The rank is this week's, in the agent's own
 * city, and a dash where there is no board or no city rather than a number
 * invented for the tile.
 */
export function AgentTierCard({ agentId, agentName, city, tier, leaderboard, onChanged }: AgentTierCardProps) {
    const [dialog, setDialog] = React.useState<"pin" | "unpin" | null>(null);

    const rank = leaderboard ? rankOf(leaderboard, agentId) : null;
    const rankLine = !city
        ? "— no city on the profile"
        : leaderboard === null
          ? "—"
          : !leaderboard.cohort.enough
            ? `— ${leaderboard.cohort.size} of the ${leaderboard.cohort.minimum} agents a board needs in ${city}`
            : rank === null
              ? "— not ranked"
              : `#${rank} of ${leaderboard.cohort.size} in ${city}`;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="agent-tier-card">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">Tier</h3>
                {tier && (
                    <div className="flex items-center gap-2">
                        {tier.current.pinned && (
                            <Button variant="outline" size="sm" className="bg-card" onClick={() => setDialog("unpin")}>
                                Unpin
                            </Button>
                        )}
                        <Button variant="outline" size="sm" className="bg-card" onClick={() => setDialog("pin")}>
                            <Pin className="mr-1.5 size-3.5" />
                            Pin tier
                        </Button>
                    </div>
                )}
            </div>

            {tier === null ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    The rung, the step to the next one and the promotion history are read from the API. Turn the
                    agents domain on to see them.
                </p>
            ) : (
                <>
                    <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
                        <span className="text-metric text-foreground">{tier.current.label}</span>
                        {tier.current.pinned && <StatusBadge status={{ label: "Pinned by ops", tone: "warning" }} />}
                    </div>
                    {tier.next ? (
                        <>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {tier.stepDone} of {tier.stepTarget} onboarded toward {tier.next.label}
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-1.5 rounded-full bg-success"
                                    style={{
                                        width: `${tier.stepTarget > 0 ? Math.min(100, Math.round((tier.stepDone / tier.stepTarget) * 100)) : 100}%`,
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        <p className="mt-1 text-sm text-muted-foreground">Top of the ladder.</p>
                    )}
                    <FieldList
                        className="mt-4"
                        items={[
                            [
                                "Onboarded",
                                `${tier.onboarded.total} — ${tier.onboarded.publishers} publisher${tier.onboarded.publishers === 1 ? "" : "s"}, ${tier.onboarded.advertisers} advertiser${tier.onboarded.advertisers === 1 ? "" : "s"}`,
                            ],
                            ["Rank this week", rankLine],
                            ...(tier.benefits.length === 0
                                ? ([["Benefits", "None configured for this tier"]] as [string, React.ReactNode][])
                                : tier.benefits.map(
                                      (benefit) =>
                                          [
                                              benefit.title,
                                              <span key={benefit.key} className="text-muted-foreground">
                                                  {benefit.detail}
                                              </span>,
                                          ] as [string, React.ReactNode],
                                  )),
                        ]}
                    />
                    {tier.current.pinned && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Pinned: the ladder is not consulted on read. The step above still counts their accounts.
                        </p>
                    )}
                    <PinTierDialog
                        agentId={agentId}
                        agentName={agentName}
                        mode={dialog ?? "pin"}
                        current={tier.current}
                        open={dialog !== null}
                        onOpenChange={(open) => !open && setDialog(null)}
                        onSaved={() => onChanged?.()}
                    />
                </>
            )}
        </Card>
    );
}

/**
 * Every rung change, newest first: climbs the ladder made, falls it made,
 * and pins ops made — each with the reason the server recorded.
 */
export function AgentPromotionHistory({ tier }: { tier: TierView | null }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="agent-tier-history">
            <h3 className="text-base font-semibold text-foreground">Promotion history</h3>
            {tier === null ? (
                <p className="mt-4 text-sm text-muted-foreground">Read from the API. Turn the agents domain on to see it.</p>
            ) : tier.history.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    No rung changes recorded yet. The first climb appears here when their onboarded accounts reach
                    the next threshold.
                </p>
            ) : (
                <ul className="mt-4 divide-y">
                    {tier.history.map((event) => (
                        <li key={event.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                            <span className="mt-0.5 shrink-0 text-muted-foreground">
                                {event.direction === "UP" ? (
                                    <ArrowUpRight className="size-4 text-success" aria-label="Climbed" />
                                ) : event.direction === "DOWN" ? (
                                    <ArrowDownRight className="size-4 text-warning" aria-label="Fell" />
                                ) : (
                                    <Pin className="size-4" aria-label="Pinned" />
                                )}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-foreground">
                                        {event.from.label} → {event.to.label}
                                    </p>
                                    <StatusBadge status={TIER_DIRECTION_META[event.direction]} />
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">{event.reason}</p>
                            </div>
                            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                                {formatDateTime(event.at)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
