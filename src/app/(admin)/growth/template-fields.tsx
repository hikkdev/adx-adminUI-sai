"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { isMoneyInput, type TemplateDraft } from "@/services/growth";

/**
 * What the two template forms share: the draft as text, the checks the
 * schema will make, and the field chrome.
 *
 * The draft holds every number as the string in its input, so a half-typed
 * "4" is not coerced to 4 days and back under the cursor. `toDraft` turns
 * it into the shape the wire takes only when the form is submitted, and
 * `draftProblems` says beforehand which fields the server would refuse.
 */
export interface TemplateFormValues {
    title: string;
    description: string;
    target: string;
    /** As typed: "5000" or "5000.00". Sent as-is. */
    rewardAmount: string;
    sortOrder: string;
    isActive: boolean;
    /** "" is all time. */
    windowDays: string;
    /** A `datetime-local` value, or "". */
    startsAt: string;
    /** "" or "0" is no lock. */
    unlockAfter: string;
}

/** A stored template, as the inputs hold it. */
export function fromTemplate(template: TemplateDraft): TemplateFormValues {
    return {
        title: template.title,
        description: template.description,
        target: String(template.target),
        rewardAmount: template.rewardAmount,
        sortOrder: String(template.sortOrder),
        isActive: template.isActive,
        windowDays: template.windowDays === null ? "" : String(template.windowDays),
        startsAt: template.startsAt ? toLocalInput(template.startsAt) : "",
        unlockAfter: template.unlockAfter ? String(template.unlockAfter) : "",
    };
}

/** The inputs, as the wire takes them. Only valid once `draftProblems` is empty. */
export function toDraft(values: TemplateFormValues): TemplateDraft {
    return {
        title: values.title.trim(),
        description: values.description.trim(),
        target: Number(values.target),
        rewardAmount: values.rewardAmount.trim(),
        sortOrder: values.sortOrder.trim() === "" ? 0 : Number(values.sortOrder),
        isActive: values.isActive,
        windowDays: values.windowDays.trim() === "" ? null : Number(values.windowDays),
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : null,
        unlockAfter: values.unlockAfter.trim() === "" || Number(values.unlockAfter) === 0 ? null : Number(values.unlockAfter),
    };
}

const wholeNumber = (value: string, min: number) => {
    if (value.trim() === "") return true;
    const n = Number(value);
    return Number.isInteger(n) && n >= min;
};

/** Which fields the schema would refuse, keyed the way its field errors are. */
export function draftProblems(values: TemplateFormValues): Partial<Record<keyof TemplateFormValues, string>> {
    const problems: Partial<Record<keyof TemplateFormValues, string>> = {};
    if (!values.title.trim()) problems.title = "A title is what the agent sees on the card.";
    else if (values.title.trim().length > 120) problems.title = "At most 120 characters.";
    if (!values.description.trim()) problems.description = "A line under the title, on the card.";
    else if (values.description.trim().length > 500) problems.description = "At most 500 characters.";
    if (values.target.trim() === "" || !wholeNumber(values.target, 1)) problems.target = "A whole number, at least 1.";
    if (!isMoneyInput(values.rewardAmount.trim())) problems.rewardAmount = "Digits, with up to two decimal places — 2500 or 2500.00.";
    if (!wholeNumber(values.sortOrder, 0)) problems.sortOrder = "A whole number, 0 or more.";
    if (!wholeNumber(values.windowDays, 1)) problems.windowDays = "Whole days, at least 1 — or leave it empty for all time.";
    if (values.startsAt && Number.isNaN(Date.parse(values.startsAt))) problems.startsAt = "Not a date.";
    if (!wholeNumber(values.unlockAfter, 0)) problems.unlockAfter = "A whole number of milestones, or empty.";
    return problems;
}

/** An ISO instant as a `datetime-local` input wants it, in the browser's clock. */
function toLocalInput(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
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
