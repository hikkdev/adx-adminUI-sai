"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { milestoneService, type CreateTemplateInput } from "@/services/milestones";
import {
    FULFILMENT_REQUIREMENT_KINDS,
    FULFILMENT_REQUIREMENT_LABELS,
    FULFILMENT_STEP_TYPE_META,
    MILESTONE_TYPES,
    type FulfilmentRequirement,
    type FulfilmentRequirementKind,
    type MilestoneType,
} from "@/types";

interface NewTemplateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after the template actually lands, so the cards refetch. */
    onCreated: () => void;
}

/** One row of the requirements builder, before it is a requirement. */
interface RequirementDraft {
    key: number;
    kind: FulfilmentRequirementKind;
    label: string;
    optional: boolean;
}

const labelled = (kind: FulfilmentRequirementKind) => kind === "photo" || kind === "checklist_item";

/**
 * A draft row as the schema wants it, or null when it is not one yet.
 *
 * The two labelled kinds need a label with something in it — the backend
 * refuses a blank, and its read path would drop the row anyway, so the agent
 * would never be asked for it. The other three carry nothing but the kind.
 */
function toRequirement(draft: RequirementDraft): FulfilmentRequirement | null {
    if (labelled(draft.kind)) {
        if (draft.label.trim().length === 0) return null;
        const kind = draft.kind as "photo" | "checklist_item";
        return draft.optional ? { kind, label: draft.label, optional: true } : { kind, label: draft.label };
    }
    return { kind: draft.kind as Exclude<FulfilmentRequirementKind, "photo" | "checklist_item"> };
}

/**
 * Writing a new step template.
 *
 * Asks for exactly what `POST /milestone-templates` takes: a title, the kind
 * of step (fixed once created — the PATCH schema has no `type`), at least one
 * requirement, and optionally a description and a duration. A requirement is
 * built here as a row with a kind, and for the two kinds that name what they
 * want, a label and whether it may be left unsatisfied.
 */
export function NewTemplateDialog({ open, onOpenChange, onCreated }: NewTemplateDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                {/* Mounted only while open, so the form is fresh each time. */}
                <TemplateForm onClose={() => onOpenChange(false)} onCreated={onCreated} />
            </DialogContent>
        </Dialog>
    );
}

function TemplateForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [title, setTitle] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [type, setType] = React.useState<MilestoneType>("SURVEY");
    const [minutes, setMinutes] = React.useState("");
    const [rows, setRows] = React.useState<RequirementDraft[]>([
        { key: 1, kind: "location_checkin", label: "", optional: false },
        { key: 2, kind: "photo", label: "", optional: false },
    ]);
    const [nextKey, setNextKey] = React.useState(3);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const requirements = rows.map(toRequirement);
    const complete = requirements.every((requirement) => requirement !== null);
    const duration = minutes.trim() === "" ? undefined : Number(minutes);
    const durationOk = duration === undefined || (Number.isInteger(duration) && duration > 0);
    const ready = title.trim().length > 0 && rows.length > 0 && complete && durationOk;

    function updateRow(key: number, patch: Partial<RequirementDraft>) {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    }

    function addRow() {
        setRows((current) => [...current, { key: nextKey, kind: "photo", label: "", optional: false }]);
        setNextKey((key) => key + 1);
    }

    function removeRow(key: number) {
        setRows((current) => current.filter((row) => row.key !== key));
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;

        const input: CreateTemplateInput = {
            title: title.trim(),
            type,
            requirements: requirements.filter((requirement): requirement is FulfilmentRequirement => requirement !== null),
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(duration !== undefined ? { estimatedDurationMins: duration } : {}),
        };

        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const created = await milestoneService.createTemplate(input);
            toast.success(`${created.title} added`, {
                description: "Active from now: orders and plans can use it.",
            });
            onCreated();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not add the template.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>New step template</DialogTitle>
                <DialogDescription>
                    What the agent app asks for on site. The kind of step is fixed once the template
                    exists; everything else can be changed later.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="tpl-title" label="Title" errors={fieldErrors.title}>
                    <Input
                        id="tpl-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        autoComplete="off"
                        placeholder="Site survey"
                    />
                </Field>
                <Field id="tpl-type" label="Kind of step" errors={fieldErrors.type}>
                    <Select value={type} onValueChange={(value) => setType(value as MilestoneType)}>
                        <SelectTrigger id="tpl-type" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MILESTONE_TYPES.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {FULFILMENT_STEP_TYPE_META[value].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            </div>

            <Field id="tpl-description" label="Description" optional errors={fieldErrors.description}>
                <Textarea
                    id="tpl-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    placeholder="Confirm condition and visibility before the campaign goes live."
                />
            </Field>

            <Field
                id="tpl-minutes"
                label="Time on site"
                optional
                hint="Whole minutes. Shown to the agent as an estimate."
                errors={
                    fieldErrors.estimatedDurationMins ??
                    (durationOk ? undefined : ["A whole number of minutes, more than zero."])
                }
            >
                <Input
                    id="tpl-minutes"
                    inputMode="numeric"
                    value={minutes}
                    onChange={(event) => setMinutes(event.target.value)}
                    autoComplete="off"
                    placeholder="25"
                    className="sm:w-40"
                />
            </Field>

            <div className="grid gap-2">
                <div className="flex items-center justify-between">
                    <Label>Proof the agent collects</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addRow}>
                        <Plus className="mr-1 size-3.5" />
                        Add a requirement
                    </Button>
                </div>
                {rows.length === 0 && (
                    <p className="text-xs text-danger">At least one — a step that asks for nothing cannot be completed.</p>
                )}
                <div className="space-y-2">
                    {rows.map((row) => (
                        <div key={row.key} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
                            <Select
                                value={row.kind}
                                onValueChange={(value) => updateRow(row.key, { kind: value as FulfilmentRequirementKind })}
                            >
                                <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Kind of proof">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FULFILMENT_REQUIREMENT_KINDS.map((kind) => (
                                        <SelectItem key={kind} value={kind}>
                                            {FULFILMENT_REQUIREMENT_LABELS[kind]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {labelled(row.kind) ? (
                                <>
                                    <Input
                                        value={row.label}
                                        onChange={(event) => updateRow(row.key, { label: event.target.value })}
                                        aria-label="What it asks for"
                                        placeholder={row.kind === "photo" ? "Wide angle shot" : "Structure is safe"}
                                        className="h-8 min-w-[160px] flex-1 text-xs"
                                    />
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Checkbox
                                            checked={row.optional}
                                            onCheckedChange={(checked) => updateRow(row.key, { optional: checked === true })}
                                        />
                                        Optional
                                    </label>
                                </>
                            ) : (
                                <span className="flex-1 text-xs text-muted-foreground">
                                    {row.kind === "contact_details_visible"
                                        ? "Shown to the agent; never submitted as evidence."
                                        : "Nothing to name — the proof is the act itself."}
                                </span>
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground"
                                onClick={() => removeRow(row.key)}
                                aria-label="Remove this requirement"
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                    ))}
                </div>
                {fieldErrors.requirements?.[0] && <p className="text-xs text-danger">{fieldErrors.requirements[0]}</p>}
                {!complete && rows.length > 0 && (
                    <p className="text-xs text-muted-foreground">A photo or checklist item needs a label.</p>
                )}
            </div>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Adding…" : "Add template"}
                </Button>
            </DialogFooter>
        </form>
    );
}

function Field({
    id,
    label,
    hint,
    optional,
    errors,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    optional?: boolean;
    errors?: string[];
    children: React.ReactNode;
}) {
    const error = errors?.[0];
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>
                {label}
                {optional && <span className="ml-1 font-normal text-muted-foreground">optional</span>}
            </Label>
            {children}
            {error ? (
                <p className="text-xs text-danger">{error}</p>
            ) : hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
