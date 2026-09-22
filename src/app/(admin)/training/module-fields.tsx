"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUDIENCE_LABEL, MODULE_KIND_LABEL, TRAINING_AUDIENCES, type ModuleDraft, type TrainingAudience, type TrainingModuleKind } from "@/services/training";

/**
 * What the two module forms share: the draft as text, the checks the schema
 * will make, and the field chrome.
 *
 * The draft holds every number as the string in its input, so a half-typed
 * "4" is not coerced to 4 minutes and back under the cursor. `toDraft` turns
 * it into the shape the wire takes only when the form is submitted, and
 * `draftProblems` says beforehand which fields the server would refuse.
 */
export interface ModuleFormValues {
    ordinal: string;
    title: string;
    summary: string;
    /** "" is untimed. */
    durationMins: string;
    videoUrl: string;
    lessonBody: string;
    transcript: string;
    takeaways: string[];
    /** "" opens it from the start. */
    unlockAfterOrdinal: string;
    passPercent: string;
    isActive: boolean;
    /** AG-4: whom it is for, what it is; "" is an untimed quiz. */
    audience: TrainingAudience;
    kind: TrainingModuleKind;
    timeLimitMins: string;
}

/** A stored module, as the inputs hold it. */
export function fromModule(module: ModuleDraft): ModuleFormValues {
    return {
        ordinal: String(module.ordinal),
        title: module.title,
        summary: module.summary ?? "",
        durationMins: module.durationMins === null ? "" : String(module.durationMins),
        videoUrl: module.videoUrl ?? "",
        lessonBody: module.lessonBody ?? "",
        transcript: module.transcript ?? "",
        takeaways: module.takeaways,
        unlockAfterOrdinal: module.unlockAfterOrdinal === null ? "" : String(module.unlockAfterOrdinal),
        passPercent: String(module.passPercent),
        isActive: module.isActive,
        audience: module.audience,
        kind: module.kind,
        timeLimitMins: module.timeLimitMins === null ? "" : String(module.timeLimitMins),
    };
}

const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/** The inputs, as the wire takes them. Only valid once `draftProblems` is empty. */
export function toDraft(values: ModuleFormValues): ModuleDraft {
    return {
        ordinal: Number(values.ordinal),
        title: values.title.trim(),
        summary: orNull(values.summary),
        durationMins: values.durationMins.trim() === "" ? null : Number(values.durationMins),
        videoUrl: orNull(values.videoUrl),
        // The lesson keeps its whitespace: it is Markdown, and a trailing
        // newline is not an edit but an indented line is.
        lessonBody: values.lessonBody.trim() === "" ? null : values.lessonBody,
        transcript: values.transcript.trim() === "" ? null : values.transcript,
        takeaways: values.takeaways.map((line) => line.trim()).filter(Boolean),
        unlockAfterOrdinal: values.unlockAfterOrdinal.trim() === "" ? null : Number(values.unlockAfterOrdinal),
        passPercent: Number(values.passPercent),
        isActive: values.isActive,
        audience: values.audience,
        kind: values.kind,
        timeLimitMins: values.timeLimitMins.trim() === "" ? null : Number(values.timeLimitMins),
    };
}

const wholeNumber = (value: string, min: number, max = Number.POSITIVE_INFINITY) => {
    if (value.trim() === "") return true;
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max;
};

const isUrl = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
};

/** Which fields the schema would refuse, keyed the way its field errors are. */
export function draftProblems(values: ModuleFormValues): Partial<Record<keyof ModuleFormValues, string>> {
    const problems: Partial<Record<keyof ModuleFormValues, string>> = {};
    if (values.ordinal.trim() === "" || !wholeNumber(values.ordinal, 1)) problems.ordinal = "A whole number, at least 1.";
    if (!values.title.trim()) problems.title = "A title is what the agent sees on the index.";
    else if (values.title.trim().length > 160) problems.title = "At most 160 characters.";
    if (values.summary.trim().length > 500) problems.summary = "At most 500 characters.";
    if (!wholeNumber(values.durationMins, 1)) problems.durationMins = "Whole minutes, at least 1 — or leave it empty.";
    if (values.videoUrl.trim() && !isUrl(values.videoUrl.trim())) problems.videoUrl = "A full http(s) URL, or empty.";
    else if (values.videoUrl.trim().length > 500) problems.videoUrl = "At most 500 characters.";
    if (values.lessonBody.length > 20000) problems.lessonBody = "At most 20,000 characters.";
    if (values.transcript.length > 50000) problems.transcript = "At most 50,000 characters.";
    if (values.takeaways.length > 10) problems.takeaways = "At most 10 takeaways.";
    else if (values.takeaways.some((line) => line.trim().length > 300)) problems.takeaways = "A takeaway is at most 300 characters.";
    if (!wholeNumber(values.unlockAfterOrdinal, 1)) problems.unlockAfterOrdinal = "A module's order number, or empty.";
    else if (
        values.unlockAfterOrdinal.trim() !== "" &&
        values.ordinal.trim() !== "" &&
        Number(values.unlockAfterOrdinal) >= Number(values.ordinal)
    ) {
        // The server's own rule, said before the round trip.
        problems.unlockAfterOrdinal = "A module can only wait on one that comes before it.";
    }
    if (values.passPercent.trim() === "" || !wholeNumber(values.passPercent, 1, 100)) problems.passPercent = "A whole number from 1 to 100.";
    if (!wholeNumber(values.timeLimitMins, 1, 240)) problems.timeLimitMins = "Whole minutes, 1 to 240 — or leave it empty for no clock.";
    return problems;
}

/**
 * AG-4: whom the module is for and what it is. A lesson counts toward the
 * certificate; an assessment is the screening test a sales applicant sits —
 * scored, timed if you give it a clock, never certified.
 */
export function KindAudienceFields({
    values,
    onChange,
    error,
}: {
    values: Pick<ModuleFormValues, "audience" | "kind" | "timeLimitMins">;
    onChange: (patch: Partial<Pick<ModuleFormValues, "audience" | "kind" | "timeLimitMins">>) => void;
    error?: string;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-3">
            <Field id="md-audience" label="For" hint="Every agent, or one side's curriculum.">
                <Select value={values.audience} onValueChange={(value) => onChange({ audience: value as TrainingAudience })}>
                    <SelectTrigger id="md-audience" className="bg-card">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TRAINING_AUDIENCES.map((audience) => (
                            <SelectItem key={audience} value={audience}>
                                {AUDIENCE_LABEL[audience]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            <Field id="md-kind" label="Kind" hint={values.kind === "ASSESSMENT" ? "The screening test: scored, never certified." : "Counts toward the certificate."}>
                <Select value={values.kind} onValueChange={(value) => onChange({ kind: value as TrainingModuleKind })}>
                    <SelectTrigger id="md-kind" className="bg-card">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(MODULE_KIND_LABEL) as TrainingModuleKind[]).map((kind) => (
                            <SelectItem key={kind} value={kind}>
                                {MODULE_KIND_LABEL[kind]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            <Field id="md-clock" label="Clock (minutes)" optional hint="The quiz submits what is answered when it runs out." error={error}>
                <Input id="md-clock" type="number" min={1} max={240} inputMode="numeric" value={values.timeLimitMins} onChange={(event) => onChange({ timeLimitMins: event.target.value })} placeholder="—" />
            </Field>
        </div>
    );
}

export function Field({
    id,
    label,
    hint,
    optional,
    error,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    optional?: boolean;
    error?: string;
    children: React.ReactNode;
}) {
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
