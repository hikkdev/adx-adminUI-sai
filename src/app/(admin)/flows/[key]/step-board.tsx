"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    blankLadderStep,
    flowBody,
    flowIssues,
    flowService,
    proofLabelFrom,
    resolveStepLadderIssue,
    stepLadderIssues,
    type FlowIssue,
    type StepLadderIssueTarget,
} from "@/services/flows";
import type { LadderStep, StepLadder, StepLadderVocabulary } from "@/types";
import { BoardHeader, IssueList, IssueNote, LiveBanner, useIssueJump } from "./board-chrome";

/** A refusal with its place on the board, resolved once against the ladder that was sent. */
interface BoardIssue extends FlowIssue {
    target: StepLadderIssueTarget | null;
}

interface StepBoardProps {
    flowKey: string;
    ladder: StepLadder;
    vocabulary: StepLadderVocabulary;
    /** False when the board started from the code's ladder — the row does not hold this key yet. */
    stored: boolean;
    /** The card's label for the key, for the empty title. */
    label: string;
    onSaved: () => void;
}

/**
 * The step ladders' board — Lot G (Q126/Q141): `agent-job` and
 * `employee-intake`, one shape parameterised by the proofs it may collect.
 *
 * The ladder on the left is the steps in order; the panel on the right
 * edits the selected one — its key, number, copy, and the proofs it
 * collects, each picked from the vocabulary `GET /config/schema` serves.
 * The server's three rules are mirrored so the board can say what would be
 * refused before it PATCHes: step keys unique, a proof collected by at
 * most one step, every required proof collected by some step. A board
 * opened on a key the row does not hold yet starts from the code's ladder
 * (`GET /orders/job-ladder`, `GET /employee-kyc/ladder`) and the first
 * save stores it at version 1.
 */
export function StepBoard({ flowKey, ladder: initial, vocabulary, stored, label, onSaved }: StepBoardProps) {
    const sequenceRef = React.useRef(0);
    const nextSequence = () => (sequenceRef.current += 1);

    const [ladder, setLadder] = React.useState<StepLadder>(initial);
    const [selected, setSelected] = React.useState<string | null>(initial.steps[0]?.key ?? null);
    const [dirty, setDirty] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [issues, setIssues] = React.useState<BoardIssue[]>([]);
    const jump = useIssueJump();

    const proofLabel = proofLabelFrom(vocabulary);
    const step = selected ? (ladder.steps.find((candidate) => candidate.key === selected) ?? null) : null;
    const stepIndex = step ? ladder.steps.indexOf(step) : -1;
    const local = stepLadderIssues(ladder, vocabulary);
    const collectedBy = new Map<string, string>();
    for (const candidate of ladder.steps) for (const proof of candidate.proofs ?? []) if (!collectedBy.has(proof.key)) collectedBy.set(proof.key, candidate.key);

    const update = (updater: (current: StepLadder) => StepLadder) => {
        setLadder((current) => updater(current));
        setDirty(true);
    };

    const patchStep = (key: string, next: Partial<LadderStep>) =>
        update((current) => ({ ...current, steps: current.steps.map((candidate) => (candidate.key === key ? { ...candidate, ...next } : candidate)) }));

    const renameStep = (key: string, nextKey: string) => {
        const trimmed = nextKey.trim();
        if (!trimmed || trimmed === key) return;
        update((current) => ({ ...current, steps: current.steps.map((candidate) => (candidate.key === key ? { ...candidate, key: trimmed } : candidate)) }));
        setSelected(trimmed);
    };

    const addStep = () => {
        const key = `step-${nextSequence()}`;
        const number = (ladder.steps[ladder.steps.length - 1]?.number ?? 0) + 1;
        update((current) => ({ ...current, steps: [...current.steps, blankLadderStep(key, number)] }));
        setSelected(key);
    };

    const removeStep = (key: string) => {
        update((current) => ({ ...current, steps: current.steps.filter((candidate) => candidate.key !== key) }));
        if (selected === key) setSelected(ladder.steps.find((candidate) => candidate.key !== key)?.key ?? null);
    };

    const moveStep = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= ladder.steps.length) return;
        update((current) => {
            const steps = [...current.steps];
            [steps[index], steps[target]] = [steps[target], steps[index]];
            return { ...current, steps };
        });
    };

    const addProof = (key: string, proofKey: string) =>
        update((current) => ({
            ...current,
            steps: current.steps.map((candidate) =>
                candidate.key === key ? { ...candidate, proofs: [...(candidate.proofs ?? []), { key: proofKey, label: `${proofLabel(proofKey)} is missing` }] } : candidate,
            ),
        }));

    const patchProof = (key: string, index: number, next: { key?: string; label?: string }) =>
        update((current) => ({
            ...current,
            steps: current.steps.map((candidate) =>
                candidate.key === key ? { ...candidate, proofs: candidate.proofs.map((proof, p) => (p === index ? { ...proof, ...next } : proof)) } : candidate,
            ),
        }));

    const removeProof = (key: string, index: number) =>
        update((current) => ({
            ...current,
            steps: current.steps.map((candidate) => (candidate.key === key ? { ...candidate, proofs: candidate.proofs.filter((_, p) => p !== index) } : candidate)),
        }));

    /** Selects the step an issue names and scrolls the board there. */
    const showIssue = (target: StepLadderIssueTarget) => {
        if (target.stepKey) setSelected(target.stepKey);
        jump(target.stepKey ? `step:${target.stepKey}` : "ladder");
    };

    async function save() {
        setBusy(true);
        setIssues([]);
        try {
            // The code's ladder carries no row version; the first save stores it as version 1.
            const body = stored ? ladder : (flowBody({ ...ladder, version: undefined }) as StepLadder);
            const saved = (await flowService.save(flowKey, body)) as StepLadder;
            setDirty(false);
            toast.success(`Saved ${label.toLowerCase()} as version ${saved.version ?? "?"}`, {
                description: "The next job — or the next case opened at the desk — climbs this version.",
            });
            onSaved();
        } catch (cause) {
            const resolved: BoardIssue[] = flowIssues(cause).map((issue) => ({ ...issue, target: resolveStepLadderIssue(ladder, issue.path) }));
            setIssues(resolved);
            const first = resolved.find((issue) => issue.target);
            if (first?.target) showIssue(first.target);
        } finally {
            setBusy(false);
        }
    }

    const issuesOnStep = (key: string) => [...issues.filter((issue) => issue.target?.stepKey === key), ...local.filter((issue) => issue.path?.[1] !== undefined && ladder.steps[Number(issue.path[1])]?.key === key)];
    const ladderIssues = [...issues.filter((issue) => issue.target && !issue.target.stepKey), ...local.filter((issue) => issue.path?.length === 1)];

    return (
        <div className="space-y-4">
            <BoardHeader
                flowKey={flowKey}
                label={ladder.label ?? label}
                description={ladder.description ?? ""}
                audience={ladder.audience ?? ""}
                version={ladder.version}
                stored={stored}
                dirty={dirty}
                busy={busy}
                onLabel={(next) => update((current) => ({ ...current, label: next }))}
                onDescription={(description) => update((current) => ({ ...current, description }))}
                onAudience={(audience) => update((current) => ({ ...current, audience }))}
                onSave={() => void save()}
            />
            <LiveBanner flowKey={flowKey} />
            <IssueList
                issues={issues.filter((issue) => !issue.target)}
                marked={issues.filter((issue) => issue.target).map((issue) => ({ pointer: issue.pointer ?? issue.where, message: issue.message, show: () => showIssue(issue.target!) }))}
                onDismiss={() => setIssues([])}
            />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <Card className="rounded-lg border-border p-4 shadow-none" data-issue-anchor="ladder">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Steps, in order</h2>
                            <p className="text-xs text-muted-foreground">
                                {ladder.steps.length} {ladder.steps.length === 1 ? "step" : "steps"} · required proofs:{" "}
                                {vocabulary.requiredProofs.map((proof) => (
                                    <span key={proof} className={cn("mr-1", collectedBy.has(proof) ? "text-success" : "text-danger")}>
                                        {proofLabel(proof)}
                                    </span>
                                ))}
                            </p>
                        </div>
                        <Button size="sm" variant="outline" className="bg-card" onClick={addStep}>
                            <Plus className="size-4" />
                            Add step
                        </Button>
                    </div>
                    {ladderIssues.map((issue, index) => (
                        <IssueNote key={`${issue.pointer}-${index}`} message={issue.message} pointer={issue.pointer} className="mt-2" />
                    ))}
                    <ol className="mt-3 space-y-1.5">
                        {ladder.steps.map((candidate, index) => {
                            const marks = issuesOnStep(candidate.key);
                            return (
                                <li key={candidate.key} data-issue-anchor={`step:${candidate.key}`}>
                                    <div
                                        className={cn(
                                            "flex items-center gap-2 rounded-md border px-3 py-2 transition-colors",
                                            selected === candidate.key ? "border-primary bg-primary/5" : "hover:bg-muted",
                                            marks.length > 0 && "border-danger/60",
                                        )}
                                    >
                                        <button type="button" onClick={() => setSelected(candidate.key)} className="min-w-0 flex-1 text-left">
                                            <span className="block truncate text-sm font-medium text-foreground">
                                                <span className="mr-2 text-xs text-muted-foreground">Step {candidate.number}</span>
                                                {candidate.title}
                                            </span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                <code>{candidate.key}</code>
                                                {candidate.proofs?.length ? ` · ${candidate.proofs.map((proof) => proofLabel(proof.key)).join(", ")}` : " · explains only"}
                                            </span>
                                        </button>
                                        <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label="Move up" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                                            <ArrowUp className="size-3.5" />
                                        </button>
                                        <button type="button" onClick={() => moveStep(index, 1)} disabled={index === ladder.steps.length - 1} aria-label="Move down" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                                            <ArrowDown className="size-3.5" />
                                        </button>
                                        <button type="button" onClick={() => removeStep(candidate.key)} aria-label={`Remove ${candidate.title}`} className="rounded p-1 text-muted-foreground hover:text-danger">
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                    {marks.map((issue, i) => (
                                        <IssueNote key={`${issue.pointer}-${i}`} message={issue.message} pointer={issue.pointer} className="mt-1 px-1" />
                                    ))}
                                </li>
                            );
                        })}
                    </ol>
                    {ladder.steps.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No steps. The server refuses an empty ladder; add at least one.</p>}
                </Card>

                <Card className="rounded-lg border-border p-4 shadow-none">
                    {!step ? (
                        <p className="text-sm text-muted-foreground">Pick a step on the left to edit it.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="step-key">Key</Label>
                                    <Input id="step-key" defaultValue={step.key} key={step.key} onBlur={(event) => renameStep(step.key, event.target.value)} className="font-mono text-xs" />
                                    <p className="text-xs text-muted-foreground">Unique on the ladder. Renamed when you leave the field.</p>
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="step-number">Number</Label>
                                    <Input
                                        id="step-number"
                                        inputMode="numeric"
                                        value={String(step.number)}
                                        onChange={(event) => {
                                            const value = Number(event.target.value);
                                            if (Number.isInteger(value) && value >= 1 && value <= 99) patchStep(step.key, { number: value });
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="step-title">Title</Label>
                                <Input id="step-title" value={step.title} onChange={(event) => patchStep(step.key, { title: event.target.value })} maxLength={300} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="step-subtitle">Subtitle</Label>
                                <Input id="step-subtitle" value={step.subtitle ?? ""} onChange={(event) => patchStep(step.key, { subtitle: event.target.value || undefined })} maxLength={300} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="step-hint">Hint</Label>
                                <Textarea id="step-hint" value={step.hint ?? ""} onChange={(event) => patchStep(step.key, { hint: event.target.value || undefined })} rows={2} maxLength={1000} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="step-cta">Button</Label>
                                <Input id="step-cta" value={step.cta ?? ""} onChange={(event) => patchStep(step.key, { cta: event.target.value || undefined })} placeholder="Continue" maxLength={80} />
                            </div>

                            <div>
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-semibold text-foreground">Proofs this step collects</h3>
                                    <Select value="" onValueChange={(value) => addProof(step.key, value)}>
                                        <SelectTrigger className="h-8 w-44 text-xs" aria-label="Add a proof">
                                            <SelectValue placeholder="Add a proof…" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {vocabulary.proofs
                                                .filter((proof) => !collectedBy.has(proof))
                                                .map((proof) => (
                                                    <SelectItem key={proof} value={proof}>
                                                        {proofLabel(proof)}
                                                        {vocabulary.requiredProofs.includes(proof) ? " · required" : ""}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">A proof is collected by one step at most; the picker offers what no step holds yet.</p>
                                <ul className="mt-3 space-y-2">
                                    {(step.proofs ?? []).map((proof, index) => (
                                        <li key={`${proof.key}-${index}`} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[160px_1fr_auto]">
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{proofLabel(proof.key)}</p>
                                                <p className="font-mono text-[11px] text-muted-foreground">{proof.key}</p>
                                            </div>
                                            <div className="grid gap-1">
                                                <Label htmlFor={`proof-${stepIndex}-${index}`} className="text-xs">
                                                    Printed while missing
                                                </Label>
                                                <Input id={`proof-${stepIndex}-${index}`} value={proof.label} onChange={(event) => patchProof(step.key, index, { label: event.target.value })} maxLength={300} className="h-8 text-xs" />
                                            </div>
                                            <button type="button" onClick={() => removeProof(step.key, index)} aria-label={`Remove ${proof.key}`} className="self-center rounded p-1 text-muted-foreground hover:text-danger">
                                                <Trash2 className="size-4" />
                                            </button>
                                        </li>
                                    ))}
                                    {(step.proofs ?? []).length === 0 && <li className="text-sm text-muted-foreground">None — this step only explains.</li>}
                                </ul>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
