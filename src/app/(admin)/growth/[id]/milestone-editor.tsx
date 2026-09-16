"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, Minus, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import {
    MILESTONE_TYPE_META,
    growthService,
    milestoneTypeLabel,
    targetLabel,
    templatePatch,
    windowLabel,
    type TemplateRow,
} from "@/services/growth";
import type { StatusMeta } from "@/types";
import { Field, draftProblems, fromTemplate, toDraft, type TemplateFormValues } from "../template-fields";

interface MilestoneEditorProps {
    template: TemplateRow;
    /** Every template, for the rail. */
    templates: TemplateRow[];
    /** Refetches after a save actually lands. */
    onSaved: () => void;
}

/** The rail's badge: the one switch a template has. */
const ACTIVE_META: Record<"on" | "off", StatusMeta> = {
    on: { label: "Active", tone: "success" },
    off: { label: "Off", tone: "neutral" },
};

/** The frame's duration options, plus whatever this template already holds. */
const WINDOW_CHOICES = [30, 45, 60, 90];
const ALL_TIME = "ALL";

/**
 * The DR 10 frame's editor — rail, form, preview — over `GET` and `PATCH
 * /milestones/templates/:id`.
 *
 * The frame's controls that describe things the backend does not have are
 * gone rather than left inert: the audience (every agent climbs one ladder),
 * the target event (progress is derived on read), auto-enrol (every active
 * template is on every board) and push on unlock (not wired). In their place
 * are the three the contract does have — the start, the lock and the order —
 * and the one switch that folds live / paused / draft into a fact: Active.
 *
 * "Publish changes" is "Save changes": there is no publish step, the Active
 * switch is the publish. Only what changed goes on the wire (`templatePatch`),
 * so the server's "Nothing to change" cannot fire by accident and the
 * activity log says what ops did.
 */
export function MilestoneEditor({ template, templates, onSaved }: MilestoneEditorProps) {
    const [values, setValues] = React.useState<TemplateFormValues>(() => fromTemplate(template));
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const problems = draftProblems(values);
    const valid = Object.keys(problems).length === 0;
    const patch = valid ? templatePatch(template, toDraft(values)) : {};
    /** Something to send. */
    const dirty = Object.keys(patch).length > 0;
    /** Something typed, valid or not — what Discard throws away. */
    const stored = fromTemplate(template);
    const edited = (Object.keys(stored) as (keyof TemplateFormValues)[]).some((key) => values[key] !== stored[key]);
    const meta = MILESTONE_TYPE_META[template.type as keyof typeof MILESTONE_TYPE_META];

    const set =
        (key: keyof TemplateFormValues) =>
        (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const value = event.target.value;
            setValues((current) => ({ ...current, [key]: value }));
        };

    const errorFor = (key: keyof TemplateFormValues): string | undefined => fieldErrors[key]?.[0] ?? problems[key];

    function discard() {
        setValues(fromTemplate(template));
        setFieldErrors({});
        setFormError(null);
    }

    async function save() {
        if (!dirty || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const saved = await growthService.patchTemplate(template.id, patch);
            toast.success(`${saved.title} saved`, {
                description: saved.isActive
                    ? "Live on every agent's board from their next read."
                    : "Saved, and switched off — on nobody's board until it is turned on.",
            });
            onSaved();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not save the milestone.");
            }
        } finally {
            setBusy(false);
        }
    }

    const windowValue = values.windowDays.trim() === "" ? ALL_TIME : values.windowDays.trim();
    const windowChoices = WINDOW_CHOICES.includes(Number(windowValue)) || windowValue === ALL_TIME
        ? WINDOW_CHOICES
        : [...WINDOW_CHOICES, Number(windowValue)].sort((a, b) => a - b);

    /* The preview draws the card before any progress: the editor knows no
       agent, and a bar filled to an invented figure would be a figure. */
    const previewTarget = Number(values.target) > 0 ? Number(values.target) : template.target;

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/growth"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Growth CMS
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Milestone program</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {milestoneTypeLabel(template.type)} · {targetLabel(template.type, template.target)} ·{" "}
                            {template.isActive ? "on every agent's board" : "switched off"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" disabled={!edited || busy} onClick={discard}>
                            Discard
                        </Button>
                        <Button disabled={!dirty || !valid || busy} onClick={() => void save()}>
                            {busy ? "Saving…" : "Save changes"}
                        </Button>
                    </div>
                </div>
            </div>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <div className="grid gap-4 xl:grid-cols-12">
                {/* Milestone list rail */}
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-3">
                    <h3 className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Milestones
                    </h3>
                    <ul className="divide-y">
                        {templates.map((row) => {
                            const active = row.id === template.id;
                            return (
                                <li key={row.id}>
                                    <Link
                                        href={`/growth/${row.id}`}
                                        aria-current={active ? "page" : undefined}
                                        className={cn(
                                            "block px-4 py-3 transition-colors",
                                            active ? "bg-primary/[0.04]" : "hover:bg-muted/50",
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
                                            <StatusBadge status={ACTIVE_META[row.isActive ? "on" : "off"]} />
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{railLine(row)}</p>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </Card>

                {/* Form */}
                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Milestone details</h3>
                    <div className="mt-4 space-y-4">
                        <Field id="ms-title" label="Title" error={errorFor("title")}>
                            <Input id="ms-title" value={values.title} onChange={set("title")} autoComplete="off" />
                        </Field>
                        <Field id="ms-desc" label="Description" error={errorFor("description")}>
                            <Textarea
                                id="ms-desc"
                                value={values.description}
                                onChange={set("description")}
                                className="min-h-20 resize-none"
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field id="ms-target" label="Target count" hint={`In ${meta?.unit ?? "units"}.`} error={errorFor("target")}>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="size-9 shrink-0"
                                        aria-label="Decrease target"
                                        onClick={() =>
                                            setValues((current) => ({
                                                ...current,
                                                target: String(Math.max(1, (Number(current.target) || 1) - 1)),
                                            }))
                                        }
                                    >
                                        <Minus className="size-4" />
                                    </Button>
                                    <Input
                                        id="ms-target"
                                        value={values.target}
                                        onChange={set("target")}
                                        inputMode="numeric"
                                        className="text-center"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="size-9 shrink-0"
                                        aria-label="Increase target"
                                        onClick={() =>
                                            setValues((current) => ({
                                                ...current,
                                                target: String((Number(current.target) || 0) + 1),
                                            }))
                                        }
                                    >
                                        <Plus className="size-4" />
                                    </Button>
                                </div>
                            </Field>
                            <Field
                                id="ms-reward"
                                label="Reward (₹)"
                                hint="Recorded on claim, released by ADX finance."
                                error={errorFor("rewardAmount")}
                            >
                                <Input
                                    id="ms-reward"
                                    value={values.rewardAmount}
                                    inputMode="decimal"
                                    onChange={set("rewardAmount")}
                                    autoComplete="off"
                                />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Field id="ms-window" label="Duration" hint="How long the window runs once it starts." error={errorFor("windowDays")}>
                                <Select
                                    value={windowValue}
                                    onValueChange={(value) =>
                                        setValues((current) => ({ ...current, windowDays: value === ALL_TIME ? "" : value }))
                                    }
                                >
                                    <SelectTrigger id="ms-window">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL_TIME}>All time</SelectItem>
                                        {windowChoices.map((days) => (
                                            <SelectItem key={days} value={String(days)}>
                                                {days} days
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field
                                id="ms-starts"
                                label="Starts"
                                optional
                                hint="Empty starts the clock when the agent first sees it."
                                error={errorFor("startsAt")}
                            >
                                <Input id="ms-starts" type="datetime-local" value={values.startsAt} onChange={set("startsAt")} />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Field
                                id="ms-unlock"
                                label="Unlock after"
                                optional
                                hint="Milestones an agent must complete before this one opens."
                                error={errorFor("unlockAfter")}
                            >
                                <Input id="ms-unlock" type="number" min={0} inputMode="numeric" value={values.unlockAfter} onChange={set("unlockAfter")} placeholder="0" />
                            </Field>
                            <Field id="ms-order" label="Order" hint="Where it sits on the board; lower first." error={errorFor("sortOrder")}>
                                <Input id="ms-order" type="number" min={0} inputMode="numeric" value={values.sortOrder} onChange={set("sortOrder")} />
                            </Field>
                        </div>

                        <div className="space-y-3 border-t pt-4">
                            <label className="flex items-center justify-between gap-4">
                                <span>
                                    <span className="block text-sm font-medium text-foreground">Active</span>
                                    <span className="block text-xs text-muted-foreground">
                                        On every agent&rsquo;s board from their next read; off leaves every board
                                    </span>
                                </span>
                                <Switch
                                    checked={values.isActive}
                                    onCheckedChange={(checked) => setValues((current) => ({ ...current, isActive: checked }))}
                                />
                            </label>
                            <p className="text-xs text-muted-foreground">
                                Type: <span className="font-medium text-foreground">{milestoneTypeLabel(template.type)}</span>{" "}
                                — fixed once a milestone exists. To count something else, create a new one.
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Agent preview + what it counts */}
                <div className="space-y-4 xl:col-span-3">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Agent experience preview
                        </h3>
                        <div className="mt-4 rounded-lg border bg-canvas p-4">
                            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                <Sparkles className="size-3" />
                                Milestone
                            </p>
                            <p className="mt-2 text-sm font-semibold text-foreground">{values.title || "Untitled"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{values.description}</p>
                            <Progress value={0} className="mt-4 h-1.5" />
                            <div className="mt-2 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">0 of {previewTarget}</span>
                                <span className="font-medium text-foreground">0%</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-center">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reward</p>
                                    <p className="text-sm font-semibold text-foreground">
                                        {problems.rewardAmount ? "—" : formatMoney(values.rewardAmount.trim())}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Window</p>
                                    <p className="text-sm font-semibold text-foreground">
                                        {windowLabel(values.windowDays.trim() === "" ? null : Number(values.windowDays))}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            How the card renders in the ADX agent app before any progress. Each agent&rsquo;s own bar
                            is derived from their work when they open the board.
                        </p>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            What this counts
                        </h3>
                        <p className="mt-3 text-sm font-medium text-foreground">{milestoneTypeLabel(template.type)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {meta?.counts ?? "A type the console has not heard of; the server derives its progress."}
                        </p>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Progress is derived from the agent&rsquo;s own record every time their board is read;
                            nothing is incremented by hand. A claimed reward is recorded as an incentive and
                            released by ADX finance.
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
}

/** The rail's sub-line: when it starts, if ahead; otherwise what it is. */
function railLine(row: TemplateRow): string {
    if (row.startsAt && Date.parse(row.startsAt) > Date.now()) return `Starts ${formatDate(row.startsAt)}`;
    return `${milestoneTypeLabel(row.type)} · ${windowLabel(row.windowDays)}`;
}
