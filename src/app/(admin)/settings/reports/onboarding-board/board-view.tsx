"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/adx/section-card";
import { ONBOARDING_SOURCE_LABEL, type OnboardingSource } from "@/types";
import { WINDOW_PRESETS, type OnboardingBoard, type OnboardingBoardQuery, type OnboardingBoardRow, type WindowPreset } from "@/services/reports";

/**
 * QR-14 — who onboarded whom, ranked.
 *
 * One row per person on the ADX side — admins by their console role, agents,
 * anyone who opened an account or committed an import — with what they
 * brought in over the window and how far it got: onboarded, completed, a
 * listing live within seven days, KYC verified, a first booking. Self-
 * signups sit at the bottom as "organic", unranked: nobody's achievement,
 * but the number the team's is measured against. The agent leaderboard
 * stays where it is (it drives commission); this is the whole team's view.
 */

const PRESET_LABEL: Record<WindowPreset, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last7: "Last 7 days",
    last30: "Last 30 days",
    lastMonth: "Last month",
    monthToDate: "Month to date",
};

const pct = (part: number, whole: number): string => (whole === 0 ? "—" : `${Math.round((100 * part) / whole)}%`);

export function BoardView({ board, query, onQuery }: { board: OnboardingBoard; query: OnboardingBoardQuery; onQuery: (next: OnboardingBoardQuery) => void }) {
    const preset = "preset" in query ? query.preset : "custom";
    const [from, setFrom] = React.useState("from" in query ? query.from : "");
    const [to, setTo] = React.useState("to" in query ? query.to : "");
    const [role, setRole] = React.useState(query.role ?? "");

    const ranked = board.rows.filter((r) => r.actorId !== null);
    const organic = board.rows.find((r) => r.actorId === null) ?? null;
    const team = ranked.reduce((sum, r) => sum + r.onboarded, 0);
    const total = team + (organic?.onboarded ?? 0);

    const withWindow = (next: Partial<OnboardingBoardQuery>): OnboardingBoardQuery => ({ ...query, ...next }) as OnboardingBoardQuery;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card px-5 py-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Trophy className="size-4 text-muted-foreground" aria-hidden />
                        <h2 className="text-base font-semibold">Onboarding board</h2>
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid="board-window">
                        {`${board.window.label} · ${total} onboarded — ${team} by the team, ${organic?.onboarded ?? 0} organic`}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={preset}
                        onValueChange={(value) => {
                            if (value === "custom") return;
                            onQuery(withWindow({ preset: value as WindowPreset }));
                        }}
                    >
                        <SelectTrigger className="h-9 w-[170px]" aria-label="Window">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {WINDOW_PRESETS.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {PRESET_LABEL[option]}
                                </SelectItem>
                            ))}
                            <SelectItem value="custom">Custom…</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
                    <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
                    <Button variant="outline" size="sm" disabled={!from || !to} onClick={() => onQuery({ from, to, ...(query.via ? { via: query.via } : {}), ...(query.role ? { role: query.role } : {}) })} data-testid="board-apply-window">
                        Apply
                    </Button>
                    <Select value={query.via ?? "all"} onValueChange={(value) => onQuery(withWindow({ via: value === "all" ? undefined : (value as OnboardingSource) }))}>
                        <SelectTrigger className="h-9 w-[180px]" aria-label="Door">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Every door</SelectItem>
                            {(Object.keys(ONBOARDING_SOURCE_LABEL) as OnboardingSource[]).map((door) => (
                                <SelectItem key={door} value={door}>
                                    {ONBOARDING_SOURCE_LABEL[door]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input aria-label="Role" placeholder="Role, e.g. Ops manager" value={role} onChange={(e) => setRole(e.target.value)} onBlur={() => onQuery(withWindow({ role: role.trim() || undefined }))} className="h-9 w-[180px]" />
                    <Button asChild variant="outline" size="sm">
                        <Link href="/settings/reports" data-testid="board-export">
                            <Download className="mr-1.5 size-4" aria-hidden />
                            Export as report
                        </Link>
                    </Button>
                </div>
            </div>

            <SectionCard title="The team" description="Ranked by parties onboarded in the window; ties by how far they got. A person's role is as it was when they onboarded.">
                {ranked.length === 0 ? (
                    <p className="text-sm text-muted-foreground" data-testid="board-empty">
                        Nobody on the team onboarded anyone in this window.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="board-table">
                            <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                    <th className="py-2 pr-3">#</th>
                                    <th className="py-2 pr-3">Who</th>
                                    <th className="py-2 pr-3">Role</th>
                                    <th className="py-2 pr-3 text-right">Onboarded</th>
                                    <th className="py-2 pr-3 text-right">Pub · Adv</th>
                                    <th className="py-2 pr-3">Doors</th>
                                    <th className="py-2 pr-3 text-right">Completed</th>
                                    <th className="py-2 pr-3 text-right">Live ≤ 7d</th>
                                    <th className="py-2 pr-3 text-right">Verified</th>
                                    <th className="py-2 pr-3 text-right">First booking</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ranked.map((row) => (
                                    <BoardRow key={row.actorId ?? "organic"} row={row} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {organic ? (
                <SectionCard title="Organic" description="Self-signups from the app — nobody's achievement, and the number the team's is measured against.">
                    <table className="w-full text-sm" data-testid="board-organic">
                        <tbody>
                            <BoardRow row={organic} />
                        </tbody>
                    </table>
                </SectionCard>
            ) : null}
        </div>
    );
}

function BoardRow({ row }: { row: OnboardingBoardRow }) {
    const doors = (Object.keys(row.via) as OnboardingSource[]).filter((door) => row.via[door] > 0);
    return (
        <tr className="border-b last:border-0" data-testid={`board-row-${row.actorId ?? "organic"}`}>
            <td className="py-2 pr-3 font-mono text-muted-foreground">{row.rank ?? "—"}</td>
            <td className="py-2 pr-3 font-medium">{row.actorName ?? (row.actorId ? row.actorId : "Organic (self-serve)")}</td>
            <td className="py-2 pr-3 text-muted-foreground">{row.actorRole ?? "—"}</td>
            <td className="py-2 pr-3 text-right font-semibold">{row.onboarded}</td>
            <td className="py-2 pr-3 text-right text-muted-foreground">{`${row.publishers} · ${row.advertisers}`}</td>
            <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-1">
                    {doors.map((door) => (
                        <Badge key={door} variant="secondary" className="font-normal">
                            {`${ONBOARDING_SOURCE_LABEL[door]} ${row.via[door]}`}
                        </Badge>
                    ))}
                </div>
            </td>
            <td className="py-2 pr-3 text-right">
                {row.completed} <span className="text-xs text-muted-foreground">{pct(row.completed, row.onboarded)}</span>
            </td>
            <td className="py-2 pr-3 text-right">{row.liveWithin7d}</td>
            <td className="py-2 pr-3 text-right">{row.verified}</td>
            <td className="py-2 pr-3 text-right">{row.firstBooking}</td>
        </tr>
    );
}
