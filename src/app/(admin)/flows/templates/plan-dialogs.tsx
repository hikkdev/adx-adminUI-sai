"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { milestoneService, type PlanStepInput } from "@/services/milestones";
import type { FulfilmentPlan, FulfilmentTemplate } from "@/types";

/* ------------------------------------------------------------------ */
/* New plan                                                            */
/* ------------------------------------------------------------------ */

interface NewPlanDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}

/**
 * A plan is created empty — `POST /milestone-plans` takes a name and a
 * description and nothing else — and given its steps afterwards through
 * Edit steps. Two writes rather than one because that is the API's shape,
 * and the card says plainly that a plan with no steps issues nothing.
 */
export function NewPlanDialog({ open, onOpenChange, onCreated }: NewPlanDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <NewPlanForm onClose={() => onOpenChange(false)} onCreated={onCreated} />
            </DialogContent>
        </Dialog>
    );
}

function NewPlanForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const ready = name.trim().length > 0;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const created = await milestoneService.createPlan({
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
            });
            toast.success(`${created.name} created`, {
                description: "It has no steps yet — open Edit steps to chain some templates.",
            });
            onCreated();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not create the plan.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>New fulfilment plan</DialogTitle>
                <DialogDescription>
                    A named chain of steps. It starts empty; the steps are added next.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
                <Label htmlFor="plan-name">Name</Label>
                <Input
                    id="plan-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="off"
                    placeholder="Standard hoarding campaign"
                />
                {fieldErrors.name?.[0] && <p className="text-xs text-danger">{fieldErrors.name[0]}</p>}
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="plan-description">
                    Description <span className="ml-1 font-normal text-muted-foreground">optional</span>
                </Label>
                <Textarea
                    id="plan-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    placeholder="Default plan for static hoardings booked with printing and mounting."
                />
                {fieldErrors.description?.[0] && (
                    <p className="text-xs text-danger">{fieldErrors.description[0]}</p>
                )}
            </div>
            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Creating…" : "Create plan"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* Edit steps                                                          */
/* ------------------------------------------------------------------ */

interface PlanStepsDialogProps {
    /** The plan being edited; null closes the dialog. */
    plan: FulfilmentPlan | null;
    onOpenChange: (open: boolean) => void;
    /** Active templates only: the server refuses an inactive one in a plan. */
    templates: FulfilmentTemplate[];
    onSaved: () => void;
}

/**
 * The chain, reordered.
 *
 * `PUT /milestone-plans/:id/items` replaces the list wholesale and numbers
 * come from the list's order, so the editor holds the steps as a list and
 * moves them up and down; the body is built from that order on save. The
 * server refuses an empty list, a template that does not exist and one that
 * is inactive — the last is the one this can run into, when a template was
 * switched off after the plan was built, and the row says so rather than
 * letting the save fail with a cuid in the message.
 */
export function PlanStepsDialog({ plan, onOpenChange, templates, onSaved }: PlanStepsDialogProps) {
    return (
        <Dialog open={plan !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                {plan && (
                    <PlanStepsForm
                        key={plan.id}
                        plan={plan}
                        templates={templates}
                        onClose={() => onOpenChange(false)}
                        onSaved={onSaved}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

interface StepDraft extends PlanStepInput {
    key: number;
}

function PlanStepsForm({
    plan,
    templates,
    onClose,
    onSaved,
}: {
    plan: FulfilmentPlan;
    templates: FulfilmentTemplate[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [steps, setSteps] = React.useState<StepDraft[]>(() =>
        plan.items.map((item, index) => ({ key: index + 1, templateId: item.templateId, optional: item.optional })),
    );
    const [nextKey, setNextKey] = React.useState(plan.items.length + 1);
    const [adding, setAdding] = React.useState("");
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const templateById = React.useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);
    /** Names for steps whose template is no longer active, from the plan's own join. */
    const joinedTitle = React.useMemo(
        () => new Map(plan.items.map((item) => [item.templateId, item.title])),
        [plan.items],
    );

    const inactive = steps.filter((step) => !templateById.has(step.templateId));
    const ready = steps.length > 0 && inactive.length === 0;

    function move(key: number, by: -1 | 1) {
        setSteps((current) => {
            const index = current.findIndex((step) => step.key === key);
            const target = index + by;
            if (index < 0 || target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    function add() {
        if (!adding) return;
        setSteps((current) => [...current, { key: nextKey, templateId: adding, optional: false }]);
        setNextKey((key) => key + 1);
        setAdding("");
    }

    async function save() {
        if (!ready || busy) return;
        setBusy(true);
        setFormError(null);
        try {
            const saved = await milestoneService.setPlanItems(
                plan.id,
                steps.map(({ templateId, optional }) => ({ templateId, optional })),
            );
            toast.success(`${saved.name} now has ${saved.items.length} ${saved.items.length === 1 ? "step" : "steps"}`);
            onSaved();
            onClose();
        } catch (cause) {
            setFormError(cause instanceof Error ? cause.message : "Could not save the steps.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            <DialogHeader>
                <DialogTitle>Steps in {plan.name}</DialogTitle>
                <DialogDescription>
                    The order an agent works through them. Saving replaces the whole chain; orders
                    already issued keep the steps they have.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
                {steps.length === 0 && (
                    <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                        No steps. Add at least one — the server refuses an empty plan.
                    </p>
                )}
                {steps.map((step, index) => {
                    const template = templateById.get(step.templateId);
                    const title = template?.title ?? joinedTitle.get(step.templateId) ?? step.templateId;
                    return (
                        <div key={step.key} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                                {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-foreground">{title}</span>
                                {!template && (
                                    <span className="block text-[11px] text-warning">
                                        Inactive template — activate it or remove this step before saving.
                                    </span>
                                )}
                            </span>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={step.optional}
                                    onCheckedChange={(checked) =>
                                        setSteps((current) =>
                                            current.map((candidate) =>
                                                candidate.key === step.key
                                                    ? { ...candidate, optional: checked === true }
                                                    : candidate,
                                            ),
                                        )
                                    }
                                />
                                Optional
                            </label>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={index === 0}
                                onClick={() => move(step.key, -1)}
                                aria-label="Move up"
                            >
                                <ArrowUp className="size-3.5" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={index === steps.length - 1}
                                onClick={() => move(step.key, 1)}
                                aria-label="Move down"
                            >
                                <ArrowDown className="size-3.5" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground"
                                onClick={() => setSteps((current) => current.filter((candidate) => candidate.key !== step.key))}
                                aria-label="Remove this step"
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center gap-2">
                <Select value={adding} onValueChange={setAdding}>
                    <SelectTrigger className="h-9 flex-1" aria-label="Template to add">
                        <SelectValue placeholder={templates.length ? "Add a step…" : "No active templates to add"} />
                    </SelectTrigger>
                    <SelectContent>
                        {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                                {template.title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-9 bg-card" disabled={!adding} onClick={add}>
                    <Plus className="mr-1 size-4" />
                    Add
                </Button>
            </div>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="button" disabled={!ready || busy} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save steps"}
                </Button>
            </DialogFooter>
        </div>
    );
}
