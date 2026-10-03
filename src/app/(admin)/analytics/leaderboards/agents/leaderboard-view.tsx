"use client";

import * as React from "react";
import Link from "next/link";
import { Crown, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { SimpleTable } from "@/components/adx/simple-table";
import { formatMoney } from "@/lib/format";
import {
    LEADERBOARD_PERIODS,
    LEADERBOARD_PERIOD_LABEL,
    cohortMessage,
    conversionsLabel,
    fromLeadsLine,
    type LeaderboardPeriod,
    type LeaderboardView as Board,
    type PublicRow,
} from "@/services/growth";

/* ------------------------------------------------------------------ */
/* The controls                                                        */
/* ------------------------------------------------------------------ */

interface LeaderboardControlsProps {
    /** The city in force — "" until one is chosen. */
    city: string;
    period: LeaderboardPeriod;
    onCityChange: (city: string) => void;
    onPeriodChange: (period: LeaderboardPeriod) => void;
}

/**
 * The city and the period. The city is typed and submitted rather than
 * fetched on every keystroke: the cohort is the whole roster of a city, and
 * "Ben" is not a city. Blank asks for one rather than guessing.
 */
export function LeaderboardControls({ city, period, onCityChange, onPeriodChange }: LeaderboardControlsProps) {
    const [typed, setTyped] = React.useState(city);

    function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const next = typed.trim();
        if (next) onCityChange(next);
    }

    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                    <Label htmlFor="leaderboard-city">City</Label>
                    <Input
                        id="leaderboard-city"
                        value={typed}
                        onChange={(event) => setTyped(event.target.value)}
                        autoComplete="off"
                        placeholder="Bengaluru"
                        className="w-56"
                    />
                </div>
                <Button type="submit" variant="outline" className="bg-card" disabled={!typed.trim()}>
                    Show board
                </Button>
                {!city && (
                    <p className="basis-full text-xs text-muted-foreground sm:basis-auto">
                        Choose a city — the cohort is its whole roster, the way the agent&rsquo;s rating percentile
                        is cut.
                    </p>
                )}
            </form>
            <FilterChips<LeaderboardPeriod>
                value={period}
                onChange={onPeriodChange}
                chips={LEADERBOARD_PERIODS.map((value) => ({ value, label: LEADERBOARD_PERIOD_LABEL[value] }))}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

/**
 * One city's board — DR 05's podium and the ranks below it, as the desk
 * sees them.
 *
 * Decision 9 on the screen: the podium prints its three figures, and nobody
 * else's absolute figure leaves the server, so the table below is rank,
 * name and locality and says so. There is no prize — `prize` is null and
 * nothing pays one — so the podium is drawn without the words.
 */
export function LeaderboardBoard({ board }: { board: Board }) {
    if (!board.cohort.enough) {
        return (
            <EmptyState
                icon={Trophy}
                title="No board yet"
                description={cohortMessage(board.cohort)}
            />
        );
    }

    return (
        <div className="space-y-5">
            <div data-testid="leaderboard-podium" className="grid gap-4 md:grid-cols-3">
                {board.top.map((row) => (
                    <Card
                        key={row.agentId}
                        className={cn(
                            "rounded-lg border-border p-5 shadow-none",
                            row.rank === 1 && "border-primary/40 bg-primary/[0.03]",
                        )}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Rank {row.rank}
                            </span>
                            {row.rank === 1 && <Crown className="size-4 text-primary" aria-label="First place" />}
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                            <InitialsAvatar name={row.name} />
                            <div className="min-w-0">
                                <Link
                                    href={`/agents/${row.agentId}`}
                                    className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                >
                                    {row.name}
                                </Link>
                                <p className="truncate text-xs text-muted-foreground">{row.locality ?? "—"}</p>
                            </div>
                        </div>
                        <p className="text-metric mt-4 text-foreground">{formatMoney(row.earnings)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Credited incentives, {LEADERBOARD_PERIOD_LABEL[board.period].toLowerCase()}
                        </p>
                        {/* LH8: the hunt's share of that figure. */}
                        <p className="mt-2 text-xs text-muted-foreground" data-testid={`leaderboard-from-leads-${row.rank}`}>
                            {fromLeadsLine(row)}
                        </p>
                    </Card>
                ))}
            </div>

            <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-foreground">Ranks {board.top.length + 1} onward</h3>
                    <p className="text-xs text-muted-foreground">
                        {board.cohort.size} agents in {board.cohort.city}. The server sends no figures below the
                        podium — agents see their own and the gaps to their neighbours, nobody else&rsquo;s. Lead
                        conversions are a count, not money, so every row carries them.
                    </p>
                </div>
                <div data-testid="leaderboard-window">
                    <SimpleTable<PublicRow>
                        rows={board.window}
                        rowKey={(row) => row.agentId}
                        emptyMessage="Nobody below the podium — the whole cohort is on it."
                        columns={[
                            {
                                key: "rank",
                                label: "Rank",
                                className: "w-20",
                                render: (row) => <span className="tabular-nums text-muted-foreground">{row.rank}</span>,
                            },
                            {
                                key: "name",
                                label: "Agent",
                                render: (row) => (
                                    <Link
                                        href={`/agents/${row.agentId}`}
                                        className="font-medium text-foreground underline-offset-4 hover:underline"
                                    >
                                        {row.name}
                                    </Link>
                                ),
                            },
                            {
                                key: "locality",
                                label: "Locality",
                                render: (row) => <span className="text-muted-foreground">{row.locality ?? "—"}</span>,
                            },
                            {
                                key: "conversions",
                                label: "From leads",
                                className: "w-36",
                                render: (row) => (
                                    <span className="tabular-nums text-muted-foreground">{conversionsLabel(row.conversions)}</span>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>
        </div>
    );
}
