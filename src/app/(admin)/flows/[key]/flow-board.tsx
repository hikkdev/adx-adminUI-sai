"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Copy, GitBranch, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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
import { cn } from "@/lib/utils";
import { allowedProps, flowIssues, flowService, resolveWizardIssue, retypeField, unknownKinds, type FlowIssue, type WizardIssueTarget } from "@/services/flows";
import type { FieldKindSpec, FlowBranch, FlowField, FlowOption, FlowScreen, FlowVocabulary, WizardFlow } from "@/types";
import { BoardHeader, IssueList, IssueNote, LiveBanner, useIssueJump } from "./board-chrome";

/**
 * A refusal with its place on the board, resolved once against the flow
 * that was sent: the target names a screen by key and a field by id, so it
 * survives the reorder the operator makes while fixing it, where the
 * server's index would not.
 */
interface BoardIssue extends FlowIssue {
    target: WizardIssueTarget | null;
}

const laneOf = (target: WizardIssueTarget) => target.lane ?? MAIN;

/**
 * The `data-issue-anchor` the board scrolls to for a target: the prop's
 * control when the path names one (it is in the field editor, which shows
 * the selected field), else the field's row, else the screen's card, else
 * the lane.
 */
function anchorOf(target: WizardIssueTarget): string {
    if (target.fieldId && target.prop) return `prop:${target.prop}`;
    const lane = target.lane ?? MAIN;
    if (target.fieldId) return `field:${lane}:${target.screenKey}:${target.fieldId}`;
    if (target.screenKey) return `screen:${lane}:${target.screenKey}`;
    return `lane:${lane}`;
}

interface FlowBoardProps {
    flowKey: string;
    flow: WizardFlow;
    vocabulary: FlowVocabulary;
    onSaved: () => void;
}

const MAIN = "__main__";

/** `id | title | description`, one option a line — the way the box is typed. */
function optionsToText(options: FlowOption[] | undefined): string {
    return (options ?? []).map((option) => [option.id, option.title, option.description ?? ""].join(" | ").replace(/ \| $/, "")).join("\n");
}

function textToOptions(text: string): FlowOption[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [id = "", title = "", description = ""] = line.split("|").map((part) => part.trim());
            const option: FlowOption = { id, title: title || id };
            if (description) option.description = description;
            return option;
        });
}

/** Field ids asked before `fieldId` on the current path: the root, then the branch when a branch is open. */
function earlierFieldIds(flow: WizardFlow, lane: string, laneScreens: FlowScreen[], screenKey: string | null, fieldId: string | null): string[] {
    const ids: string[] = [];
    const walk = (screens: FlowScreen[]) => {
        for (const item of screens) {
            for (const candidate of item.fields) {
                if (item.key === screenKey && candidate.id === fieldId) return true;
                ids.push(candidate.id);
            }
        }
        return false;
    };
    if (lane === MAIN) walk(flow.screens);
    else if (!walk(flow.screens)) walk(laneScreens);
    return ids;
}

/**
 * The wizard board, over the server's vocabulary.
 *
 * Lanes are the root plus one per branch — a Record keyed by the branching
 * option's id, exactly as the phone reads it. The field kinds on offer and
 * the props each may carry come from `GET /config/schema`; the board never
 * offers a control the kind does not read, because the server would refuse
 * the field. A save is the whole flow, and what the server refuses comes
 * back on the board itself (E10-2): each issue's path is resolved to the
 * lane, the screen, the field and the prop it names, the board opens
 * there, the control is outlined with the message beside it, and the
 * list above the lanes keeps only the refusals that point at nothing.
 */
export function FlowBoard({ flowKey, flow: initial, vocabulary, onSaved }: FlowBoardProps) {
    const wizard = vocabulary.flows.wizard;
    const kinds = wizard.kinds;
    const specOf = React.useCallback((kind: string) => kinds.find((spec) => spec.kind === kind), [kinds]);

    const sequenceRef = React.useRef(0);
    const nextSequence = () => (sequenceRef.current += 1);

    const [flow, setFlow] = React.useState<WizardFlow>(initial);
    const [lane, setLane] = React.useState<string>(MAIN);
    const [selectedScreen, setSelectedScreen] = React.useState<string | null>(initial.screens[0]?.key ?? null);
    const [selectedField, setSelectedField] = React.useState<string | null>(null);
    const [dirty, setDirty] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [issues, setIssues] = React.useState<BoardIssue[]>([]);
    const [branchDialog, setBranchDialog] = React.useState(false);
    const jump = useIssueJump();

    const laneScreens: FlowScreen[] = lane === MAIN ? flow.screens : (flow.branches[lane]?.screens ?? []);
    const screen = laneScreens.find((item) => item.key === selectedScreen) ?? null;
    const field = screen?.fields.find((item) => item.id === selectedField) ?? null;
    const spec = field ? specOf(field.type) : undefined;

    /** Field ids asked before this field on the current path — root first, then the branch. */
    const earlierIds = earlierFieldIds(flow, lane, laneScreens, screen?.key ?? null, field?.id ?? null);

    const update = (updater: (current: WizardFlow) => WizardFlow) => {
        setFlow((current) => updater(current));
        setDirty(true);
    };

    const updateLane = (updater: (screens: FlowScreen[]) => FlowScreen[]) =>
        update((current) =>
            lane === MAIN
                ? { ...current, screens: updater(current.screens) }
                : {
                      ...current,
                      branches: {
                          ...current.branches,
                          [lane]: { ...current.branches[lane], screens: updater(current.branches[lane]?.screens ?? []) },
                      },
                  },
        );

    const patchScreen = (key: string, patch: Partial<FlowScreen>) =>
        updateLane((screens) => screens.map((item) => (item.key === key ? { ...item, ...patch } : item)));

    const replaceField = (next: FlowField) => {
        if (!screen || !field) return;
        patchScreen(screen.key, { fields: screen.fields.map((item) => (item.id === field.id ? next : item)) });
        if (next.id !== field.id) setSelectedField(next.id);
    };

    const patchField = (patch: Partial<FlowField>) => {
        if (!field) return;
        const next = { ...field, ...patch };
        // An unset prop is absent rather than `undefined`, so the body the
        // server strict-parses carries only what the phone will read.
        for (const [prop, value] of Object.entries(next)) {
            if (value === undefined || value === "" || value === false) delete (next as Record<string, unknown>)[prop];
        }
        replaceField(next);
    };

    const addField = (kindSpec: FieldKindSpec) => {
        if (!screen) return;
        const created = retypeField(
            { id: `field-${nextSequence()}`, type: kindSpec.kind, label: kindSpec.label },
            kindSpec,
            wizard.commonProps,
        );
        patchScreen(screen.key, { fields: [...screen.fields, created] });
        setSelectedField(created.id);
    };

    const removeField = (id: string) => {
        if (!screen) return;
        patchScreen(screen.key, { fields: screen.fields.filter((item) => item.id !== id) });
        if (selectedField === id) setSelectedField(null);
    };

    const moveField = (id: string, direction: -1 | 1) => {
        if (!screen) return;
        const index = screen.fields.findIndex((item) => item.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= screen.fields.length) return;
        const fields = [...screen.fields];
        [fields[index], fields[target]] = [fields[target], fields[index]];
        patchScreen(screen.key, { fields });
    };

    const addScreen = () => {
        const created: FlowScreen = {
            key: `screen-${nextSequence()}`,
            title: "New screen",
            step: laneScreens.length + 1,
            totalSteps: Math.max(laneScreens.length + 1, laneScreens[0]?.totalSteps ?? 1),
            ctaLabel: "Continue",
            fields: [],
        };
        updateLane((screens) => [...screens, created]);
        setSelectedScreen(created.key);
        setSelectedField(null);
    };

    const duplicateScreen = (key: string) => {
        const source = laneScreens.find((item) => item.key === key);
        if (!source) return;
        const seq = nextSequence();
        const copy: FlowScreen = {
            ...source,
            key: `${source.key}-copy-${seq}`,
            title: `${source.title} (copy)`,
            fields: source.fields.map((item, index) => ({ ...item, id: `${item.id}-c${seq}${index}` })),
        };
        const index = laneScreens.findIndex((item) => item.key === key);
        updateLane((screens) => [...screens.slice(0, index + 1), copy, ...screens.slice(index + 1)]);
    };

    const removeScreen = (key: string) => {
        updateLane((screens) => screens.filter((item) => item.key !== key));
        if (selectedScreen === key) {
            setSelectedScreen(null);
            setSelectedField(null);
        }
    };

    const moveScreen = (key: string, direction: -1 | 1) => {
        const index = laneScreens.findIndex((item) => item.key === key);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= laneScreens.length) return;
        updateLane((screens) => {
            const next = [...screens];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const addBranch = (branch: FlowBranch) => {
        update((current) => ({ ...current, branches: { ...current.branches, [branch.id]: branch } }));
        setBranchDialog(false);
        setLane(branch.id);
        setSelectedScreen(branch.screens[0]?.key ?? null);
        setSelectedField(null);
    };

    const removeBranch = (id: string) => {
        update((current) => {
            const branches = { ...current.branches };
            delete branches[id];
            return { ...current, branches };
        });
        if (lane === id) {
            setLane(MAIN);
            setSelectedScreen(flow.screens[0]?.key ?? null);
            setSelectedField(null);
        }
    };

    /** Opens the lane, the screen and the field an issue points at, and scrolls the board there. */
    const showIssue = (target: WizardIssueTarget) => {
        setLane(laneOf(target));
        const screens = target.lane === null ? flow.screens : (flow.branches[target.lane]?.screens ?? []);
        setSelectedScreen(target.screenKey ?? screens[0]?.key ?? null);
        setSelectedField(target.fieldId);
        jump(anchorOf(target));
    };

    /** E10-2: each refusal resolved to a place on the board, and the first one opened. */
    const refuse = (lines: FlowIssue[]) => {
        const resolved: BoardIssue[] = lines.map((issue) => ({ ...issue, target: resolveWizardIssue(flow, issue.path) }));
        setIssues(resolved);
        const first = resolved.find((issue) => issue.target);
        if (first?.target) showIssue(first.target);
    };

    async function save() {
        // A kind the vocabulary does not name is refused here, before the PATCH the server would 400.
        const foreign = unknownKinds(flow, kinds);
        if (foreign.length > 0) {
            refuse(foreign);
            return;
        }
        setBusy(true);
        setIssues([]);
        try {
            const saved = await flowService.save(flowKey, flow);
            setDirty(false);
            toast.success(`Saved ${flow.label} as version ${(saved as WizardFlow).version ?? "?"}`, {
                description: "The mobile apps pick this up on their next config refresh.",
            });
            onSaved();
        } catch (cause) {
            refuse(flowIssues(cause));
        } finally {
            setBusy(false);
        }
    }

    /** The refusals on this lane, by what they land on: the lane itself, a screen, a field, a field's prop. */
    const laneIssues = issues.filter((issue) => issue.target && laneOf(issue.target) === lane);
    const issuesOnLane = laneIssues.filter((issue) => issue.target?.screenKey === null && !issue.target?.fieldId);
    const issuesOnScreen = (key: string) => laneIssues.filter((issue) => issue.target?.screenKey === key && !issue.target?.fieldId);
    const issuesOnField = (screenKey: string, id: string) => laneIssues.filter((issue) => issue.target?.screenKey === screenKey && issue.target?.fieldId === id);
    /** The selected field's prop-level refusals, keyed by prop — what the editor outlines. */
    const propIssues: Record<string, string> = {};
    if (screen && field) {
        for (const issue of issuesOnField(screen.key, field.id)) if (issue.target?.prop) propIssues[issue.target.prop] = issue.message;
    }
    const laneIssueCount = (key: string) => issues.filter((issue) => issue.target && laneOf(issue.target) === key).length;
    /** The selected screen's own prop refusal (`key`, `title`…), if any. */
    const screenProp = (prop: string): string | undefined =>
        screen ? issuesOnScreen(screen.key).find((issue) => issue.target?.prop === prop)?.message : undefined;

    const lanes = [
        { key: MAIN, label: "Main flow" },
        ...Object.values(flow.branches).map((branch) => ({ key: branch.id, label: branch.title })),
    ];

    /** Options of the branching field name the branches; an option without one is a refusal waiting. */
    const branchingOptions = flow.screens.flatMap((item) => item.fields.filter((candidate) => candidate.branching)).flatMap((candidate) => candidate.options ?? []);
    const untargeted = Object.keys(flow.branches).filter((id) => !branchingOptions.some((option) => option.id === id));
    const missingBranches = branchingOptions.filter((option) => !flow.branches[option.id]).map((option) => option.id);

    return (
        <div className="space-y-4">
            <BoardHeader
                flowKey={flowKey}
                label={flow.label}
                description={flow.description ?? ""}
                audience={flow.audience ?? ""}
                version={flow.version}
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
                    {lanes.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                                setLane(item.key);
                                setSelectedScreen((item.key === MAIN ? flow.screens : flow.branches[item.key]?.screens)?.[0]?.key ?? null);
                                setSelectedField(null);
                            }}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                                lane === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                                laneIssueCount(item.key) > 0 && lane !== item.key && "text-danger",
                            )}
                        >
                            {item.key !== MAIN && <GitBranch className="size-3.5" />}
                            {item.label}
                            {laneIssueCount(item.key) > 0 && (
                                <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", lane === item.key ? "bg-primary-foreground/20" : "bg-danger-soft text-danger")}>
                                    {laneIssueCount(item.key)}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <Button variant="outline" size="sm" className="bg-card" onClick={() => setBranchDialog(true)}>
                    <Plus className="size-3.5" />
                    Add branch
                </Button>
                {lane !== MAIN && (
                    <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => removeBranch(lane)}>
                        <Trash2 className="size-3.5" />
                        Remove this branch
                    </Button>
                )}
                {(untargeted.length > 0 || missingBranches.length > 0) && (
                    <p className="text-xs text-warning">
                        {missingBranches.length > 0 && `Option${missingBranches.length === 1 ? "" : "s"} ${missingBranches.join(", ")} branch${missingBranches.length === 1 ? "es" : ""} to no branch. `}
                        {untargeted.length > 0 && `Branch${untargeted.length === 1 ? "" : "es"} ${untargeted.join(", ")} ${untargeted.length === 1 ? "is" : "are"} not the target of any option.`}
                    </p>
                )}
            </div>

            <div className="grid gap-4 xl:grid-cols-[280px_1fr_340px]">
                {/* Screens rail */}
                <div className="space-y-2.5">
                    {issuesOnLane.length > 0 && (
                        <div data-issue-anchor={`lane:${lane}`}>
                            {issuesOnLane.map((issue, index) => (
                                <IssueNote key={index} message={issue.message} pointer={issue.pointer} />
                            ))}
                        </div>
                    )}
                    {lane !== MAIN && flow.branches[lane] && (
                        <Card className={cn("space-y-2 rounded-lg border-border p-3.5 shadow-none", issuesOnLane.length > 0 && "ring-2 ring-danger")}>
                            <div className="grid gap-1.5">
                                <Label htmlFor="branch-title">Branch title</Label>
                                <Input
                                    id="branch-title"
                                    value={flow.branches[lane].title}
                                    onChange={(event) =>
                                        update((current) => ({
                                            ...current,
                                            branches: { ...current.branches, [lane]: { ...current.branches[lane], title: event.target.value } },
                                        }))
                                    }
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="branch-description">Description</Label>
                                <Input
                                    id="branch-description"
                                    value={flow.branches[lane].description}
                                    onChange={(event) =>
                                        update((current) => ({
                                            ...current,
                                            branches: {
                                                ...current.branches,
                                                [lane]: { ...current.branches[lane], description: event.target.value },
                                            },
                                        }))
                                    }
                                />
                            </div>
                        </Card>
                    )}
                    {laneScreens.map((item, index) => (
                        <Card
                            key={item.key}
                            data-issue-anchor={`screen:${lane}:${item.key}`}
                            className={cn(
                                "cursor-pointer rounded-lg border-border p-3.5 shadow-none transition-colors",
                                selectedScreen === item.key ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40",
                                (issuesOnScreen(item.key).length > 0 || item.fields.some((candidate) => issuesOnField(item.key, candidate.id).length > 0)) && "ring-2 ring-danger",
                            )}
                            onClick={() => {
                                setSelectedScreen(item.key);
                                setSelectedField(null);
                            }}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-start gap-2">
                                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                        {item.badge ?? (item.step > item.totalSteps ? "·" : item.step)}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            <code>{item.key}</code> · {item.fields.length} {item.fields.length === 1 ? "field" : "fields"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center">
                                    <RailButton label={`Move ${item.title} up`} disabled={index === 0} onClick={() => moveScreen(item.key, -1)}>
                                        <ArrowUp className="size-3.5" />
                                    </RailButton>
                                    <RailButton
                                        label={`Move ${item.title} down`}
                                        disabled={index === laneScreens.length - 1}
                                        onClick={() => moveScreen(item.key, 1)}
                                    >
                                        <ArrowDown className="size-3.5" />
                                    </RailButton>
                                    <RailButton label={`Duplicate ${item.title}`} onClick={() => duplicateScreen(item.key)}>
                                        <Copy className="size-3.5" />
                                    </RailButton>
                                    <RailButton label={`Delete ${item.title}`} danger onClick={() => removeScreen(item.key)}>
                                        <Trash2 className="size-3.5" />
                                    </RailButton>
                                </div>
                            </div>
                            {issuesOnScreen(item.key).map((issue, issueIndex) => (
                                <IssueNote key={issueIndex} message={issue.message} pointer={issue.pointer} className="mt-2" />
                            ))}
                        </Card>
                    ))}
                    <button
                        type="button"
                        onClick={addScreen}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                        <Plus className="size-3.5" />
                        Add screen
                    </button>
                </div>

                {/* Screen editor */}
                {screen ? (
                    <Card className="h-fit rounded-lg border-border shadow-none">
                        <div className="space-y-3 border-b px-5 py-4">
                            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="screen-title">Screen title</Label>
                                    <Input
                                        id="screen-title"
                                        value={screen.title}
                                        className={cn(screenProp("title") && "ring-2 ring-danger")}
                                        onChange={(event) => patchScreen(screen.key, { title: event.target.value })}
                                    />
                                    {screenProp("title") && <IssueNote message={screenProp("title")!} />}
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="screen-key">Key</Label>
                                    <Input
                                        id="screen-key"
                                        value={screen.key}
                                        className={cn(screenProp("key") && "ring-2 ring-danger")}
                                        onChange={(event) => {
                                            const key = event.target.value;
                                            patchScreen(screen.key, { key });
                                            setSelectedScreen(key);
                                        }}
                                    />
                                    {screenProp("key") && <IssueNote message={screenProp("key")!} />}
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="screen-subtitle">Subtitle</Label>
                                <Input
                                    id="screen-subtitle"
                                    value={screen.subtitle ?? ""}
                                    onChange={(event) => patchScreen(screen.key, { subtitle: event.target.value || undefined })}
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-4">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="screen-step">Step</Label>
                                    <Input
                                        id="screen-step"
                                        type="number"
                                        min={1}
                                        max={99}
                                        value={screen.step}
                                        onChange={(event) => patchScreen(screen.key, { step: Number(event.target.value) || 1 })}
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="screen-total">Of</Label>
                                    <Input
                                        id="screen-total"
                                        type="number"
                                        min={1}
                                        max={99}
                                        value={screen.totalSteps}
                                        onChange={(event) => patchScreen(screen.key, { totalSteps: Number(event.target.value) || 1 })}
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="screen-badge">Badge</Label>
                                    <Input
                                        id="screen-badge"
                                        value={screen.badge ?? ""}
                                        placeholder="Unnumbered"
                                        onChange={(event) => patchScreen(screen.key, { badge: event.target.value || undefined })}
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="screen-cta">Button label</Label>
                                    <Input id="screen-cta" value={screen.ctaLabel} onChange={(event) => patchScreen(screen.key, { ctaLabel: event.target.value })} />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                A step past the total is an unnumbered screen; the badge is printed in place of the counter.
                            </p>
                        </div>
                        <ul className="divide-y">
                            {screen.fields.map((item, index) => {
                                const fieldIssues = issuesOnField(screen.key, item.id);
                                return (
                                <li
                                    key={item.id}
                                    data-issue-anchor={`field:${lane}:${screen.key}:${item.id}`}
                                    className={cn("flex flex-wrap items-center", fieldIssues.length > 0 && "bg-danger-soft/60 ring-2 ring-inset ring-danger")}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setSelectedField(item.id)}
                                        className={cn(
                                            "flex min-w-0 flex-1 items-center gap-3 px-5 py-3 text-left transition-colors",
                                            selectedField === item.id ? "bg-primary/5" : "hover:bg-muted/40",
                                        )}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {item.label}
                                                {item.required && <span className="ml-1 text-danger">*</span>}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                <code>{item.id}</code>
                                                {item.options ? ` · ${item.options.map((option) => option.title).join(" · ")}` : ""}
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                            {specOf(item.type)?.label ?? item.type}
                                        </span>
                                        {item.branching && <GitBranch className="size-3.5 shrink-0 text-primary" />}
                                    </button>
                                    <div className="flex shrink-0 items-center pr-3">
                                        <RailButton label={`Move ${item.label} up`} disabled={index === 0} onClick={() => moveField(item.id, -1)}>
                                            <ArrowUp className="size-3.5" />
                                        </RailButton>
                                        <RailButton
                                            label={`Move ${item.label} down`}
                                            disabled={index === screen.fields.length - 1}
                                            onClick={() => moveField(item.id, 1)}
                                        >
                                            <ArrowDown className="size-3.5" />
                                        </RailButton>
                                    </div>
                                    {fieldIssues.length > 0 && (
                                        <div className="w-full px-5 pb-3">
                                            {fieldIssues.map((issue, issueIndex) => (
                                                <IssueNote key={issueIndex} message={issue.message} pointer={issue.pointer} />
                                            ))}
                                        </div>
                                    )}
                                </li>
                                );
                            })}
                        </ul>
                        <div className="border-t px-5 py-3.5">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="bg-card">
                                        <Plus className="size-4" />
                                        Add field
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                                    {kinds.map((kindSpec) => (
                                        <DropdownMenuItem key={kindSpec.kind} onClick={() => addField(kindSpec)}>
                                            <span className="flex flex-col">
                                                <span>{kindSpec.label}</span>
                                                <span className="text-[11px] text-muted-foreground">{kindSpec.note}</span>
                                            </span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </Card>
                ) : (
                    <Card className="flex h-48 items-center justify-center rounded-lg border-dashed border-border shadow-none">
                        <p className="text-sm text-muted-foreground">Select a screen on the left to edit it.</p>
                    </Card>
                )}

                {/* Field editor */}
                <Card className="h-fit rounded-lg border-border shadow-none">
                    <div className="border-b px-5 py-4">
                        <h2 className="text-sm font-semibold text-foreground">Field settings</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">{spec ? spec.note : field ? `Unknown kind "${field.type}"` : "Pick a field to edit its settings"}</p>
                    </div>
                    {field ? (
                        <FieldEditor
                            field={field}
                            spec={spec}
                            kinds={kinds}
                            commonProps={wizard.commonProps}
                            computedOps={wizard.computedOps}
                            contentScopes={wizard.contentScopes}
                            earlierIds={earlierIds}
                            issues={propIssues}
                            onPatch={patchField}
                            onRetype={(next) => replaceField(retypeField(field, next, wizard.commonProps))}
                            onRemove={() => removeField(field.id)}
                        />
                    ) : (
                        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing selected.</p>
                    )}
                </Card>
            </div>

            <BranchDialog
                open={branchDialog}
                existing={Object.keys(flow.branches)}
                suggestions={missingBranches}
                onClose={() => setBranchDialog(false)}
                onCreate={addBranch}
            />
        </div>
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

/**
 * One field's props, driven by its kind's spec.
 *
 * The common seven are always offered (`required` only when the kind
 * collects an answer); the rest appear only when `spec.props` names them,
 * so the board cannot store a `switch` with `options` or a `text` that
 * branches — the two things the server refuses first.
 */
function FieldEditor({
    field,
    spec,
    kinds,
    commonProps,
    computedOps,
    contentScopes,
    earlierIds,
    issues,
    onPatch,
    onRetype,
    onRemove,
}: {
    field: FlowField;
    spec: FieldKindSpec | undefined;
    kinds: FieldKindSpec[];
    commonProps: string[];
    computedOps: string[];
    contentScopes: string[];
    earlierIds: string[];
    /** E10-2: the server's refusal per prop of this field — the control is outlined and the message sits beside it. */
    issues: Record<string, string>;
    onPatch: (patch: Partial<FlowField>) => void;
    onRetype: (next: FieldKindSpec) => void;
    onRemove: () => void;
}) {
    const allowed = allowedProps(spec, commonProps);
    const has = (prop: string) => allowed.has(prop);
    /** The outline for a refused prop, and the note under it. */
    const flagged = (prop: string) => (issues[prop] ? "ring-2 ring-danger" : undefined);
    const note = (prop: string) => (issues[prop] ? <IssueNote message={issues[prop]} /> : null);
    /** A prop the server refused that the kind does not even offer a control for — said once, at the top. */
    const orphaned = Object.keys(issues).filter((prop) => !has(prop) && !["id", "label", "type", "required"].includes(prop));
    const [optionsText, setOptionsText] = React.useState(() => optionsToText(field.options));
    const [seenField, setSeenField] = React.useState(field.id);
    if (seenField !== field.id) {
        setSeenField(field.id);
        setOptionsText(optionsToText(field.options));
    }

    const toggle = (prop: keyof FlowField, label: string, help?: string) => (
        <div key={prop} data-issue-anchor={`prop:${prop}`}>
            <label className={cn("flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5", flagged(prop))}>
                <span>
                    <span className="block text-sm text-foreground">{label}</span>
                    {help && <span className="block text-xs text-muted-foreground">{help}</span>}
                </span>
                <Switch checked={Boolean(field[prop])} onCheckedChange={(checked) => onPatch({ [prop]: checked } as Partial<FlowField>)} />
            </label>
            {note(prop)}
        </div>
    );

    return (
        <div className="space-y-4 px-5 py-4">
            {orphaned.map((prop) => (
                <IssueNote key={prop} message={issues[prop]} pointer={prop} />
            ))}
            <div className="grid gap-1.5" data-issue-anchor="prop:type">
                <Label htmlFor="field-kind">Kind</Label>
                <Select
                    value={field.type}
                    onValueChange={(next) => {
                        const target = kinds.find((candidate) => candidate.kind === next);
                        if (target) onRetype(target);
                    }}
                >
                    <SelectTrigger id="field-kind" className={flagged("type")}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                        {kinds.map((candidate) => (
                            <SelectItem key={candidate.kind} value={candidate.kind}>
                                {candidate.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {note("type")}
                <p className="text-xs text-muted-foreground">Changing the kind drops props the new kind does not read.</p>
            </div>
            <div className="grid gap-1.5" data-issue-anchor="prop:id">
                <Label htmlFor="field-id">Id</Label>
                <Input id="field-id" value={field.id} className={flagged("id")} onChange={(event) => onPatch({ id: event.target.value })} />
                {note("id")}
                <p className="text-xs text-muted-foreground">Unique on any one root-plus-branch path. Other fields refer to it.</p>
            </div>
            <div className="grid gap-1.5" data-issue-anchor="prop:label">
                <Label htmlFor="field-label">Label</Label>
                <Input id="field-label" value={field.label} className={flagged("label")} onChange={(event) => onPatch({ label: event.target.value })} />
                {note("label")}
            </div>
            {has("placeholder") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:placeholder">
                    <Label htmlFor="field-placeholder">Placeholder</Label>
                    <Input id="field-placeholder" value={field.placeholder ?? ""} className={flagged("placeholder")} onChange={(event) => onPatch({ placeholder: event.target.value })} />
                    {note("placeholder")}
                </div>
            )}
            {has("hint") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:hint">
                    <Label htmlFor="field-hint">Hint</Label>
                    <Input id="field-hint" value={field.hint ?? ""} className={flagged("hint")} onChange={(event) => onPatch({ hint: event.target.value })} placeholder="Shown under the field" />
                    {note("hint")}
                </div>
            )}
            {has("description") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:description">
                    <Label htmlFor="field-description">Description</Label>
                    <Textarea
                        id="field-description"
                        rows={2}
                        value={field.description ?? ""}
                        className={flagged("description")}
                        onChange={(event) => onPatch({ description: event.target.value })}
                        placeholder={field.type === "checkbox" ? "The statement to tick" : undefined}
                    />
                    {note("description")}
                </div>
            )}
            {has("options") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:options">
                    <Label htmlFor="field-options">
                        Options{spec?.requires.includes("options") ? "" : " (optional)"} — <code>id | title | description</code>, one a line
                    </Label>
                    <Textarea
                        id="field-options"
                        rows={5}
                        className={cn("font-mono text-xs", flagged("options"))}
                        value={optionsText}
                        onChange={(event) => {
                            setOptionsText(event.target.value);
                            const parsed = textToOptions(event.target.value);
                            onPatch({ options: parsed.length > 0 ? parsed : undefined });
                        }}
                    />
                    {note("options")}
                    {field.type === "document-upload" && (
                        <p className="text-xs text-muted-foreground">Each id is a ListingDocumentKind — OWNER_NOC, ADDRESS_PROOF, DISPLAY_AGREEMENT…</p>
                    )}
                    {field.type === "city" && <p className="text-xs text-muted-foreground">Suggestions only; the City table is the source at seed time.</p>}
                </div>
            )}
            {has("dependsOn") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:dependsOn">
                    <Label htmlFor="field-depends">Depends on</Label>
                    <Select value={field.dependsOn ?? "__none__"} onValueChange={(next) => onPatch({ dependsOn: next === "__none__" ? undefined : next })}>
                        <SelectTrigger id="field-depends" className={flagged("dependsOn")}>
                            <SelectValue placeholder="No dependency" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">No dependency</SelectItem>
                            {earlierIds.map((id) => (
                                <SelectItem key={id} value={id}>
                                    {id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {note("dependsOn")}
                    <p className="text-xs text-muted-foreground">A field asked earlier on this path — the venue a spot type is filtered by, say.</p>
                </div>
            )}
            {has("groupBy") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:groupBy">
                    <Label htmlFor="field-group">Group by</Label>
                    <Input id="field-group" value={field.groupBy ?? ""} className={flagged("groupBy")} onChange={(event) => onPatch({ groupBy: event.target.value })} placeholder="formatGroup" />
                    {note("groupBy")}
                </div>
            )}
            {has("from") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:from">
                    <Label htmlFor="field-from">From{spec?.requires.includes("from") ? "" : " (optional)"} — field ids, comma separated</Label>
                    <Input
                        id="field-from"
                        className={flagged("from")}
                        value={(field.from ?? []).join(", ")}
                        onChange={(event) => {
                            const ids = event.target.value.split(",").map((part) => part.trim()).filter(Boolean);
                            onPatch({ from: ids.length > 0 ? ids : undefined });
                        }}
                        placeholder={earlierIds.slice(-2).join(", ")}
                    />
                    {note("from")}
                    <p className="text-xs text-muted-foreground">Earlier fields: {earlierIds.length ? earlierIds.join(", ") : "none yet"}</p>
                </div>
            )}
            {has("op") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:op">
                    <Label htmlFor="field-op">Operation</Label>
                    <Select value={field.op ?? "__none__"} onValueChange={(next) => onPatch({ op: next === "__none__" ? undefined : next })}>
                        <SelectTrigger id="field-op" className={flagged("op")}>
                            <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {computedOps.map((op) => (
                                <SelectItem key={op} value={op}>
                                    {op}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {note("op")}
                </div>
            )}
            {has("scope") && (
                <div className="grid gap-1.5" data-issue-anchor="prop:scope">
                    <Label htmlFor="field-scope">Scope</Label>
                    <Select value={field.scope ?? contentScopes[0] ?? ""} onValueChange={(next) => onPatch({ scope: next })}>
                        <SelectTrigger id="field-scope" className={flagged("scope")}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {contentScopes.map((scope) => (
                                <SelectItem key={scope} value={scope}>
                                    {scope}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {note("scope")}
                </div>
            )}
            <div className="space-y-2">
                {spec?.input && toggle("required", "Required")}
                {has("branching") && toggle("branching", "Branches the flow", "Each option id becomes the key of a branch")}
                {has("filterByCategory") && toggle("filterByCategory", "Filter by category", "Narrow the venues to this branch's category")}
                {has("readOnly") && toggle("readOnly", "Read only")}
                {has("showIndicator") && toggle("showIndicator", "Show the price indicator", "The comparable band under the amount")}
                {has("aiAssist") && toggle("aiAssist", "AI assist", "The assist button beside the box")}
            </div>
            <Button variant="outline" size="sm" className="w-full bg-card text-danger hover:text-danger" onClick={onRemove}>
                <Trash2 className="size-4" />
                Remove field
            </Button>
        </div>
    );
}

/** A branch is a lane keyed by the option that opens it; it needs one screen to be stored. */
function BranchDialog({
    open,
    existing,
    suggestions,
    onClose,
    onCreate,
}: {
    open: boolean;
    existing: string[];
    suggestions: string[];
    onClose: () => void;
    onCreate: (branch: FlowBranch) => void;
}) {
    const [id, setId] = React.useState("");
    const [title, setTitle] = React.useState("");
    const [description, setDescription] = React.useState("");
    const taken = existing.includes(id.trim());
    const valid = id.trim().length > 0 && title.trim().length > 0 && !taken;

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Add a branch</DialogTitle>
                    <DialogDescription>
                        The id is the option that opens it — an option of the branching field on the main flow. The branch starts with one empty screen.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="branch-id">Option id</Label>
                        <Input id="branch-id" value={id} onChange={(event) => setId(event.target.value)} placeholder={suggestions[0] ?? "outdoor"} />
                        {suggestions.length > 0 && (
                            <p className="text-xs text-muted-foreground">Options without a branch yet: {suggestions.join(", ")}</p>
                        )}
                        {taken && <p className="text-xs text-danger">A branch with this id already exists.</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="branch-new-title">Title</Label>
                        <Input id="branch-new-title" value={title} onChange={(event) => setTitle(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="branch-new-description">Description</Label>
                        <Input id="branch-new-description" value={description} onChange={(event) => setDescription(event.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!valid}
                        onClick={() => {
                            onCreate({
                                id: id.trim(),
                                title: title.trim(),
                                description: description.trim(),
                                screens: [{ key: "venue", title: "New screen", step: 1, totalSteps: 1, ctaLabel: "Continue", fields: [] }],
                            });
                            setId("");
                            setTitle("");
                            setDescription("");
                        }}
                    >
                        Add branch
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
