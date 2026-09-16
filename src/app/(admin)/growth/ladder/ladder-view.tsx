"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/adx/page-header";
import { ApiError } from "@/lib/api-client";
import {
    AGENT_TIERS,
    TIER_LEVELS,
    TIER_NAME_LABEL,
    growthService,
    supportLinesBody,
    type LadderView as Ladder,
    type Rung,
    type TierLevel,
    type TierName,
} from "@/services/growth";
import { GrowthNav } from "../growth-nav";

interface LadderViewProps {
    ladder: Ladder;
    /** Refetches after a save actually lands. */
    onSaved: () => void;
}

/** One row of the table, with the threshold as the text in its input. */
interface RungDraft {
    key: number;
    tier: TierName;
    level: TierLevel;
    from: string;
}

type Lines = Record<TierName, string>;

const toDrafts = (rungs: Rung[]): RungDraft[] =>
    rungs.map((rung, index) => ({ key: index + 1, tier: rung.tier, level: rung.level, from: String(rung.from) }));

const toLines = (lines: Partial<Record<TierName, string>>): Lines => {
    const filled = {} as Lines;
    for (const tier of AGENT_TIERS) filled[tier] = lines[tier] ?? "";
    return filled;
};

/** The rung after this one — the next level, or the next tier's first. */
function rungAfter(rung: { tier: TierName; level: TierLevel } | undefined): { tier: TierName; level: TierLevel } {
    if (!rung) return { tier: "BRONZE", level: "I" };
    const levelIndex = TIER_LEVELS.indexOf(rung.level);
    if (levelIndex < TIER_LEVELS.length - 1) return { tier: rung.tier, level: TIER_LEVELS[levelIndex + 1] };
    const tierIndex = AGENT_TIERS.indexOf(rung.tier);
    if (tierIndex < AGENT_TIERS.length - 1) return { tier: AGENT_TIERS[tierIndex + 1], level: "I" };
    return { tier: rung.tier, level: rung.level };
}

/**
 * The thresholds the ladder climbs on, editable — DR 05's admin half.
 *
 * No DR 10 frame draws this; the console's own form idiom stands in. The
 * server is the authority on whether a ladder is one it can climb — it
 * starts at 0, climbs strictly, never repeats a rung — and its sentence for
 * a bad one is surfaced beside the table rather than in a toast, so ops can
 * fix the row it names. What the client checks is only that every threshold
 * is a whole number, which the input type already enforces.
 */
export function LadderView({ ladder, onSaved }: LadderViewProps) {
    const [rungs, setRungs] = React.useState<RungDraft[]>(() => toDrafts(ladder.rungs));
    const [nextKey, setNextKey] = React.useState(ladder.rungs.length + 1);
    const [lines, setLines] = React.useState<Lines>(() => toLines(ladder.supportLines));
    const [problem, setProblem] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const stored = React.useMemo(
        () => JSON.stringify({ rungs: toDrafts(ladder.rungs).map(({ tier, level, from }) => ({ tier, level, from })), lines: toLines(ladder.supportLines) }),
        [ladder],
    );
    const current = JSON.stringify({ rungs: rungs.map(({ tier, level, from }) => ({ tier, level, from })), lines });
    const dirty = current !== stored;
    const wholeNumbers = rungs.every((rung) => rung.from.trim() !== "" && Number.isInteger(Number(rung.from)) && Number(rung.from) >= 0);

    function update(key: number, patch: Partial<RungDraft>) {
        setRungs((list) => list.map((rung) => (rung.key === key ? { ...rung, ...patch } : rung)));
    }

    function add() {
        setRungs((list) => {
            const last = list[list.length - 1];
            const next = rungAfter(last);
            return [...list, { key: nextKey, tier: next.tier, level: next.level, from: "" }];
        });
        setNextKey((key) => key + 1);
    }

    function remove(key: number) {
        setRungs((list) => list.filter((rung) => rung.key !== key));
    }

    function move(index: number, direction: -1 | 1) {
        setRungs((list) => {
            const target = index + direction;
            if (target < 0 || target >= list.length) return list;
            const next = [...list];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    async function save() {
        if (!dirty || !wholeNumbers || busy) return;
        setBusy(true);
        setProblem(null);
        try {
            const saved = await growthService.saveLadder({
                rungs: rungs.map((rung) => ({ tier: rung.tier, level: rung.level, from: Number(rung.from) })),
                supportLines: supportLinesBody(lines),
            });
            toast.success("Ladder saved", {
                description: `${saved.rungs.length} rungs. Every agent's rung is recomputed on their next read.`,
            });
            onSaved();
        } catch (cause) {
            // The server's sentence names the rung; it belongs beside the table.
            setProblem(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not save the ladder.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Tier ladder"
                subtitle="Where a count of onboarded accounts puts an agent, and what each tier comes with."
                actions={
                    <Button disabled={!dirty || !wholeNumbers || busy} onClick={() => void save()}>
                        {busy ? "Saving…" : "Save ladder"}
                    </Button>
                }
            />
            <GrowthNav />

            <Card className="rounded-lg border-border bg-muted/40 p-4 shadow-none">
                <p className="text-sm text-muted-foreground">
                    Thresholds are <span className="font-medium text-foreground">onboarded accounts</span> — publishers
                    brought through onboarding plus advertisers activated, attributed to the agent. The first rung
                    starts at 0, every rung above it must climb, and no rung repeats; the server refuses a table that
                    does not. With nothing stored here the <span className="font-medium text-foreground">built-in table</span>{" "}
                    is the fallback (Bronze I at 0 through Platinum I at 130). A pinned agent is left where ops put
                    them whatever the ladder says.
                </p>
            </Card>

            <div className="grid gap-4 xl:grid-cols-12">
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-8">
                    <div className="flex items-center justify-between gap-3 px-5 pt-5">
                        <div>
                            <h3 className="text-base font-semibold text-foreground">Rungs</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                In the order agents climb them. The step under an agent&rsquo;s header is the distance
                                to the next rung.
                            </p>
                        </div>
                        <Button variant="outline" size="sm" className="bg-card" onClick={add}>
                            <Plus className="mr-1.5 size-4" />
                            Add rung
                        </Button>
                    </div>
                    <table className="mt-4 w-full text-sm">
                        <thead>
                            <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5 font-medium">#</th>
                                <th className="px-2 py-2.5 font-medium">Tier</th>
                                <th className="px-2 py-2.5 font-medium">Level</th>
                                <th className="px-2 py-2.5 font-medium">From (accounts)</th>
                                <th className="px-2 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {rungs.map((rung, index) => (
                                <tr key={rung.key} className="border-b last:border-0">
                                    <td className="px-5 py-2 tabular-nums text-muted-foreground">{index + 1}</td>
                                    <td className="px-2 py-2">
                                        <Select value={rung.tier} onValueChange={(value) => update(rung.key, { tier: value as TierName })}>
                                            <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Tier">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {AGENT_TIERS.map((tier) => (
                                                    <SelectItem key={tier} value={tier}>
                                                        {TIER_NAME_LABEL[tier]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-2 py-2">
                                        <Select value={rung.level} onValueChange={(value) => update(rung.key, { level: value as TierLevel })}>
                                            <SelectTrigger className="h-8 w-[90px] text-xs" aria-label="Level">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TIER_LEVELS.map((level) => (
                                                    <SelectItem key={level} value={level}>
                                                        {level}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            inputMode="numeric"
                                            aria-label="From"
                                            value={rung.from}
                                            onChange={(event) => update(rung.key, { from: event.target.value })}
                                            className="h-8 w-28 text-xs"
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground"
                                                aria-label="Move up"
                                                disabled={index === 0}
                                                onClick={() => move(index, -1)}
                                            >
                                                <ArrowUp className="size-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground"
                                                aria-label="Move down"
                                                disabled={index === rungs.length - 1}
                                                onClick={() => move(index, 1)}
                                            >
                                                <ArrowDown className="size-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground"
                                                aria-label="Remove rung"
                                                onClick={() => remove(rung.key)}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="space-y-1 px-5 pb-5 pt-3">
                        {problem && <p className="text-sm text-danger">{problem}</p>}
                        {!wholeNumbers && <p className="text-xs text-danger">Every rung needs a whole-number threshold.</p>}
                        {rungs.length < 2 && <p className="text-xs text-danger">A ladder needs at least two rungs.</p>}
                    </div>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-4">
                    <h3 className="text-base font-semibold text-foreground">Support lines</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        A number an agent on the tier can call. Listed on their tier screen only when one is stored
                        here — blank means the benefit is not shown, not that it is promised.
                    </p>
                    <div className="mt-4 space-y-3">
                        {AGENT_TIERS.map((tier) => (
                            <div key={tier} className="grid gap-1.5">
                                <Label htmlFor={`line-${tier}`}>{TIER_NAME_LABEL[tier]}</Label>
                                <Input
                                    id={`line-${tier}`}
                                    aria-label={`${TIER_NAME_LABEL[tier]} support line`}
                                    value={lines[tier]}
                                    maxLength={40}
                                    autoComplete="off"
                                    placeholder="None"
                                    onChange={(event) => setLines((current) => ({ ...current, [tier]: event.target.value }))}
                                />
                            </div>
                        ))}
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                        The tier bonus is not set here: it is the TIER_BONUS rate under Finance settings, per tier,
                        and is listed to the agent only when one exists.
                    </p>
                </Card>
            </div>
        </div>
    );
}
