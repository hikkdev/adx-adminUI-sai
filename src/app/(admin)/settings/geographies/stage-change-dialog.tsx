"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    ALLOWED_MOVES,
    CITY_STAGES,
    CITY_STAGE_LABEL,
    CITY_STAGE_MEANING,
    CITY_STAGE_TONE,
    CITY_SWITCHES,
    CITY_SWITCH_META,
    ROLLOUT_NOTE_MAX,
    STAGE_CONSEQUENCES,
    STAGE_DEFAULT_SWITCHES,
    canMove,
    defaultSwitchesSentence,
    geoService,
    type BulkRolloutBody,
    type BulkRolloutResult,
    type CityStage,
    type CitySwitches,
    type StageCounts,
} from "@/services/geo";

/** A city as the dialog needs it: enough to name it and to know where it stands. */
export interface StageTargetCity {
    slug: string;
    name: string;
    stage: CityStage;
}

/**
 * What the move lands on. One city is `PATCH /geo/cities/:slug/rollout`;
 * the other three are the bulk route's three scopes, one each.
 */
export type StageChangeTarget =
    | { kind: "city"; city: StageTargetCity }
    | { kind: "cities"; cities: StageTargetCity[] }
    | { kind: "state"; stateCode: string; name: string; counts: StageCounts }
    | { kind: "district"; districtId: string; name: string; counts: StageCounts };

export type StageChangeOutcome = { kind: "city"; stage: CityStage } | { kind: "bulk"; result: BulkRolloutResult };

interface StageChangeDialogProps {
    target: StageChangeTarget | null;
    /** The stage the caller had in mind — a transition button; null leaves the choice to the select. */
    initialStage?: CityStage | null;
    onOpenChange: (open: boolean) => void;
    /** After the request lands: the caller reloads. */
    onDone: (outcome: StageChangeOutcome) => void;
}

const plural = (count: number, noun: string) => `${count} ${count === 1 ? noun : noun === "city" ? "cities" : `${noun}s`}`;

/** The stages the target may move to — one city's allowed moves; for a scope, every stage but with a note that some may be refused. */
export function stagesOffered(target: StageChangeTarget): CityStage[] {
    if (target.kind === "city") return [...ALLOWED_MOVES[target.city.stage]];
    if (target.kind === "cities") {
        const stages = new Set(target.cities.map((city) => city.stage));
        return CITY_STAGES.filter((stage) => [...stages].some((from) => canMove(from, stage)));
    }
    return [...CITY_STAGES];
}

/** How many of a list of cities the table would refuse the move for — named in the confirm before the server names them in `skipped`. */
export function refusedCount(cities: readonly StageTargetCity[], to: CityStage): number {
    return cities.filter((city) => !canMove(city.stage, to)).length;
}

/** The body `POST /geo/rollout` takes for a scope — exactly one of the three. */
export function bulkBodyOf(target: Exclude<StageChangeTarget, { kind: "city" }>, stage: CityStage, switches: Partial<CitySwitches> | undefined, note: string | undefined): BulkRolloutBody {
    const base = { stage, ...(switches ? { switches } : {}), ...(note ? { note } : {}) };
    if (target.kind === "cities") return { ...base, citySlugs: target.cities.map((city) => city.slug) };
    if (target.kind === "state") return { ...base, stateCode: target.stateCode };
    return { ...base, districtId: target.districtId };
}

/** Only the switches that differ from the stage's defaults — the body's `switches` is an override, so the defaults are not repeated. */
export function switchOverrides(stage: CityStage, chosen: CitySwitches): Partial<CitySwitches> | undefined {
    const out: Partial<CitySwitches> = {};
    for (const key of CITY_SWITCHES) if (chosen[key] !== STAGE_DEFAULT_SWITCHES[stage][key]) out[key] = chosen[key];
    return Object.keys(out).length ? out : undefined;
}

/** "3 moved · 1 unchanged · 2 skipped" — the toast's one line. */
export function bulkSummary(result: BulkRolloutResult): string {
    const parts = [`${result.changed.length} moved`];
    if (result.unchanged.length) parts.push(`${result.unchanged.length} unchanged`);
    if (result.skipped.length) parts.push(`${result.skipped.length} skipped`);
    return parts.join(" · ");
}

function targetSentence(target: StageChangeTarget): string {
    switch (target.kind) {
        case "city":
            return `${target.city.name} is ${CITY_STAGE_LABEL[target.city.stage]}.`;
        case "cities":
            return `${plural(target.cities.length, "city")} selected.`;
        case "state":
            return `Every city in ${target.name} — ${plural(target.counts.PLANNED + target.counts.SEEDING + target.counts.LAUNCHED + target.counts.PAUSED + target.counts.WITHDRAWN, "city")}.`;
        case "district":
            return `Every city in ${target.name} district — ${plural(target.counts.PLANNED + target.counts.SEEDING + target.counts.LAUNCHED + target.counts.PAUSED + target.counts.WITHDRAWN, "city")}.`;
    }
}

/**
 * The one confirm for every stage move — V-C.
 *
 * Names what the stage sets (the default switches, overridable here) and
 * what it does beyond them: for WITHDRAWN the four things the hourly
 * wind-down will do, because "pull our business out of a city" should
 * never be a click that looked like the others. A note is required for a
 * withdrawal and for any bulk move; the single-city moves may go without.
 * One city is the PATCH; a list, a state or a district is the bulk route,
 * whose refusals come back named in `skipped` rather than failing the
 * batch — and are counted here beforehand for a list, since the console
 * knows the table too.
 */
export function StageChangeDialog({ target, initialStage = null, onOpenChange, onDone }: StageChangeDialogProps) {
    /* Mounted per target so the draft starts clean; ConfirmDialog owns the frame. */
    if (!target) return null;
    return <StageChangeForm key={`${target.kind}:${initialStage ?? ""}`} target={target} initialStage={initialStage} onOpenChange={onOpenChange} onDone={onDone} />;
}

interface StageChangeFormProps {
    target: StageChangeTarget;
    initialStage: CityStage | null;
    onOpenChange: (open: boolean) => void;
    onDone: (outcome: StageChangeOutcome) => void;
}

function StageChangeForm({ target, initialStage, onOpenChange, onDone }: StageChangeFormProps) {
    const offered = stagesOffered(target);
    const [stage, setStage] = React.useState<CityStage | null>(initialStage && offered.includes(initialStage) ? initialStage : offered.length === 1 ? offered[0] : null);
    const [switches, setSwitches] = React.useState<CitySwitches>(STAGE_DEFAULT_SWITCHES[stage ?? "PLANNED"]);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const bulk = target.kind !== "city";
    const noteRequired = bulk || stage === "WITHDRAWN";
    const trimmedNote = note.trim();
    const refused = target.kind === "cities" && stage ? refusedCount(target.cities, stage) : 0;
    const allRefused = target.kind === "cities" && stage !== null && refused === target.cities.length;
    const disabled = stage === null || (noteRequired && trimmedNote.length < 4) || allRefused;

    const pickStage = (next: CityStage) => {
        setStage(next);
        setSwitches(STAGE_DEFAULT_SWITCHES[next]);
    };

    async function confirm() {
        if (!stage || busy) return;
        setBusy(true);
        setError(null);
        const overrides = switchOverrides(stage, switches);
        try {
            if (target.kind === "city") {
                const after = await geoService.rollout(target.city.slug, { stage, ...(overrides ?? {}), ...(trimmedNote ? { note: trimmedNote } : {}) });
                toast.success(`${target.city.name} is ${CITY_STAGE_LABEL[after.stage]}`, {
                    description: stage === "WITHDRAWN" ? "The gates are shut now; the wind-down runs within the hour." : `${defaultSwitchesSentence(stage)} Recorded in the audit log.`,
                });
                onDone({ kind: "city", stage: after.stage });
            } else {
                const result = await geoService.bulkRollout(bulkBodyOf(target, stage, overrides, trimmedNote || undefined));
                toast.success(`${bulkSummary(result)} → ${CITY_STAGE_LABEL[stage]}`, {
                    description: result.skipped.length
                        ? `Refused from where they stand: ${result.skipped
                              .slice(0, 5)
                              .map((item) => item.slug)
                              .join(", ")}${result.skipped.length > 5 ? ` and ${result.skipped.length - 5} more` : ""}.`
                        : "One event per city that moved; one audit line for the batch.",
                });
                onDone({ kind: "bulk", result });
            }
            onOpenChange(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The stage could not be changed.");
        } finally {
            setBusy(false);
        }
    }

    const title =
        stage === null
            ? "Change stage"
            : target.kind === "city"
              ? `${stage === "WITHDRAWN" ? "Withdraw from" : stage === "LAUNCHED" ? "Launch" : stage === "PAUSED" ? "Pause" : stage === "SEEDING" ? "Start seeding" : "Move"} ${target.city.name}`
              : `Move to ${CITY_STAGE_LABEL[stage]}`;

    return (
        <ConfirmDialog
            open
            onOpenChange={onOpenChange}
            title={title}
            description={targetSentence(target)}
            confirmLabel={stage ? (bulk ? `${CITY_STAGE_LABEL[stage]} — every city in scope` : CITY_STAGE_LABEL[stage]) : "Choose a stage"}
            destructive={stage === "WITHDRAWN"}
            busy={busy}
            disabled={disabled}
            onConfirm={confirm}
        >
            <div className="space-y-4 text-sm" data-testid="stage-change-body">
                <div className="space-y-1.5">
                    <Label htmlFor="stage-change-stage">Stage</Label>
                    <Select value={stage ?? ""} onValueChange={(value) => pickStage(value as CityStage)}>
                        <SelectTrigger id="stage-change-stage" className="h-9">
                            <SelectValue placeholder="Choose a stage" />
                        </SelectTrigger>
                        <SelectContent>
                            {offered.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {CITY_STAGE_LABEL[option]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {stage && <p className="text-xs text-muted-foreground">{CITY_STAGE_MEANING[stage]}</p>}
                </div>

                {stage && (
                    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Switches the stage sets
                            <StatusBadge status={{ label: CITY_STAGE_LABEL[stage], tone: CITY_STAGE_TONE[stage] }} />
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid="stage-defaults">
                            {defaultSwitchesSentence(stage)}
                        </p>
                        <details className="text-xs">
                            <summary className="cursor-pointer select-none font-medium text-foreground">Override a switch</summary>
                            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                {CITY_SWITCHES.map((key) => (
                                    <li key={key} className="flex items-center gap-2">
                                        <Checkbox
                                            id={`stage-change-${key}`}
                                            checked={switches[key]}
                                            onCheckedChange={(checked) => setSwitches((current) => ({ ...current, [key]: checked === true }))}
                                        />
                                        <label htmlFor={`stage-change-${key}`} className={cn(switches[key] !== STAGE_DEFAULT_SWITCHES[stage][key] && "font-medium text-foreground")}>
                                            {CITY_SWITCH_META[key].label}
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    </div>
                )}

                {stage && STAGE_CONSEQUENCES[stage].length > 0 && (
                    <div className={cn("rounded-md border p-3", stage === "WITHDRAWN" ? "border-danger/40 bg-danger-soft" : "bg-card")} data-testid="stage-consequences">
                        <p className={cn("text-xs font-semibold uppercase tracking-wide", stage === "WITHDRAWN" ? "text-danger" : "text-muted-foreground")}>
                            {stage === "WITHDRAWN" ? "What the wind-down does within the hour" : "What this does"}
                        </p>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-foreground">
                            {STAGE_CONSEQUENCES[stage].map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {target.kind === "cities" && stage && refused > 0 && (
                    <p className="text-xs text-warning" data-testid="stage-refused">
                        {allRefused
                            ? `None of the selected cities may move to ${CITY_STAGE_LABEL[stage]} from where they stand.`
                            : `${plural(refused, "city")} of the ${target.cities.length} cannot move to ${CITY_STAGE_LABEL[stage]} from where they stand and will be skipped by name.`}
                    </p>
                )}
                {(target.kind === "state" || target.kind === "district") && (
                    <p className="text-xs text-muted-foreground">
                        Every city is planned on its own: one the stage table refuses is skipped and named, never the batch failed.
                    </p>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="stage-change-note">
                        Note {noteRequired ? <span className="text-danger">*</span> : <span className="font-normal text-muted-foreground">(optional)</span>}
                    </Label>
                    <Textarea
                        id="stage-change-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={2}
                        maxLength={ROLLOUT_NOTE_MAX}
                        placeholder={stage === "WITHDRAWN" ? "Why ADX is leaving" : "Why, for the timeline"}
                    />
                    {noteRequired && trimmedNote.length < 4 && <p className="text-xs text-muted-foreground">At least four characters; it goes on every city's timeline.</p>}
                </div>

                {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            </div>
        </ConfirmDialog>
    );
}
