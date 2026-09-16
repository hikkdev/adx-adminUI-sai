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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { trainingService, type CreateModuleInput } from "@/services/training";
import { Field, draftProblems, toDraft, type ModuleFormValues } from "./module-fields";

interface NewModuleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** One past the highest order on the index, so a new module lands last. */
    defaultOrdinal: number;
    /** Called after the module actually lands, so the table refetches. */
    onCreated: () => void;
}

/**
 * Asks for what `POST /training/modules` takes to put a row on the index:
 * the order, the title, a summary, how long it runs, the video, the pass
 * mark and what unlocks it. The lesson, the transcript, the takeaways and
 * the questions are the editor's job, once the module exists.
 *
 * Active is OFF by default and says why: the curriculum materialises a row
 * per active module on every agent's next read, and one switched on before
 * it has questions is passed for free.
 */
export function NewModuleDialog({ open, onOpenChange, defaultOrdinal, onCreated }: NewModuleDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                {/* Mounted only while open, so the form is fresh each time. */}
                <ModuleForm defaultOrdinal={defaultOrdinal} onClose={() => onOpenChange(false)} onCreated={onCreated} />
            </DialogContent>
        </Dialog>
    );
}

function ModuleForm({
    defaultOrdinal,
    onClose,
    onCreated,
}: {
    defaultOrdinal: number;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [values, setValues] = React.useState<ModuleFormValues>({
        ordinal: String(defaultOrdinal),
        title: "",
        summary: "",
        durationMins: "",
        videoUrl: "",
        lessonBody: "",
        transcript: "",
        takeaways: [],
        unlockAfterOrdinal: "",
        passPercent: "80",
        isActive: false,
    });
    const [touched, setTouched] = React.useState<Partial<Record<keyof ModuleFormValues, boolean>>>({});
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const problems = draftProblems(values);
    const ready = Object.keys(problems).length === 0;

    const set =
        (key: keyof ModuleFormValues) =>
        (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const value = event.target.value;
            setValues((current) => ({ ...current, [key]: value }));
            setTouched((current) => ({ ...current, [key]: true }));
        };

    /** The server's word for a field wins; ours is shown once the field has been touched. */
    const errorFor = (key: keyof ModuleFormValues): string | undefined =>
        fieldErrors[key]?.[0] ?? (touched[key] ? problems[key] : undefined);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;

        const draft = toDraft(values);
        const input: CreateModuleInput = {
            ordinal: draft.ordinal,
            title: draft.title,
            summary: draft.summary,
            durationMins: draft.durationMins,
            videoUrl: draft.videoUrl,
            unlockAfterOrdinal: draft.unlockAfterOrdinal,
            passPercent: draft.passPercent,
            isActive: draft.isActive,
        };

        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const created = await trainingService.createModule(input);
            toast.success(`${created.title} created`, {
                description: created.isActive
                    ? "Active from now — and with no questions yet, every agent passes it until some are added."
                    : "Switched off until you turn it on, so it is on nobody's index yet. Open it to write the lesson and the quiz.",
            });
            onCreated();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not create the module.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>New module</DialogTitle>
                <DialogDescription>
                    A lesson with a quiz, in order on every agent&rsquo;s index. The lesson body, the
                    takeaways and the questions are written once it exists.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="md-order" label="Order" hint="Where it sits on the index; lower first." error={errorFor("ordinal")}>
                    <Input id="md-order" type="number" min={1} inputMode="numeric" value={values.ordinal} onChange={set("ordinal")} />
                </Field>
                <Field id="md-duration" label="Duration (minutes)" optional error={errorFor("durationMins")}>
                    <Input id="md-duration" type="number" min={1} inputMode="numeric" value={values.durationMins} onChange={set("durationMins")} placeholder="15" />
                </Field>
            </div>

            <Field id="md-title" label="Title" error={errorFor("title")}>
                <Input id="md-title" value={values.title} onChange={set("title")} autoComplete="off" placeholder="Welcome to ADX" />
            </Field>

            <Field id="md-summary" label="Summary" optional hint="One line under the title on the index." error={errorFor("summary")}>
                <Textarea id="md-summary" value={values.summary} onChange={set("summary")} rows={2} />
            </Field>

            <Field id="md-video" label="Video URL" optional error={errorFor("videoUrl")}>
                <Input id="md-video" value={values.videoUrl} onChange={set("videoUrl")} autoComplete="off" placeholder="https://" inputMode="url" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="md-pass" label="Pass mark (%)" hint="The share of questions an attempt must get right." error={errorFor("passPercent")}>
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
                        Off until you switch it on. An active module with no quiz is passed by every agent for free.
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
                    {busy ? "Creating…" : "Create module"}
                </Button>
            </DialogFooter>
        </form>
    );
}
