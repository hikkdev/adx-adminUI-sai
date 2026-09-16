"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import {
    durationLabel,
    modulePatch,
    passesForFree,
    trainingService,
    type ModuleRow,
    type ModuleWithQuestions,
} from "@/services/training";
import type { StatusMeta } from "@/types";
import { Field, draftProblems, fromModule, toDraft, type ModuleFormValues } from "../module-fields";
import { LessonPreview } from "./lesson-preview";
import { QuestionsEditor } from "./questions-editor";

interface ModuleEditorProps {
    module: ModuleWithQuestions;
    /** Every module, for the rail. */
    modules: ModuleRow[];
    /** Refetches after a save actually lands. */
    onSaved: () => void;
}

/** The rail's badge: the one switch a module has. */
const ACTIVE_META: Record<"on" | "off", StatusMeta> = {
    on: { label: "Active", tone: "success" },
    off: { label: "Off", tone: "neutral" },
};

const MAX_TAKEAWAYS = 10;

/**
 * The module editor — no DR 10 frame, so the milestone editor's shape: a
 * rail of modules, the form, and a preview of what the agent sees. Over
 * `GET /training/modules/:id/admin` and `PATCH /training/modules/:id`, with
 * the quiz in its own section below because it is saved through a different
 * endpoint and replaced whole.
 *
 * Only what changed goes on the wire (`modulePatch`), so the server's
 * "Nothing to change" cannot fire by accident. Its one ordering rule — a
 * module can only wait on one that comes before it — is checked here first
 * and, if it still fires, its sentence is shown inline under the form.
 */
export function ModuleEditor({ module, modules, onSaved }: ModuleEditorProps) {
    const [values, setValues] = React.useState<ModuleFormValues>(() => fromModule(module));
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [takeaway, setTakeaway] = React.useState("");

    const problems = draftProblems(values);
    const valid = Object.keys(problems).length === 0;
    const patch = valid ? modulePatch(module, toDraft(values)) : {};
    /** Something to send. */
    const dirty = Object.keys(patch).length > 0;
    /** Something typed, valid or not — what Discard throws away. */
    const stored = fromModule(module);
    const edited = (Object.keys(stored) as (keyof ModuleFormValues)[]).some(
        (key) => JSON.stringify(values[key]) !== JSON.stringify(stored[key]),
    );

    const set =
        (key: keyof ModuleFormValues) =>
        (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const value = event.target.value;
            setValues((current) => ({ ...current, [key]: value }));
        };

    const errorFor = (key: keyof ModuleFormValues): string | undefined => fieldErrors[key]?.[0] ?? problems[key];

    function discard() {
        setValues(fromModule(module));
        setTakeaway("");
        setFieldErrors({});
        setFormError(null);
    }

    async function save() {
        if (!dirty || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const saved = await trainingService.patchModule(module.id, patch);
            toast.success(`${saved.title} saved`, {
                description: saved.isActive
                    ? "Live on every agent's index from their next read."
                    : "Saved, and switched off — on nobody's index until it is turned on.",
            });
            onSaved();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not save the module.");
            }
        } finally {
            setBusy(false);
        }
    }

    const addTakeaway = () => {
        const line = takeaway.trim();
        if (!line || values.takeaways.length >= MAX_TAKEAWAYS) return;
        setValues((current) => ({ ...current, takeaways: [...current.takeaways, line] }));
        setTakeaway("");
    };
    const moveTakeaway = (index: number, direction: -1 | 1) =>
        setValues((current) => {
            const target = index + direction;
            if (target < 0 || target >= current.takeaways.length) return current;
            const takeaways = [...current.takeaways];
            [takeaways[index], takeaways[target]] = [takeaways[target], takeaways[index]];
            return { ...current, takeaways };
        });

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/training"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Training
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Module {module.ordinal}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {durationLabel(module.durationMins)} · {module.questionCount}{" "}
                            {module.questionCount === 1 ? "question" : "questions"} · pass at {module.passPercent}% ·{" "}
                            {module.isActive ? "on every agent's index" : "switched off"}
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

            {passesForFree(module) && (
                <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                    This module is active with no questions: it is on every agent&rsquo;s index and every agent passes it for
                    free. Add a quiz below, or switch it off.
                </p>
            )}

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <div className="grid gap-4 xl:grid-cols-12">
                {/* Module rail */}
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-3">
                    <h3 className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Modules
                    </h3>
                    <ul className="divide-y">
                        {modules.map((row) => {
                            const active = row.id === module.id;
                            return (
                                <li key={row.id}>
                                    <Link
                                        href={`/training/${row.id}`}
                                        aria-current={active ? "page" : undefined}
                                        className={cn(
                                            "block px-4 py-3 transition-colors",
                                            active ? "bg-primary/[0.04]" : "hover:bg-muted/50",
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {row.ordinal}. {row.title}
                                            </p>
                                            <StatusBadge status={ACTIVE_META[row.isActive ? "on" : "off"]} />
                                        </div>
                                        <p className={cn("mt-0.5 text-xs", passesForFree(row) ? "text-danger" : "text-muted-foreground")}>
                                            {row.questionCount} {row.questionCount === 1 ? "question" : "questions"} ·{" "}
                                            {durationLabel(row.durationMins)}
                                        </p>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </Card>

                {/* Form */}
                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Module details</h3>
                    <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <Field id="md-order" label="Order" hint="Where it sits on the index; lower first." error={errorFor("ordinal")}>
                                <Input id="md-order" type="number" min={1} inputMode="numeric" value={values.ordinal} onChange={set("ordinal")} />
                            </Field>
                            <Field id="md-duration" label="Duration (minutes)" optional error={errorFor("durationMins")}>
                                <Input id="md-duration" type="number" min={1} inputMode="numeric" value={values.durationMins} onChange={set("durationMins")} />
                            </Field>
                        </div>
                        <Field id="md-title" label="Title" error={errorFor("title")}>
                            <Input id="md-title" value={values.title} onChange={set("title")} autoComplete="off" />
                        </Field>
                        <Field id="md-summary" label="Summary" optional hint="One line under the title on the index." error={errorFor("summary")}>
                            <Textarea id="md-summary" value={values.summary} onChange={set("summary")} className="min-h-16 resize-none" />
                        </Field>
                        <Field id="md-video" label="Video URL" optional hint="Opened in the agent's browser; there is no in-app player." error={errorFor("videoUrl")}>
                            <Input id="md-video" value={values.videoUrl} onChange={set("videoUrl")} autoComplete="off" inputMode="url" placeholder="https://" />
                        </Field>

                        <Field id="md-lesson" label="Lesson" optional hint="Markdown: headings, paragraphs, lists, bold, italic and code." error={errorFor("lessonBody")}>
                            <Textarea id="md-lesson" value={values.lessonBody} onChange={set("lessonBody")} className="min-h-48 font-mono text-xs" />
                        </Field>

                        <Field id="md-transcript" label="Transcript" optional hint="Plain text under the video, for agents who cannot play it." error={errorFor("transcript")}>
                            <Textarea id="md-transcript" value={values.transcript} onChange={set("transcript")} className="min-h-24" />
                        </Field>

                        <div className="grid gap-1.5">
                            <p className="text-sm font-medium leading-none">
                                Takeaways
                                <span className="ml-1 font-normal text-muted-foreground">optional · up to {MAX_TAKEAWAYS}</span>
                            </p>
                            {values.takeaways.length > 0 && (
                                <ol className="space-y-1.5">
                                    {values.takeaways.map((line, index) => (
                                        <li key={`${index}-${line}`} className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-sm">
                                            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
                                            <span className="min-w-0 flex-1 truncate">{line}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-7"
                                                aria-label={`Move takeaway ${index + 1} up`}
                                                disabled={index === 0}
                                                onClick={() => moveTakeaway(index, -1)}
                                            >
                                                <ArrowUp className="size-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-7"
                                                aria-label={`Move takeaway ${index + 1} down`}
                                                disabled={index === values.takeaways.length - 1}
                                                onClick={() => moveTakeaway(index, 1)}
                                            >
                                                <ArrowDown className="size-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-7"
                                                aria-label={`Remove takeaway ${index + 1}`}
                                                onClick={() =>
                                                    setValues((current) => ({
                                                        ...current,
                                                        takeaways: current.takeaways.filter((_, i) => i !== index),
                                                    }))
                                                }
                                            >
                                                <X className="size-3.5" />
                                            </Button>
                                        </li>
                                    ))}
                                </ol>
                            )}
                            <div className="flex items-center gap-2">
                                <Input
                                    aria-label="New takeaway"
                                    value={takeaway}
                                    onChange={(event) => setTakeaway(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            addTakeaway();
                                        }
                                    }}
                                    placeholder="One thing the agent should remember"
                                    className="h-9"
                                    disabled={values.takeaways.length >= MAX_TAKEAWAYS}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 shrink-0 bg-card"
                                    disabled={!takeaway.trim() || values.takeaways.length >= MAX_TAKEAWAYS}
                                    onClick={addTakeaway}
                                >
                                    <Plus className="mr-1 size-3.5" />
                                    Add
                                </Button>
                            </div>
                            {problems.takeaways && <p className="text-xs text-danger">{problems.takeaways}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Field id="md-pass" label="Pass mark (%)" error={errorFor("passPercent")}>
                                <Input id="md-pass" type="number" min={1} max={100} inputMode="numeric" value={values.passPercent} onChange={set("passPercent")} />
                            </Field>
                            <Field
                                id="md-unlock"
                                label="Unlock after"
                                optional
                                hint="The order number of the module an agent must pass first."
                                error={errorFor("unlockAfterOrdinal")}
                            >
                                <Input id="md-unlock" type="number" min={1} inputMode="numeric" value={values.unlockAfterOrdinal} onChange={set("unlockAfterOrdinal")} placeholder="—" />
                            </Field>
                        </div>

                        <label className="flex items-center justify-between gap-4 border-t pt-4">
                            <span>
                                <span className="block text-sm font-medium text-foreground">Active</span>
                                <span className="block text-xs text-muted-foreground">
                                    On every agent&rsquo;s index from their next read; off leaves every index
                                </span>
                            </span>
                            <Switch
                                checked={values.isActive}
                                onCheckedChange={(checked) => setValues((current) => ({ ...current, isActive: checked }))}
                            />
                        </label>
                    </div>
                </Card>

                {/* Agent preview */}
                <div className="space-y-4 xl:col-span-3">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lesson preview</h3>
                        <div className="mt-4 rounded-lg border bg-canvas p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Module {values.ordinal || module.ordinal}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{values.title || "Untitled"}</p>
                            {values.summary && <p className="mt-1 text-xs text-muted-foreground">{values.summary}</p>}
                            <div className="mt-3 border-t pt-3">
                                <LessonPreview source={values.lessonBody} />
                            </div>
                            {values.takeaways.length > 0 && (
                                <div className="mt-3 border-t pt-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Key takeaways</p>
                                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-foreground">
                                        {values.takeaways.map((line, index) => (
                                            <li key={index}>{line}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            How the lesson reads in the ADX agent app. The quiz below is asked once the agent has read it.
                        </p>
                    </Card>
                </div>
            </div>

            {/* Keyed by the stored rows' ids: a PUT recreates them, so the
                editor restarts from what landed, while a save of the details
                above leaves half-written questions where they were. */}
            <QuestionsEditor
                key={module.questions.map((question) => question.id).join(",")}
                moduleId={module.id}
                stored={module.questions}
                onSaved={onSaved}
            />
        </div>
    );
}
