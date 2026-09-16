"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import {
    AGENT_MILESTONE_TYPES,
    MILESTONE_TYPE_META,
    growthService,
    type AgentMilestoneType,
    type CreateTemplateInput,
} from "@/services/growth";
import { Field, draftProblems, toDraft, type TemplateFormValues } from "./template-fields";

interface NewMilestoneDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** One past the highest order on the board, so a new template lands last. */
    defaultSortOrder: number;
    /** Called after the template actually lands, so the table refetches. */
    onCreated: () => void;
}

/**
 * "Make New milestone create something."
 *
 * Asks for exactly what `POST /milestones/templates` takes. The type is
 * fixed once the template exists — the PATCH schema has no `type` — so it
 * is chosen here with a line on what it counts. The reward is a decimal
 * string as typed and goes on the wire as typed. Active is OFF by default:
 * the board materialises a row per active template on every agent's next
 * read, so a template switched on before somebody has looked at it is on
 * every board at once.
 */
export function NewMilestoneDialog({ open, onOpenChange, defaultSortOrder, onCreated }: NewMilestoneDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                {/* Mounted only while open, so the form is fresh each time. */}
                <MilestoneForm
                    defaultSortOrder={defaultSortOrder}
                    onClose={() => onOpenChange(false)}
                    onCreated={onCreated}
                />
            </DialogContent>
        </Dialog>
    );
}

function MilestoneForm({
    defaultSortOrder,
    onClose,
    onCreated,
}: {
    defaultSortOrder: number;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [type, setType] = React.useState<AgentMilestoneType>("ONBOARDING");
    const [values, setValues] = React.useState<TemplateFormValues>({
        title: "",
        description: "",
        target: "",
        rewardAmount: "",
        sortOrder: String(defaultSortOrder),
        isActive: false,
        windowDays: "",
        startsAt: "",
        unlockAfter: "",
    });
    const [touched, setTouched] = React.useState<Partial<Record<keyof TemplateFormValues, boolean>>>({});
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const problems = draftProblems(values);
    const ready = Object.keys(problems).length === 0;
    const meta = MILESTONE_TYPE_META[type];

    const set =
        (key: keyof TemplateFormValues) =>
        (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const value = event.target.value;
            setValues((current) => ({ ...current, [key]: value }));
            setTouched((current) => ({ ...current, [key]: true }));
        };

    /** The server's word for a field wins; ours is shown once the field has been touched. */
    const errorFor = (key: keyof TemplateFormValues): string | undefined =>
        fieldErrors[key]?.[0] ?? (touched[key] ? problems[key] : undefined);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;

        const draft = toDraft(values);
        const input: CreateTemplateInput = { type, ...draft };

        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const created = await growthService.createTemplate(input);
            toast.success(`${created.title} created`, {
                description: created.isActive
                    ? "Active from now: it appears on every agent's board from their next read."
                    : "Switched off until you turn it on, so it is on nobody's board yet.",
            });
            onCreated();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not create the milestone.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>New milestone</DialogTitle>
                <DialogDescription>
                    A target every agent can work toward, and a reward recorded when they claim it. The
                    type is fixed once the milestone exists; everything else can be changed later.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="ms-type" label="Type" error={fieldErrors.type?.[0]}>
                    <Select value={type} onValueChange={(value) => setType(value as AgentMilestoneType)}>
                        <SelectTrigger id="ms-type" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {AGENT_MILESTONE_TYPES.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {MILESTONE_TYPE_META[value].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <Field id="ms-order" label="Order" hint="Where it sits on the board; lower first." error={errorFor("sortOrder")}>
                    <Input id="ms-order" type="number" min={0} inputMode="numeric" value={values.sortOrder} onChange={set("sortOrder")} />
                </Field>
            </div>

            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{meta.label} counts:</span> {meta.counts}
            </p>

            <Field id="ms-title" label="Title" error={errorFor("title")}>
                <Input id="ms-title" value={values.title} onChange={set("title")} autoComplete="off" placeholder="Onboard 10 publishers" />
            </Field>

            <Field id="ms-description" label="Description" error={errorFor("description")}>
                <Textarea
                    id="ms-description"
                    value={values.description}
                    onChange={set("description")}
                    rows={2}
                    placeholder="Bring ten businesses through onboarding."
                />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="ms-target" label="Target" hint={`In ${meta.unit}.`} error={errorFor("target")}>
                    <Input id="ms-target" type="number" min={1} inputMode="numeric" value={values.target} onChange={set("target")} placeholder="10" />
                </Field>
                <Field
                    id="ms-reward"
                    label="Reward (₹)"
                    hint="Recorded on claim and released by ADX finance, never paid on the spot."
                    error={errorFor("rewardAmount")}
                >
                    <Input id="ms-reward" inputMode="decimal" value={values.rewardAmount} onChange={set("rewardAmount")} autoComplete="off" placeholder="2500.00" />
                </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="ms-window" label="Window (days)" optional hint="Empty counts all time." error={errorFor("windowDays")}>
                    <Input id="ms-window" type="number" min={1} inputMode="numeric" value={values.windowDays} onChange={set("windowDays")} placeholder="30" />
                </Field>
                <Field id="ms-starts" label="Starts" optional hint="Empty starts the clock when the agent first sees it." error={errorFor("startsAt")}>
                    <Input id="ms-starts" type="datetime-local" value={values.startsAt} onChange={set("startsAt")} />
                </Field>
            </div>

            <Field
                id="ms-unlock"
                label="Unlock after"
                optional
                hint="How many milestones an agent must complete before this one opens."
                error={errorFor("unlockAfter")}
            >
                <Input id="ms-unlock" type="number" min={0} inputMode="numeric" value={values.unlockAfter} onChange={set("unlockAfter")} placeholder="0" className="sm:w-40" />
            </Field>

            <label className="flex items-center justify-between gap-4 border-t pt-4">
                <span>
                    <span className="block text-sm font-medium text-foreground">Active</span>
                    <span className="block text-xs text-muted-foreground">
                        Off until you switch it on, so it lands on nobody&rsquo;s board before it is checked.
                    </span>
                </span>
                <Switch
                    checked={values.isActive}
                    onCheckedChange={(checked) => setValues((current) => ({ ...current, isActive: checked }))}
                />
            </label>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Creating…" : "Create milestone"}
                </Button>
            </DialogFooter>
        </form>
    );
}
