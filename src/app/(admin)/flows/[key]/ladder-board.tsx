"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { flowIssues, flowService, ladderCoverage, resolveLadderIssue, type FlowIssue, type LadderIssueTarget } from "@/services/flows";
import type {
    FlowVocabulary,
    KycCaptureColumn,
    OnboardingStep,
    OnboardingStepKind,
    OnboardingTemplate,
    OnboardingTile,
    TemplateAccountType,
    TemplateParty,
} from "@/types";
import { BoardHeader, IssueList, IssueNote, LiveBanner, useIssueJump } from "./board-chrome";

/** A refusal with its place on the ladder board, resolved once against the template that was sent. */
interface BoardIssue extends FlowIssue {
    target: LadderIssueTarget | null;
}

interface LadderBoardProps {
    flowKey: string;
    template: OnboardingTemplate;
    vocabulary: FlowVocabulary;
    onSaved: () => void;
}

const KIND_LABEL: Record<OnboardingStepKind, string> = {
    "account-type": "Account type",
    form: "Form",
    "kyc-intro": "KYC intro",
    capture: "Capture",
    checklist: "Checklist",
    review: "Review",
    agreement: "Agreement",
};

const COLUMN_LABEL: Record<KycCaptureColumn, string> = {
    govIdFrontUrl: "Government id, front",
    govIdBackUrl: "Government id, back",
    panFrontUrl: "PAN card",
    panSignatureUrl: "PAN signature",
    addressProofUrl: "Address proof",
    selfieUrl: "Selfie",
    selfVideoUrl: "Liveness video",
};

/** A fresh step of a kind, with what its shape requires filled so it can be stored. */
function blankStep(kind: OnboardingStepKind, key: string, kycColumns: KycCaptureColumn[]): OnboardingStep {
    const base = { key, title: "New step" };
    switch (kind) {
        case "account-type":
            return { ...base, kind };
        case "form":
            return { ...base, kind, subtitle: "What we need" };
        case "kyc-intro":
            return { ...base, kind, subtitle: "What we need", bands: [{ label: "Identity", value: "2 minutes" }], cta: "Start" };
        case "capture":
            return {
                ...base,
                kind,
                subtitle: "Upload a clear photograph",
                documents: [
                    {
                        key: `${key}-tile`,
                        label: "Document",
                        hint: "",
                        field: kycColumns[0] ?? "govIdFrontUrl",
                        source: "library",
                    },
                ],
                cta: "Continue",
            };
        case "checklist":
        case "review":
        case "agreement":
            return { ...base, kind, subtitle: "", cta: "Continue" };
    }
}

/**
 * The onboarding ladder's board.
 *
 * Lot E made the DR 08 ladder data: a library of steps keyed by id and six
 * orderings over it, one per party and account type. The board edits the
 * library on the right, the selected ladder on the left, and reads the
 * one rule that decides whether a save is possible off the vocabulary —
 * every required KYC column captured on a tile that is not inert — so the
 * refusal is visible before the server repeats it as a 400.
 */
export function LadderBoard({ flowKey, template: initial, vocabulary, onSaved }: LadderBoardProps) {
    const vocab = vocabulary.flows.onboarding;
    const sequenceRef = React.useRef(0);
    const nextSequence = () => (sequenceRef.current += 1);

    const [template, setTemplate] = React.useState<OnboardingTemplate>(initial);
    const [party, setParty] = React.useState<TemplateParty>(vocab.parties[0] ?? "PUBLISHER");
    const [accountType, setAccountType] = React.useState<TemplateAccountType>(vocab.accountTypes[0] ?? "INDIVIDUAL");
    const [selectedStep, setSelectedStep] = React.useState<string | null>(initial.ladders?.[party]?.[accountType]?.[0] ?? null);
    const [dirty, setDirty] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [issues, setIssues] = React.useState<BoardIssue[]>([]);
    const jump = useIssueJump();

    const ladder = template.ladders?.[party]?.[accountType] ?? [];
    const step = selectedStep ? (template.steps[selectedStep] ?? null) : null;
    const coverage = ladderCoverage(template, party, accountType, vocab.requiredKycColumns);
    const library = Object.entries(template.steps);

    const update = (updater: (current: OnboardingTemplate) => OnboardingTemplate) => {
        setTemplate((current) => updater(current));
        setDirty(true);
    };

    const setLadder = (next: string[]) =>
        update((current) => ({
            ...current,
            ladders: { ...current.ladders, [party]: { ...current.ladders[party], [accountType]: next } },
        }));

    const patchStep = (id: string, next: OnboardingStep) =>
        update((current) => ({ ...current, steps: { ...current.steps, [id]: next } }));

    const renameStep = (id: string, key: string) => {
        if (!key || key === id) return;
        update((current) => {
            const steps: Record<string, OnboardingStep> = {};
            for (const [candidate, value] of Object.entries(current.steps)) {
                steps[candidate === id ? key : candidate] = candidate === id ? { ...value, key } : value;
            }
            const ladders = { ...current.ladders };
            for (const p of Object.keys(ladders) as TemplateParty[]) {
                const byType = { ...ladders[p] };
                for (const t of Object.keys(byType) as TemplateAccountType[]) {
                    byType[t] = byType[t].map((entry) => (entry === id ? key : entry));
                }
                ladders[p] = byType;
            }
            return { ...current, steps, ladders };
        });
        setSelectedStep(key);
    };

    const addToLadder = (id: string) => {
        setLadder([...ladder, id]);
        setSelectedStep(id);
    };

    const createStep = (kind: OnboardingStepKind) => {
        const key = `${kind}-${nextSequence()}`;
        const created = blankStep(kind, key, vocab.kycColumns);
        update((current) => ({
            ...current,
            steps: { ...current.steps, [key]: created },
            ladders: {
                ...current.ladders,
                [party]: { ...current.ladders[party], [accountType]: [...(current.ladders[party]?.[accountType] ?? []), key] },
            },
        }));
        setSelectedStep(key);
    };

    const removeFromLadder = (index: number) => {
        const next = ladder.filter((_, i) => i !== index);
        setLadder(next);
        if (selectedStep === ladder[index] && !next.includes(ladder[index])) setSelectedStep(next[0] ?? null);
    };

    const moveInLadder = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= ladder.length) return;
        const next = [...ladder];
        [next[index], next[target]] = [next[target], next[index]];
        setLadder(next);
    };

    const deleteFromLibrary = (id: string) => {
        update((current) => {
            const steps = { ...current.steps };
            delete steps[id];
            const ladders = { ...current.ladders };
            for (const p of Object.keys(ladders) as TemplateParty[]) {
                const byType = { ...ladders[p] };
                for (const t of Object.keys(byType) as TemplateAccountType[]) byType[t] = byType[t].filter((entry) => entry !== id);
                ladders[p] = byType;
            }
            return { ...current, steps, ladders };
        });
        if (selectedStep === id) setSelectedStep(null);
    };

    /** Opens the ladder an issue names and selects the step, and scrolls the board there. */
    const showIssue = (target: LadderIssueTarget) => {
        if (target.party && vocab.parties.includes(target.party as TemplateParty)) setParty(target.party as TemplateParty);
        if (target.accountType && vocab.accountTypes.includes(target.accountType as TemplateAccountType)) {
            setAccountType(target.accountType as TemplateAccountType);
        }
        if (target.stepKey) setSelectedStep(target.stepKey);
        jump(target.stepKey ? `step:${target.stepKey}` : "ladder");
    };

    async function save() {
        setBusy(true);
        setIssues([]);
        try {
            const saved = (await flowService.save(flowKey, template)) as OnboardingTemplate;
            setDirty(false);
            toast.success(`Saved the onboarding ladder as version ${saved.version ?? "?"}`, {
                description: "The next party to start onboarding climbs this version; anyone mid-ladder keeps theirs.",
            });
            onSaved();
        } catch (cause) {
            // E10-2: each refusal resolved to the ladder and the step it names, the first one opened.
            const resolved: BoardIssue[] = flowIssues(cause).map((issue) => ({ ...issue, target: resolveLadderIssue(template, issue.path) }));
            setIssues(resolved);
            const first = resolved.find((issue) => issue.target);
            if (first?.target) showIssue(first.target);
        } finally {
            setBusy(false);
        }
    }

    /** The refusals on the ladder in view — on the ladder as a whole, or on one of its rungs. */
    const ladderIssues = issues.filter((issue) => issue.target?.party === party && issue.target?.accountType === accountType);
    const issuesOnStep = (id: string) => issues.filter((issue) => issue.target?.stepKey === id && (issue.target.party === null || (issue.target.party === party && issue.target.accountType === accountType)));

    const laddersOverview = vocab.parties.flatMap((p) =>
        vocab.accountTypes.map((t) => ({ party: p, accountType: t, missing: ladderCoverage(template, p, t, vocab.requiredKycColumns).missing.length })),
    );

    return (
        <div className="space-y-4">
            <BoardHeader
                flowKey={flowKey}
                label={template.label ?? "Onboarding"}
                description={template.description ?? ""}
                audience={template.audience ?? ""}
                version={template.version}
                dirty={dirty}
                busy={busy}
                onLabel={(label) => update((current) => ({ ...current, label }))}
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

            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
                    {vocab.parties.map((p) => (
                        <LaneButton key={p} active={party === p} onClick={() => { setParty(p); setSelectedStep(template.ladders?.[p]?.[accountType]?.[0] ?? null); }}>
                            {p === "PUBLISHER" ? "Publisher" : p === "ADVERTISER" ? "Advertiser" : p}
                        </LaneButton>
                    ))}
                </div>
                <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
                    {vocab.accountTypes.map((t) => {
                        const missing = laddersOverview.find((row) => row.party === party && row.accountType === t)?.missing ?? 0;
                        return (
                            <LaneButton key={t} active={accountType === t} onClick={() => { setAccountType(t); setSelectedStep(template.ladders?.[party]?.[t]?.[0] ?? null); }}>
                                {t.charAt(0) + t.slice(1).toLowerCase()}
                                {missing > 0 && <span className="rounded-full bg-danger/15 px-1.5 text-[10px] text-danger">{missing}</span>}
                            </LaneButton>
                        );
                    })}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[300px_1fr_320px]">
                {/* The ladder */}
                <div className="space-y-2.5" data-issue-anchor="ladder">
                    {ladderIssues
                        .filter((issue) => !issue.target?.stepKey)
                        .map((issue, index) => (
                            <IssueNote key={index} message={issue.message} pointer={issue.pointer} />
                        ))}
                    {ladder.length === 0 && (
                        <Card className="rounded-lg border-dashed border-border p-4 text-center text-sm text-muted-foreground shadow-none">
                            This ladder has no steps. Add one from the library, or create one.
                        </Card>
                    )}
                    {ladder.map((id, index) => {
                        const entry = template.steps[id];
                        const stepIssues = issuesOnStep(id);
                        return (
                            <Card
                                key={`${id}-${index}`}
                                data-issue-anchor={`step:${id}`}
                                className={cn(
                                    "cursor-pointer rounded-lg border-border p-3.5 shadow-none transition-colors",
                                    selectedStep === id ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40",
                                    !entry && "border-danger/40",
                                    stepIssues.length > 0 && "ring-2 ring-danger",
                                )}
                                onClick={() => setSelectedStep(id)}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex min-w-0 items-start gap-2">
                                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">{entry?.title ?? `Missing step "${id}"`}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {entry ? KIND_LABEL[entry.kind] : "Not in the library"}
                                                {entry?.kind === "capture" ? ` · ${entry.documents.length} ${entry.documents.length === 1 ? "tile" : "tiles"}` : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center">
                                        <RailButton label="Move up" disabled={index === 0} onClick={() => moveInLadder(index, -1)}>
                                            <ArrowUp className="size-3.5" />
                                        </RailButton>
                                        <RailButton label="Move down" disabled={index === ladder.length - 1} onClick={() => moveInLadder(index, 1)}>
                                            <ArrowDown className="size-3.5" />
                                        </RailButton>
                                        <RailButton label="Remove from this ladder" danger onClick={() => removeFromLadder(index)}>
                                            <X className="size-3.5" />
                                        </RailButton>
                                    </div>
                                </div>
                                {stepIssues.map((issue, issueIndex) => (
                                    <IssueNote key={issueIndex} message={issue.message} pointer={issue.pointer} className="mt-2" />
                                ))}
                            </Card>
                        );
                    })}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                            >
                                <Plus className="size-3.5" />
                                Add step
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
                            <DropdownMenuLabel>From the library</DropdownMenuLabel>
                            {library.filter(([id]) => !ladder.includes(id)).map(([id, entry]) => (
                                <DropdownMenuItem key={id} onClick={() => addToLadder(id)}>
                                    <span className="flex flex-col">
                                        <span>{entry.title}</span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {KIND_LABEL[entry.kind]} · <code>{id}</code>
                                        </span>
                                    </span>
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>New step</DropdownMenuLabel>
                            {vocab.stepKinds.map((kind) => (
                                <DropdownMenuItem key={kind} onClick={() => createStep(kind)}>
                                    {KIND_LABEL[kind] ?? kind}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Step editor */}
                {step && selectedStep ? (
                    <StepEditor
                        key={selectedStep}
                        id={selectedStep}
                        step={step}
                        kycColumns={vocab.kycColumns}
                        govIdTypes={vocab.govIdTypes}
                        addressProofTypes={vocab.addressProofTypes}
                        onRename={(key) => renameStep(selectedStep, key)}
                        onPatch={(next) => patchStep(selectedStep, next)}
                        onDelete={() => deleteFromLibrary(selectedStep)}
                    />
                ) : (
                    <Card className="flex h-48 items-center justify-center rounded-lg border-dashed border-border shadow-none">
                        <p className="text-sm text-muted-foreground">
                            {selectedStep ? `"${selectedStep}" is named on the ladder but not in the library. Remove it, or add a step with that key.` : "Select a step on the left to edit it."}
                        </p>
                    </Card>
                )}

                {/* Coverage */}
                <div className="space-y-4">
                    <Card className="h-fit rounded-lg border-border shadow-none">
                        <div className="border-b px-5 py-4">
                            <h2 className="text-sm font-semibold text-foreground">KYC coverage</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                What the {party.toLowerCase()} {accountType.toLowerCase()} ladder must capture before it can be stored.
                            </p>
                        </div>
                        <ul className="divide-y">
                            {(vocab.requiredKycColumns[accountType] ?? []).map((column) => {
                                const ok = coverage.covered.includes(column);
                                return (
                                    <li key={column} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                                        <span className="text-foreground">{COLUMN_LABEL[column] ?? column}</span>
                                        {ok ? <Check className="size-4 text-success" aria-label="Captured" /> : <X className="size-4 text-danger" aria-label="Not captured" />}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="border-t px-5 py-3 text-xs text-muted-foreground">
                            {coverage.missing.length === 0 && coverage.unknownSteps.length === 0
                                ? "This ladder can be stored."
                                : coverage.missing.length > 0
                                  ? `The server will refuse this template: the ladder never captures ${coverage.missing.map((column) => COLUMN_LABEL[column] ?? column).join(", ")}. A tile marked inert does not count.`
                                  : `Steps ${coverage.unknownSteps.join(", ")} are not in the library.`}
                        </div>
                    </Card>
                    <Card className="h-fit rounded-lg border-border shadow-none">
                        <div className="border-b px-5 py-4">
                            <h2 className="text-sm font-semibold text-foreground">All six ladders</h2>
                        </div>
                        <ul className="divide-y">
                            {laddersOverview.map((row) => (
                                <li key={`${row.party}-${row.accountType}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                                    <button
                                        type="button"
                                        className="text-left text-foreground hover:underline"
                                        onClick={() => {
                                            setParty(row.party);
                                            setAccountType(row.accountType);
                                            setSelectedStep(template.ladders?.[row.party]?.[row.accountType]?.[0] ?? null);
                                        }}
                                    >
                                        {row.party.charAt(0) + row.party.slice(1).toLowerCase()} · {row.accountType.toLowerCase()}
                                    </button>
                                    <StatusBadge
                                        status={row.missing === 0 ? { label: "Complete", tone: "success" } : { label: `${row.missing} missing`, tone: "danger" }}
                                    />
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function LaneButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

function RailButton({
    label,
    danger,
    disabled,
    onClick,
    children,
}: {
    label: string;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
            className={cn(
                "rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
                danger && "hover:text-danger",
            )}
        >
            {children}
        </button>
    );
}

/** `label | value`, one a line. */
const pairsToText = (pairs: { label: string; value?: string; hint?: string }[]) =>
    pairs.map((pair) => `${pair.label} | ${pair.value ?? pair.hint ?? ""}`).join("\n");

const textToPairs = (text: string): [string, string][] =>
    text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [label = "", value = ""] = line.split("|").map((part) => part.trim());
            return [label, value];
        });

/** One step of the library, edited by its kind's shape. */
function StepEditor({
    id,
    step,
    kycColumns,
    govIdTypes,
    addressProofTypes,
    onRename,
    onPatch,
    onDelete,
}: {
    id: string;
    step: OnboardingStep;
    kycColumns: KycCaptureColumn[];
    govIdTypes: string[];
    addressProofTypes: string[];
    onRename: (key: string) => void;
    onPatch: (next: OnboardingStep) => void;
    onDelete: () => void;
}) {
    const [key, setKey] = React.useState(id);
    const text = (label: string, value: string, onChange: (next: string) => void, htmlId: string) => (
        <div className="grid gap-1.5">
            <Label htmlFor={htmlId}>{label}</Label>
            <Input id={htmlId} value={value} onChange={(event) => onChange(event.target.value)} />
        </div>
    );

    return (
        <Card className="h-fit rounded-lg border-border shadow-none">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">{KIND_LABEL[step.kind]}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        The kind is fixed once a step exists; the phone draws each kind with its own screen.
                    </p>
                </div>
                <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={onDelete}>
                    <Trash2 className="size-3.5" />
                    Delete from library
                </Button>
            </div>
            <div className="space-y-4 px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="step-key">Key</Label>
                        <Input id="step-key" value={key} onChange={(event) => setKey(event.target.value)} onBlur={() => onRename(key.trim())} />
                        <p className="text-xs text-muted-foreground">Every ladder that names this step follows the rename.</p>
                    </div>
                    {text("Title", step.title, (title) => onPatch({ ...step, title }), "step-title")}
                </div>
                {"subtitle" in step && text("Subtitle", step.subtitle, (subtitle) => onPatch({ ...step, subtitle }), "step-subtitle")}
                {"cta" in step && text("Button label", step.cta, (cta) => onPatch({ ...step, cta }), "step-cta")}
                {step.kind === "agreement" &&
                    text("Agreement key (optional)", step.agreementKey ?? "", (agreementKey) => onPatch({ ...step, agreementKey: agreementKey || undefined }), "step-agreement")}
                {step.kind === "kyc-intro" && (
                    <div className="grid gap-1.5">
                        <Label htmlFor="step-bands">
                            Bands — <code>label | value</code>, one a line
                        </Label>
                        <Textarea
                            id="step-bands"
                            rows={4}
                            className="font-mono text-xs"
                            defaultValue={pairsToText(step.bands)}
                            onChange={(event) => {
                                const bands = textToPairs(event.target.value).map(([label, value]) => ({ label, value }));
                                if (bands.length > 0) onPatch({ ...step, bands });
                            }}
                        />
                    </div>
                )}
                {step.kind === "capture" && (
                    <CaptureEditor step={step} kycColumns={kycColumns} govIdTypes={govIdTypes} addressProofTypes={addressProofTypes} onPatch={onPatch} />
                )}
            </div>
        </Card>
    );
}

function CaptureEditor({
    step,
    kycColumns,
    govIdTypes,
    addressProofTypes,
    onPatch,
}: {
    step: Extract<OnboardingStep, { kind: "capture" }>;
    kycColumns: KycCaptureColumn[];
    govIdTypes: string[];
    addressProofTypes: string[];
    onPatch: (next: OnboardingStep) => void;
}) {
    const patchTile = (index: number, patch: Partial<OnboardingTile>) => {
        const documents = step.documents.map((tile, i) => {
            if (i !== index) return tile;
            const next = { ...tile, ...patch };
            for (const [prop, value] of Object.entries(next)) {
                if (value === undefined || value === false) delete (next as Record<string, unknown>)[prop];
            }
            return next;
        });
        onPatch({ ...step, documents });
    };

    const toggle = (index: number, tile: OnboardingTile, prop: "front" | "pdf" | "inert" | "video", label: string) => (
        <label className="flex items-center gap-2 text-xs text-foreground">
            <Switch checked={Boolean(tile[prop])} onCheckedChange={(checked) => patchTile(index, { [prop]: checked })} />
            {label}
        </label>
    );

    return (
        <div className="space-y-4">
            <div className="space-y-2 rounded-md border bg-card px-3 py-2.5">
                <label className="flex items-center justify-between gap-3">
                    <span>
                        <span className="block text-sm text-foreground">Ask for the PAN number beside the tile</span>
                        <span className="block text-xs text-muted-foreground">A typed field; the pattern is what the phone validates.</span>
                    </span>
                    <Switch
                        checked={Boolean(step.text)}
                        onCheckedChange={(checked) =>
                            onPatch({
                                ...step,
                                text: checked
                                    ? (step.text ?? { field: "panNumber", label: "PAN number", hint: "", pattern: "^[A-Z]{5}[0-9]{4}[A-Z]$", maxLength: 10 })
                                    : undefined,
                            })
                        }
                    />
                </label>
                {step.text && (
                    <div className="grid gap-2 sm:grid-cols-3">
                        <Input value={step.text.label} aria-label="PAN field label" onChange={(event) => onPatch({ ...step, text: { ...step.text!, label: event.target.value } })} />
                        <Input value={step.text.pattern} aria-label="PAN pattern" className="font-mono text-xs" onChange={(event) => onPatch({ ...step, text: { ...step.text!, pattern: event.target.value } })} />
                        <Input
                            type="number"
                            min={1}
                            max={64}
                            value={step.text.maxLength}
                            aria-label="PAN max length"
                            onChange={(event) => onPatch({ ...step, text: { ...step.text!, maxLength: Number(event.target.value) || 10 } })}
                        />
                    </div>
                )}
            </div>

            <div className="grid gap-1.5">
                <Label htmlFor="step-guidance">
                    Guidance — <code>label | hint</code>, one a line (optional)
                </Label>
                <Textarea
                    id="step-guidance"
                    rows={3}
                    className="font-mono text-xs"
                    defaultValue={pairsToText(step.guidance ?? [])}
                    onChange={(event) => {
                        const guidance = textToPairs(event.target.value).map(([label, hint]) => ({ label, hint }));
                        onPatch({ ...step, guidance: guidance.length > 0 ? guidance : undefined });
                    }}
                />
            </div>

            <div className="grid gap-1.5">
                <Label htmlFor="step-skippable">Skippable when the government id is</Label>
                <Select
                    value={step.skippableWhen?.value ?? "__never__"}
                    onValueChange={(next) => onPatch({ ...step, skippableWhen: next === "__never__" ? undefined : { field: "govIdType", value: next } })}
                >
                    <SelectTrigger id="step-skippable">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__never__">Never skippable</SelectItem>
                        {govIdTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                                {type}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Tiles — more than one means &ldquo;one of these&rdquo;</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-card"
                        disabled={step.documents.length >= 8}
                        onClick={() =>
                            onPatch({
                                ...step,
                                documents: [
                                    ...step.documents,
                                    { key: `${step.key}-tile-${step.documents.length + 1}`, label: "Document", hint: "", field: kycColumns[0] ?? "govIdFrontUrl", source: "library" },
                                ],
                            })
                        }
                    >
                        <Plus className="size-3.5" />
                        Add tile
                    </Button>
                </div>
                {step.documents.map((tile, index) => (
                    <div key={index} className="space-y-3 rounded-md border bg-card p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Input value={tile.key} aria-label="Tile key" placeholder="key" onChange={(event) => patchTile(index, { key: event.target.value })} />
                            <Input value={tile.label} aria-label="Tile label" placeholder="Label" onChange={(event) => patchTile(index, { label: event.target.value })} />
                        </div>
                        <Input value={tile.hint} aria-label="Tile hint" placeholder="Hint" onChange={(event) => patchTile(index, { hint: event.target.value })} />
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Select value={tile.field} onValueChange={(next) => patchTile(index, { field: next as KycCaptureColumn })}>
                                <SelectTrigger aria-label="Goes to column">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {kycColumns.map((column) => (
                                        <SelectItem key={column} value={column}>
                                            {COLUMN_LABEL[column] ?? column}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={tile.source} onValueChange={(next) => patchTile(index, { source: next as OnboardingTile["source"] })}>
                                <SelectTrigger aria-label="Source">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="library">Library</SelectItem>
                                    <SelectItem value="camera">Camera</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Select
                                value={tile.sets ? `${tile.sets.field}:${tile.sets.value}` : "__none__"}
                                onValueChange={(next) => {
                                    if (next === "__none__") return patchTile(index, { sets: undefined });
                                    const [field, value] = next.split(":") as [TileConditionField, string];
                                    patchTile(index, { sets: { field, value } });
                                }}
                            >
                                <SelectTrigger aria-label="Choosing this tile sets">
                                    <SelectValue placeholder="Sets nothing" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Sets nothing</SelectItem>
                                    {govIdTypes.map((type) => (
                                        <SelectItem key={`gov-${type}`} value={`govIdType:${type}`}>
                                            Government id: {type}
                                        </SelectItem>
                                    ))}
                                    {addressProofTypes.map((type) => (
                                        <SelectItem key={`addr-${type}`} value={`addressProofType:${type}`}>
                                            Address proof: {type}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={tile.onlyWhen?.value ?? "__always__"}
                                onValueChange={(next) => patchTile(index, { onlyWhen: next === "__always__" ? undefined : { field: "govIdType", value: next } })}
                            >
                                <SelectTrigger aria-label="Drawn only when">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__always__">Always drawn</SelectItem>
                                    {govIdTypes.map((type) => (
                                        <SelectItem key={`only-${type}`} value={type}>
                                            Only when the id is {type}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-4">
                                {toggle(index, tile, "front", "Front camera")}
                                {toggle(index, tile, "pdf", "PDF allowed")}
                                {toggle(index, tile, "video", "Video clip")}
                                {toggle(index, tile, "inert", "Inert")}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:text-danger"
                                disabled={step.documents.length <= 1}
                                onClick={() => onPatch({ ...step, documents: step.documents.filter((_, i) => i !== index) })}
                            >
                                <Trash2 className="size-3.5" />
                                Remove tile
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

type TileConditionField = OnboardingTile["sets"] extends infer T ? (T extends { field: infer F } ? F : never) : never;
