"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/adx/section-card";
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GRADE_META } from "@/services/agent-applications";
import { priceTerms } from "@/services/agents";
import {
    PAY_GRADES,
    SETTING_BOUNDS,
    changedKeys,
    settingsService,
    type AgentPayDefaults,
    type PayGrade,
    type PlatformSettingsPatch,
} from "@/services/settings";

interface AgentPayByGradeProps {
    /** `settings.agents.compensation`. Null when the platform row could not be read, or the server predates the block. */
    pay: AgentPayDefaults | null;
    /** `settings.edit` — the permission `PUT /settings/platform` asks for. */
    mayEdit: boolean;
    onChanged: () => void;
}

/** The inputs hold text while somebody types; it is parsed only on save. */
type GradeDraft = { monthlySalary: string; dailyQuota: string; workingDaysPerMonth: string };
type Draft = { uplift: string; byGrade: Record<PayGrade, GradeDraft> };
type FieldKey = keyof GradeDraft;

const SALARY = SETTING_BOUNDS["agents.compensation.monthlySalary"];
const QUOTA = SETTING_BOUNDS["agents.compensation.dailyQuota"];
const DAYS = SETTING_BOUNDS["agents.compensation.workingDaysPerMonth"];
const UPLIFT = SETTING_BOUNDS["agents.compensation.commissionUpliftPct"];

/** What each field refuses, in words — the line under the table says the first of them. */
const FIELD_RULE: Record<FieldKey | "uplift", string> = {
    monthlySalary: "A monthly salary is a rupee amount from ₹0 to ₹1,00,00,000.",
    dailyQuota: "A daily quota is a whole number from 1 to 100.",
    workingDaysPerMonth: "Working days a month is a whole number from 1 to 31.",
    uplift: "The commission on extra onboardings is 0% to 200% on top.",
};

const toDraft = (pay: AgentPayDefaults): Draft => ({
    uplift: String(pay.commissionUpliftPct),
    byGrade: Object.fromEntries(
        PAY_GRADES.map((grade) => [
            grade,
            {
                monthlySalary: String(pay.byGrade[grade].monthlySalary),
                dailyQuota: String(pay.byGrade[grade].dailyQuota),
                workingDaysPerMonth: String(pay.byGrade[grade].workingDaysPerMonth),
            },
        ]),
    ) as Record<PayGrade, GradeDraft>,
});

/** A number with at most two decimals inside the bounds, or null. */
function parseDecimal(text: string, bounds: { min: number; max: number }): number | null {
    if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= bounds.min && value <= bounds.max ? value : null;
}

/** A whole number inside the bounds, or null. */
function parseWhole(text: string, bounds: { min: number; max: number }): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= bounds.min && value <= bounds.max ? value : null;
}

/**
 * The draft as the settings block, plus which cells refuse. `value` is null
 * while anything refuses, so Save cannot send a figure the server would.
 */
export function parsePayDraft(draft: Draft): { value: AgentPayDefaults | null; invalid: Set<string>; firstError: string | null } {
    const invalid = new Set<string>();
    let firstError: string | null = null;
    const refuse = (cell: string, message: string) => {
        invalid.add(cell);
        firstError ??= message;
    };
    const byGrade = {} as AgentPayDefaults["byGrade"];
    for (const grade of PAY_GRADES) {
        const row = draft.byGrade[grade];
        const monthlySalary = parseDecimal(row.monthlySalary, SALARY);
        const dailyQuota = parseWhole(row.dailyQuota, QUOTA);
        const workingDaysPerMonth = parseWhole(row.workingDaysPerMonth, DAYS);
        if (monthlySalary === null) refuse(`${grade}.monthlySalary`, `${grade}: ${FIELD_RULE.monthlySalary}`);
        if (dailyQuota === null) refuse(`${grade}.dailyQuota`, `${grade}: ${FIELD_RULE.dailyQuota}`);
        if (workingDaysPerMonth === null) refuse(`${grade}.workingDaysPerMonth`, `${grade}: ${FIELD_RULE.workingDaysPerMonth}`);
        byGrade[grade] = { monthlySalary: monthlySalary ?? 0, dailyQuota: dailyQuota ?? 0, workingDaysPerMonth: workingDaysPerMonth ?? 0 };
    }
    const uplift = parseDecimal(draft.uplift, UPLIFT);
    if (uplift === null) refuse("uplift", FIELD_RULE.uplift);
    return {
        value: invalid.size === 0 ? { commissionUpliftPct: uplift ?? 0, byGrade } : null,
        invalid,
        firstError,
    };
}

/** "G2 · Senior field" — the grade names the agent pages use. */
const gradeName = (grade: PayGrade) => `${grade} · ${GRADE_META[grade].label}`;

/**
 * CP-1: the four grades' starting pay, kept on the platform settings row.
 *
 * These only fill the form when the desk sets an agent's pay on their page.
 * Each agent then carries their own effective-dated record, which is what
 * pays — so saving here moves nobody's current pay, and the card says so.
 */
export function AgentPayByGrade({ pay, mayEdit, onChanged }: AgentPayByGradeProps) {
    /* Null while reading; a draft only exists while editing, so Cancel is simply dropping it. */
    const [draft, setDraft] = React.useState<Draft | null>(null);
    const [busy, setBusy] = React.useState(false);
    const editing = draft !== null;
    const shown = draft ?? (pay ? toDraft(pay) : null);
    const parsed = draft ? parsePayDraft(draft) : null;
    const patch =
        pay && parsed?.value
            ? changedKeys(pay as unknown as Record<string, unknown>, parsed.value as unknown as Record<string, unknown>)
            : {};
    const dirty = Object.keys(patch).length > 0;

    function setCell(grade: PayGrade, key: FieldKey, value: string) {
        setDraft((current) => (current ? { ...current, byGrade: { ...current.byGrade, [grade]: { ...current.byGrade[grade], [key]: value } } } : current));
    }

    async function save() {
        if (!parsed?.value || !dirty || busy) return;
        setBusy(true);
        try {
            await settingsService.update({ agents: { compensation: patch as NonNullable<PlatformSettingsPatch["agents"]>["compensation"] } });
            toast.success("Agent pay by grade saved", {
                description: "New pay records start from these figures. No agent's current pay has changed.",
            });
            setDraft(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save the pay by grade.");
        } finally {
            setBusy(false);
        }
    }

    const actions = !pay || !mayEdit ? undefined : editing ? (
        <>
            <Button size="sm" variant="outline" className="bg-card" disabled={busy} onClick={() => setDraft(null)}>
                Cancel
            </Button>
            <Button size="sm" disabled={!parsed?.value || !dirty || busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
            </Button>
        </>
    ) : (
        <Button size="sm" variant="outline" onClick={() => pay && setDraft(toDraft(pay))}>
            <Pencil className="mr-1.5 size-4" />
            Edit
        </Button>
    );

    return (
        <SectionCard
            title="Agent pay by grade"
            description="What an agent's pay starts from when you set it on their page. Changing these doesn't change anyone's current pay — each agent keeps their own record."
            actions={actions}
        >
            {shown === null ? (
                <p className="text-sm text-muted-foreground" data-testid="agent-pay-unavailable">
                    The pay by grade could not be read from the platform settings, so it cannot be shown or changed here.
                </p>
            ) : (
                <div className="space-y-4" data-testid="agent-pay-by-grade">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-3 py-2">Grade</th>
                                    <th className="px-3 py-2">Monthly salary (₹)</th>
                                    <th className="px-3 py-2">Daily quota</th>
                                    <th className="px-3 py-2">Working days a month</th>
                                    <th className="px-3 py-2">Planned cost per onboarding</th>
                                    <th className="px-3 py-2">Pay for each extra onboarding</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PAY_GRADES.map((grade) => {
                                    const row = shown.byGrade[grade];
                                    const quota = Number(row.dailyQuota);
                                    const days = Number(row.workingDaysPerMonth);
                                    /* The same arithmetic the agent's own pay card prices with. */
                                    const price = priceTerms({
                                        monthlySalary: row.monthlySalary.trim(),
                                        dailyQuota: Number.isFinite(quota) ? quota : 0,
                                        workingDaysPerMonth: Number.isFinite(days) ? days : 0,
                                        commissionUpliftPct: shown.uplift.trim() || "0",
                                    });
                                    return (
                                        <tr key={grade} className="border-b last:border-0" data-testid={`pay-row-${grade}`}>
                                            <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">{gradeName(grade)}</td>
                                            {(["monthlySalary", "dailyQuota", "workingDaysPerMonth"] as const).map((key) => (
                                                <td key={key} className="px-3 py-2">
                                                    <Input
                                                        aria-label={`${gradeName(grade)} ${key === "monthlySalary" ? "monthly salary" : key === "dailyQuota" ? "daily quota" : "working days a month"}`}
                                                        inputMode={key === "monthlySalary" ? "decimal" : "numeric"}
                                                        className={cn(
                                                            "h-8 w-28 tabular-nums disabled:cursor-default disabled:opacity-100",
                                                            !editing && "border-transparent bg-transparent px-0 shadow-none",
                                                            parsed?.invalid.has(`${grade}.${key}`) && "border-danger",
                                                        )}
                                                        aria-invalid={parsed?.invalid.has(`${grade}.${key}`) || undefined}
                                                        disabled={!editing || busy}
                                                        value={row[key]}
                                                        onChange={(event) => setCell(grade, key, event.target.value)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 tabular-nums text-foreground" data-testid={`pay-unit-${grade}`}>
                                                {price.plannedUnitCost ? formatMoney(price.plannedUnitCost) : "—"}
                                            </td>
                                            <td className="px-3 py-2 tabular-nums text-foreground" data-testid={`pay-extra-${grade}`}>
                                                {price.commissionPerExtra ? formatMoney(price.commissionPerExtra) : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid max-w-sm gap-1.5">
                        <Label htmlFor="pay-uplift">Commission on extra onboardings (% on top)</Label>
                        <Input
                            id="pay-uplift"
                            inputMode="decimal"
                            className={cn(
                                "h-8 w-28 tabular-nums disabled:cursor-default disabled:opacity-100",
                                !editing && "border-transparent bg-transparent px-0 shadow-none",
                                parsed?.invalid.has("uplift") && "border-danger",
                            )}
                            aria-invalid={parsed?.invalid.has("uplift") || undefined}
                            disabled={!editing || busy}
                            value={shown.uplift}
                            onChange={(event) => {
                                const value = event.target.value;
                                setDraft((current) => (current ? { ...current, uplift: value } : current));
                            }}
                        />
                    </div>

                    {/* Form symmetry: no hint under any one cell — the guidance, or the first thing refused, is this one line. */}
                    <p
                        className={cn("text-xs", parsed?.firstError ? "text-danger" : "text-muted-foreground")}
                        data-testid="agent-pay-line"
                    >
                        {parsed?.firstError ??
                            "Planned cost per onboarding is the salary spread over the daily quota for every working day of the month. An onboarding past the day's quota pays that plus the commission."}
                    </p>
                </div>
            )}
        </SectionCard>
    );
}
