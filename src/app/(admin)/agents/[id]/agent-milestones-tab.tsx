"use client";

import { Card } from "@/components/ui/card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import { milestoneTypeLabel, targetLabel, type MilestoneBoard, type MilestoneCard } from "@/services/growth";

/** "3 / 10", or the rupees behind a revenue card. */
function progressLabel(card: MilestoneCard): string {
    if (card.type === "REVENUE" && card.progressAmount !== null) {
        return `${formatMoney(card.progressAmount)} of ${targetLabel(card.type, card.target)}`;
    }
    return `${card.progress} / ${card.target}`;
}

function ProgressBar({ pct, done }: { pct: number; done: boolean }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
                className={done ? "h-1.5 rounded-full bg-success" : "h-1.5 rounded-full bg-primary"}
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
        </div>
    );
}

/**
 * The agent's board, as rows — DR 05's cards, derived the same way the
 * app derives them and read through `GET /agents/:id/milestones`.
 *
 * The chip is the server's; the console draws the label it sent. A claimed
 * reward is recorded as an incentive and released by finance, which is
 * what the Earnings tab shows.
 */
export function AgentMilestonesTab({ board }: { board: MilestoneBoard | null }) {
    if (board === null) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    Milestones are read from the API, and the console is not connected to it. Turn the agents
                    domain on to see this agent&rsquo;s board.
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                {board.counts.ACTIVE} in progress · {board.counts.UPCOMING} upcoming · {board.counts.COMPLETED}{" "}
                completed. Progress is derived from the agent&rsquo;s own record every time the board is read; a
                claimed reward is recorded as an incentive and released by ADX finance.
            </p>
            <SimpleTable<MilestoneCard>
                rows={board.milestones}
                rowKey={(card) => card.id}
                emptyMessage="No milestones on this agent's board — there are no active templates."
                columns={[
                    {
                        key: "title",
                        label: "Milestone",
                        render: (card) => (
                            <div className="min-w-0 max-w-[20rem]">
                                <p className="font-medium text-foreground">{card.title}</p>
                                <p className="truncate text-xs text-muted-foreground">{card.description}</p>
                            </div>
                        ),
                    },
                    {
                        key: "type",
                        label: "Type",
                        render: (card) => <span className="text-muted-foreground">{milestoneTypeLabel(card.type)}</span>,
                    },
                    {
                        key: "state",
                        label: "State",
                        render: (card) => <StatusBadge status={card.chip} />,
                    },
                    {
                        key: "progress",
                        label: "Progress",
                        className: "min-w-[12rem]",
                        render: (card) => (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="tabular-nums text-foreground">{progressLabel(card)}</span>
                                    <span className="tabular-nums text-muted-foreground">{card.pct}%</span>
                                </div>
                                <ProgressBar pct={card.pct} done={card.state === "COMPLETED" || card.state === "CLAIMED"} />
                            </div>
                        ),
                    },
                    {
                        key: "reward",
                        label: "Reward",
                        render: (card) => <span className="font-medium tabular-nums">{formatMoney(card.reward)}</span>,
                    },
                    {
                        key: "timing",
                        label: "Timing",
                        render: (card) => <span className="whitespace-nowrap text-muted-foreground">{card.timing ?? "—"}</span>,
                    },
                    {
                        key: "claimed",
                        label: "Claimed",
                        render: (card) => (
                            <span className="whitespace-nowrap text-muted-foreground">
                                {card.claimedAt ? formatDate(card.claimedAt) : "—"}
                            </span>
                        ),
                    },
                ]}
            />
        </div>
    );
}

/** The frame draws two blocks; three is the most that fits the card without scrolling. */
const PROGRESS_CARDS = 3;

/**
 * The DR 10 frame's "Milestone progress" card on the overview: title,
 * "Reward ₹…", a bar and "40% toward 10 verified publishers" — the
 * milestones in progress, now that something computes them.
 */
export function AgentMilestoneProgressCard({ board }: { board: MilestoneBoard | null }) {
    const active = board?.milestones.filter((card) => card.state === "ACTIVE").slice(0, PROGRESS_CARDS) ?? [];
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="agent-milestone-progress">
            <h3 className="text-base font-semibold text-foreground">Milestone progress</h3>
            {board === null ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    Derived from this agent&rsquo;s own record on every read. Turn the agents domain on to see it.
                </p>
            ) : active.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    Nothing in progress.{" "}
                    {board.milestones.length === 0
                        ? "There are no active templates on the board."
                        : "Every milestone on the board is upcoming, locked, done or ended — see the Milestones tab."}
                </p>
            ) : (
                <ul className="mt-4 space-y-5">
                    {active.map((card) => (
                        <li key={card.id}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="font-medium text-foreground">{card.title}</span>
                                <span className="whitespace-nowrap text-muted-foreground">Reward {formatMoney(card.reward)}</span>
                            </div>
                            <div className="mt-2">
                                <ProgressBar pct={card.pct} done={false} />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {card.pct}% toward {targetLabel(card.type, card.target)}
                                {card.timing ? ` · ${card.timing}` : ""}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
