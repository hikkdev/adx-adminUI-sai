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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { GRADE_META, type AgentGrade } from "@/services/agent-applications";
import { compensationService, priceTerms, type AgentCompensation } from "@/services/agents";

interface SetCompensationDialogProps {
    agentId: string;
    agentName: string;
    /** The agent's desk-set grade, so the form starts from that grade's defaults. */
    grade: string | null;
    /** The terms in force, when there are any — a change starts from them rather than the grade's defaults. */
    current: AgentCompensation | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after the write lands, so the page refetches. */
    onSaved: () => void;
}

/**
 * CP-1: recording what an agent is paid and what a day of it covers.
 *
 * Terms are effective-dated — saving closes the ones before it, so a month
 * already costed keeps the salary that was in force then. That is why this
 * is a new record and never an edit, and why the start date is on the form.
 */
export function SetCompensationDialog(props: SetCompensationDialogProps) {
    const { open, onOpenChange } = props;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {/* Mounted only while open, so the defaults are re-read each time. */}
                {open && <SetCompensationForm {...props} onClose={() => onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

const today = () => new Date().toISOString().slice(0, 10);

/** What the server takes: up to nine digits of rupees, two of paise. */
const SALARY = /^\d{1,9}(\.\d{1,2})?$/;
const UPLIFT = /^\d{1,3}(\.\d{1,2})?$/;

/** "G2 · Senior field", or the raw grade for one this console has not heard of. */
const gradeName = (grade: string) => (grade in GRADE_META ? `${grade} · ${GRADE_META[grade as AgentGrade].label}` : grade);

function SetCompensationForm({
    agentId,
    agentName,
    grade,
    current,
    onClose,
    onSaved,
}: Omit<SetCompensationDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
    const [monthlySalary, setMonthlySalary] = React.useState(current?.monthlySalary ?? "");
    const [dailyQuota, setDailyQuota] = React.useState(current ? String(current.dailyQuota) : "");
    const [workingDays, setWorkingDays] = React.useState(current ? String(current.workingDaysPerMonth) : "");
    const [uplift, setUplift] = React.useState(current?.commissionUpliftPct ?? "");
    const [effectiveFrom, setEffectiveFrom] = React.useState(today());
    const [note, setNote] = React.useState("");
    /** The grade whose defaults filled the form, once they have. */
    const [filledFrom, setFilledFrom] = React.useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    /* With no terms in force the form starts from the defaults for the
       agent's grade (Finance › Settings › Agent pay by grade). It is a
       starting point, not a rule: every figure below is editable. */
    React.useEffect(() => {
        if (current) return;
        let live = true;
        compensationService
            .defaults(grade ?? undefined)
            .then((band) => {
                if (!live) return;
                setMonthlySalary((value) => value || band.monthlySalary);
                setDailyQuota((value) => value || String(band.dailyQuota));
                setWorkingDays((value) => value || String(band.workingDaysPerMonth));
                setUplift((value) => value || band.commissionUpliftPct);
                setFilledFrom(band.grade);
            })
            .catch(() => {
                /* The defaults are a convenience. A failed read leaves the
                   fields empty and the desk types the figures, which is the
                   same form. */
            });
        return () => {
            live = false;
        };
    }, [current, grade]);

    const quota = Number(dailyQuota);
    const days = Number(workingDays);
    const preview = priceTerms({
        monthlySalary,
        dailyQuota: Number.isFinite(quota) ? quota : 0,
        workingDaysPerMonth: Number.isFinite(days) ? days : 0,
        commissionUpliftPct: uplift || "0",
    });

    /* What each field refuses, said only once something has been typed into it. */
    const salaryOk = SALARY.test(monthlySalary.trim());
    const quotaOk = Number.isInteger(quota) && quota >= 1 && quota <= 100;
    const daysOk = Number.isInteger(days) && days >= 1 && days <= 31;
    const upliftOk = uplift.trim() === "" || (UPLIFT.test(uplift.trim()) && Number(uplift) <= 200);
    const ready = salaryOk && quotaOk && daysOk && upliftOk && effectiveFrom !== "";

    const firstPairError =
        fieldErrors.monthlySalary?.[0] ??
        fieldErrors.dailyQuota?.[0] ??
        (monthlySalary.trim() && !salaryOk ? "The salary is a rupee amount, with at most two decimal places." : null) ??
        (dailyQuota.trim() && !quotaOk ? "The daily quota is a whole number from 1 to 100." : null);
    const secondPairError =
        fieldErrors.workingDaysPerMonth?.[0] ??
        fieldErrors.commissionUpliftPct?.[0] ??
        (workingDays.trim() && !daysOk ? "Working days a month is a whole number from 1 to 31." : null) ??
        (!upliftOk ? "The commission is 0% to 200% on top." : null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const saved = await compensationService.set(agentId, {
                monthlySalary: monthlySalary.trim(),
                dailyQuota: quota,
                workingDaysPerMonth: days,
                ...(uplift.trim() ? { commissionUpliftPct: uplift.trim() } : {}),
                effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`).toISOString(),
                ...(note.trim() ? { note: note.trim() } : {}),
            });
            toast.success(`Pay recorded for ${agentName}`, {
                description: saved.plannedUnitCost
                    ? `${saved.dailyQuota} a day covered by salary, at ${formatMoney(saved.plannedUnitCost)} each. Past that an onboarding pays ${formatMoney(saved.commissionPerExtra ?? "0")}.`
                    : `${saved.dailyQuota} a day covered by salary.`,
            });
            onSaved();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not record the pay.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{current ? "Change pay" : "Set compensation"}</DialogTitle>
                <DialogDescription data-testid="comp-dialog-description">
                    {current
                        ? `${agentName} is on ${formatMoney(current.monthlySalary)} a month covering ${current.dailyQuota} onboardings a day. The new pay starts on the date below.`
                        : filledFrom
                          ? `What ${agentName} is paid, and how many onboardings a day that covers. Filled in from the ${gradeName(filledFrom)} defaults — change any figure.`
                          : `What ${agentName} is paid, and how many onboardings a day that covers. Past the quota, each onboarding pays extra.`}
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <Label htmlFor="comp-salary">Monthly salary (₹)</Label>
                    <Input
                        id="comp-salary"
                        inputMode="decimal"
                        className="h-9 tabular-nums"
                        value={monthlySalary}
                        onChange={(event) => setMonthlySalary(event.target.value)}
                        placeholder="12000"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="comp-quota">Daily quota (onboardings)</Label>
                    <Input
                        id="comp-quota"
                        inputMode="numeric"
                        className="h-9 tabular-nums"
                        value={dailyQuota}
                        onChange={(event) => setDailyQuota(event.target.value)}
                        placeholder="10"
                    />
                </div>
                {/* Form symmetry: no hint under one cell and not the other — the pair shares this line. */}
                <p className={`text-xs sm:col-span-2 ${firstPairError ? "text-danger" : "text-muted-foreground"}`}>
                    {firstPairError ?? "The quota is per day and starts again at midnight. A day off simply has no quota."}
                </p>

                <div className="grid gap-1.5">
                    <Label htmlFor="comp-days">Working days a month</Label>
                    <Input
                        id="comp-days"
                        inputMode="numeric"
                        className="h-9 tabular-nums"
                        value={workingDays}
                        onChange={(event) => setWorkingDays(event.target.value)}
                        placeholder="26"
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="comp-uplift">Commission on extra onboardings (%)</Label>
                    <Input
                        id="comp-uplift"
                        inputMode="decimal"
                        className="h-9 tabular-nums"
                        value={uplift}
                        onChange={(event) => setUplift(event.target.value)}
                        placeholder="10"
                    />
                </div>
                <p className={`text-xs sm:col-span-2 ${secondPairError ? "text-danger" : "text-muted-foreground"}`}>
                    {secondPairError ??
                        "Working days only price the extra pay — they are not a record of days worked. The commission is added on top of the planned cost."}
                </p>

                <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="comp-from">Starts on</Label>
                    <Input
                        id="comp-from"
                        type="date"
                        className="h-9"
                        value={effectiveFrom}
                        onChange={(event) => setEffectiveFrom(event.target.value)}
                    />
                    <p className={`text-xs ${fieldErrors.effectiveFrom?.[0] ? "text-danger" : "text-muted-foreground"}`}>
                        {fieldErrors.effectiveFrom?.[0] ??
                            "Saving closes the current pay on the day before and starts this one. Earnings already made keep the terms they were earned at."}
                    </p>
                </div>

                <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="comp-note">Note (optional)</Label>
                    <Textarea
                        id="comp-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Promoted to key accounts after the October review."
                    />
                    <p className="text-xs text-muted-foreground">
                        {fieldErrors.note?.[0] ?? "Kept on the record, with who set it."}
                    </p>
                </div>
            </div>

            {/* The derived figures, live as the fields change — the same arithmetic the server prices with. */}
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2" data-testid="comp-preview">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <dt className="text-xs text-muted-foreground">Planned cost per onboarding</dt>
                        <dd className="tabular-nums font-medium text-foreground" data-testid="comp-preview-unit">
                            {preview.plannedUnitCost ? formatMoney(preview.plannedUnitCost) : "—"}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Pay for each extra onboarding</dt>
                        <dd className="tabular-nums font-medium text-foreground" data-testid="comp-preview-extra">
                            {preview.commissionPerExtra ? formatMoney(preview.commissionPerExtra) : "—"}
                        </dd>
                    </div>
                </dl>
                <p className="mt-1 text-xs text-muted-foreground">
                    {preview.plannedPerMonth > 0
                        ? `${preview.plannedPerMonth} onboardings in a planned month.`
                        : "Fill in a salary, a quota and the working days to see what an onboarding costs."}
                </p>
            </div>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Saving…" : current ? "Save new pay" : "Set compensation"}
                </Button>
            </DialogFooter>
        </form>
    );
}
