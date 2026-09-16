"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import {
    MAX_OPTIONS,
    MAX_QUESTIONS,
    MIN_OPTIONS,
    blankQuestion,
    draftsFrom,
    questionProblems,
    questionsBody,
    trainingService,
    type QuestionDraft,
    type WireQuestion,
} from "@/services/training";

interface QuestionsEditorProps {
    moduleId: string;
    /** The stored set, correctness included — the desk's read. */
    stored: WireQuestion[];
    /** Refetches after the set actually lands. */
    onSaved: () => void;
}

/**
 * The quiz, edited as a list and saved whole.
 *
 * `PUT /training/modules/:id/questions` replaces the set — there is no
 * per-question write — so this holds every question as a draft, checks the
 * schema's rules before sending (two to six options, one correct), and
 * sends the list. The radio beside each option is the one place in the
 * console that marks an answer correct; the agent's quiz never sees it.
 *
 * Old attempts keep their answers as JSON, so replacing the set does not
 * un-pass anyone; it changes what the next attempt is asked.
 */
export function QuestionsEditor({ moduleId, stored, onSaved }: QuestionsEditorProps) {
    const [drafts, setDrafts] = React.useState<QuestionDraft[]>(() => draftsFrom(stored));
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const problems = questionProblems(drafts);
    const valid = Object.keys(problems).length === 0;
    const dirty = JSON.stringify(questionsBody(drafts)) !== JSON.stringify(questionsBody(draftsFrom(stored)));

    const update = (index: number, change: (question: QuestionDraft) => QuestionDraft) =>
        setDrafts((current) => current.map((question, i) => (i === index ? change(question) : question)));

    const move = (index: number, direction: -1 | 1) =>
        setDrafts((current) => {
            const target = index + direction;
            if (target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });

    function discard() {
        setDrafts(draftsFrom(stored));
        setFormError(null);
    }

    async function save() {
        if (!dirty || !valid || busy) return;
        setBusy(true);
        setFormError(null);
        try {
            const saved = await trainingService.putQuestions(moduleId, drafts);
            toast.success(`${saved.length} ${saved.length === 1 ? "question" : "questions"} saved`, {
                description: "The next attempt is asked these. Attempts already scored keep their score.",
            });
            onSaved();
        } catch (cause) {
            setFormError(
                cause instanceof ApiError
                    ? cause.message
                    : cause instanceof Error
                      ? cause.message
                      : "Could not save the questions.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questions</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {drafts.length === 0
                            ? "No quiz yet. An active module with no questions is passed by every agent for free."
                            : `${drafts.length} ${drafts.length === 1 ? "question" : "questions"} · the radio marks the correct option; agents never see it.`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="bg-card" disabled={!dirty || busy} onClick={discard}>
                        Discard
                    </Button>
                    <Button disabled={!dirty || !valid || busy} onClick={() => void save()}>
                        {busy ? "Saving…" : "Save questions"}
                    </Button>
                </div>
            </div>

            {formError && <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <ol className="mt-4 space-y-4">
                {drafts.map((question, index) => {
                    const problem = problems[index];
                    return (
                        <li key={index} className={cn("rounded-lg border p-4", problem ? "border-danger/40" : "border-border")}>
                            <div className="flex items-start gap-3">
                                <span className="mt-2 w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                                    {index + 1}.
                                </span>
                                <div className="min-w-0 flex-1 space-y-3">
                                    <Input
                                        aria-label={`Question ${index + 1} prompt`}
                                        value={question.prompt}
                                        placeholder="The question the agent is asked"
                                        onChange={(event) => {
                                            const prompt = event.target.value;
                                            update(index, (current) => ({ ...current, prompt }));
                                        }}
                                    />
                                    <ul className="space-y-2">
                                        {question.options.map((option, optionIndex) => (
                                            <li key={optionIndex} className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    name={`question-${index}-correct`}
                                                    aria-label={`Question ${index + 1} option ${optionIndex + 1} is correct`}
                                                    checked={option.isCorrect}
                                                    onChange={() =>
                                                        update(index, (current) => ({
                                                            ...current,
                                                            options: current.options.map((row, i) => ({ ...row, isCorrect: i === optionIndex })),
                                                        }))
                                                    }
                                                    className="size-4 accent-[hsl(359.5_85.5%_29.8%)]"
                                                />
                                                <Input
                                                    aria-label={`Question ${index + 1} option ${optionIndex + 1}`}
                                                    value={option.label}
                                                    placeholder={`Option ${optionIndex + 1}`}
                                                    className={cn("h-8", option.isCorrect && "border-success/60")}
                                                    onChange={(event) => {
                                                        const label = event.target.value;
                                                        update(index, (current) => ({
                                                            ...current,
                                                            options: current.options.map((row, i) => (i === optionIndex ? { ...row, label } : row)),
                                                        }));
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8 shrink-0"
                                                    aria-label={`Remove question ${index + 1} option ${optionIndex + 1}`}
                                                    disabled={question.options.length <= MIN_OPTIONS}
                                                    onClick={() =>
                                                        update(index, (current) => {
                                                            const options = current.options.filter((_, i) => i !== optionIndex);
                                                            // Removing the correct option leaves none; the first takes it.
                                                            if (!options.some((row) => row.isCorrect) && options[0]) options[0] = { ...options[0], isCorrect: true };
                                                            return { ...current, options };
                                                        })
                                                    }
                                                >
                                                    <X className="size-3.5" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 bg-card"
                                            disabled={question.options.length >= MAX_OPTIONS}
                                            onClick={() =>
                                                update(index, (current) => ({
                                                    ...current,
                                                    options: [...current.options, { label: "", isCorrect: false }],
                                                }))
                                            }
                                        >
                                            <Plus className="mr-1 size-3.5" />
                                            Add option
                                        </Button>
                                        {problem && <p className="text-xs text-danger">{problem}</p>}
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-col gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8"
                                        aria-label={`Move question ${index + 1} up`}
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                    >
                                        <ArrowUp className="size-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8"
                                        aria-label={`Move question ${index + 1} down`}
                                        disabled={index === drafts.length - 1}
                                        onClick={() => move(index, 1)}
                                    >
                                        <ArrowDown className="size-4" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 text-danger hover:text-danger"
                                        aria-label={`Remove question ${index + 1}`}
                                        onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <Button
                type="button"
                variant="outline"
                className="mt-4 bg-card"
                disabled={drafts.length >= MAX_QUESTIONS}
                onClick={() => setDrafts((current) => [...current, blankQuestion()])}
            >
                <Plus className="mr-1.5 size-4" />
                Add question
            </Button>
        </Card>
    );
}
