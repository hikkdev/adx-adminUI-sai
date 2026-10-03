"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/adx/section-card";
import { changedKeys, settingsService } from "@/services/settings";
import {
    ORDER_SCREENING_BOUNDS,
    fromScreeningDraft,
    screeningDraftProblems,
    toScreeningDraft,
    type OrderScreeningDraft,
    type OrderScreeningSettings,
    type ScreeningDraftProblem,
} from "@/services/order-screening";

interface FraudSettingsViewProps {
    /** `settings.fraud.orderScreening`: null when the backend did not serve it. */
    settings: OrderScreeningSettings | null;
    live: boolean;
    mayEdit: boolean;
    onSaved: () => void;
}

const FORM_ID = "order-screening-form";

/** The one line under the thresholds when they do not hold together, in the owner's plain words. */
export const PROBLEM_LINE: Record<ScreeningDraftProblem, string> = {
    reviewAt: `The review line is a score from ${ORDER_SCREENING_BOUNDS.threshold.min} to ${ORDER_SCREENING_BOUNDS.threshold.max}, at most one decimal place.`,
    holdAt: `The hold line is a score from ${ORDER_SCREENING_BOUNDS.threshold.min} to ${ORDER_SCREENING_BOUNDS.threshold.max}, at most one decimal place.`,
    order: "The hold line cannot be below the review line.",
    newAccountDays: `New account is ${ORDER_SCREENING_BOUNDS.newAccountDays.min} to ${ORDER_SCREENING_BOUNDS.newAccountDays.max} whole days.`,
    bigOrderAmount: `Large order is ₹${ORDER_SCREENING_BOUNDS.bigOrderAmount.min} to ₹${ORDER_SCREENING_BOUNDS.bigOrderAmount.max.toLocaleString("en-IN")}, at most two places of paise.`,
    velocityCount: `Many orders is ${ORDER_SCREENING_BOUNDS.velocityCount.min} to ${ORDER_SCREENING_BOUNDS.velocityCount.max}.`,
    velocityMinutes: `The window is ${ORDER_SCREENING_BOUNDS.velocityMinutes.min} to ${ORDER_SCREENING_BOUNDS.velocityMinutes.max.toLocaleString("en-IN")} minutes.`,
};

/**
 * Settings › Fraud — order screening (the owner, 2 Oct 2026: "Watch mode,
 * no automatic holds … I agree on both").
 *
 * Whether every order is scored, the two lines on the 0–100 score the
 * Fraud review tab prints (flag for review; pause too), the automatic
 * holds switch — off, which is watch mode — and the numbers behind the
 * order's own signals. Thresholds are typed as the score and stored 0–1.
 * Automation never goes past a reversible hold: cancelling as fraud and
 * suspending stay a person's decision whatever is set here.
 */
export function FraudSettingsView({ settings, live, mayEdit, onSaved }: FraudSettingsViewProps) {
    if (!live || !settings) {
        return (
            <SectionCard title="Order screening" description="How orders are scored and when a score asks a person to look">
                <p className="text-sm text-muted-foreground">
                    {!live ? (
                        "Not connected to the ADX backend — the section is read from the platform row and cannot be shown from fixtures."
                    ) : (
                        <>
                            This backend does not serve <code className="rounded bg-muted px-1 py-0.5 text-xs">fraud.orderScreening</code> on the platform row, so order screening cannot be configured here.
                        </>
                    )}
                </p>
            </SectionCard>
        );
    }
    return <ScreeningForm key={JSON.stringify(settings)} settings={settings} mayEdit={mayEdit} onSaved={onSaved} />;
}

/** One labelled field of a pair: the unit in the label, nothing under the input — guidance goes under the whole row. */
function Field({ id, label, unit, value, invalid, disabled, onChange, prefix }: { id: string; label: string; unit: string; value: string; invalid: boolean; disabled: boolean; onChange: (value: string) => void; prefix?: string }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>
                {label} <span className="text-muted-foreground">({unit})</span>
            </Label>
            <div className="relative w-40">
                {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
                <Input
                    id={id}
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    disabled={disabled}
                    className={prefix ? "pl-6 tabular-nums" : "tabular-nums"}
                    aria-invalid={invalid ? true : undefined}
                />
            </div>
        </div>
    );
}

/** One switch of a pair: the label, the switch, and what its state means beside it. */
function SwitchField({ id, label, checked, disabled, onChange, on, off }: { id: string; label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void; on: string; off: string }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex h-9 items-center gap-3">
                <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
                <span className="text-sm text-muted-foreground" data-testid={`${id}-state`}>
                    {checked ? on : off}
                </span>
            </div>
        </div>
    );
}

/** The guidance or the problem under a row — one line for the whole row, so the cells stay the same height. */
function RowLine({ problem, children }: { problem?: string | null; children: React.ReactNode }) {
    return problem ? <p className="mt-2 text-xs text-danger">{problem}</p> : <p className="mt-2 text-xs text-muted-foreground">{children}</p>;
}

function ScreeningForm({ settings, mayEdit, onSaved }: { settings: OrderScreeningSettings; mayEdit: boolean; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<OrderScreeningDraft>(() => toScreeningDraft(settings));
    const [busy, setBusy] = React.useState(false);
    const problems = screeningDraftProblems(draft);
    const next = fromScreeningDraft(draft, settings);
    const patch = next ? changedKeys(settings as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>) : null;
    const dirty = patch !== null && Object.keys(patch).length > 0;
    const set = <K extends keyof OrderScreeningDraft>(key: K, value: OrderScreeningDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
    const has = (problem: ScreeningDraftProblem) => problems.includes(problem);
    const first = (...keys: ScreeningDraftProblem[]) => keys.find(has) ?? null;
    const locked = !mayEdit || busy;

    async function save() {
        if (!patch || !dirty || busy || !mayEdit) return;
        setBusy(true);
        try {
            await settingsService.update({ fraud: { orderScreening: patch as Partial<OrderScreeningSettings> } });
            toast.success("Order screening saved", {
                description: next?.autoHold ? "Orders past the hold line are now paused until a person looks." : "Watch mode: orders are flagged, never paused automatically.",
            });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save order screening.");
        } finally {
            setBusy(false);
        }
    }

    const thresholdProblem = first("reviewAt", "holdAt", "order");
    const accountProblem = first("newAccountDays", "bigOrderAmount");
    const velocityProblem = first("velocityCount", "velocityMinutes");

    return (
        <form
            id={FORM_ID}
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <SectionCard
                title="Order screening"
                description="Every order is scored on the advertiser, the publisher and the order itself. A score past the review line puts the order on Orders › Fraud review."
                actions={
                    <Button type="submit" form={FORM_ID} size="sm" disabled={!mayEdit || !dirty || busy || next === null}>
                        {busy ? "Saving…" : "Save"}
                    </Button>
                }
                footer={
                    <p className="text-xs text-muted-foreground">
                        {mayEdit ? "Read by the next order scored and by the nightly re-score of open orders. " : "Your role can read this but not change it — that needs Edit settings. "}
                        The flagged orders are on{" "}
                        <Link href="/orders/fraud-review" className="text-primary hover:underline">
                            Orders › Fraud review
                        </Link>
                        .
                    </p>
                }
            >
                <div className="space-y-6">
                    <div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <SwitchField id="screening-enabled" label="Screening" checked={draft.enabled} disabled={locked} onChange={(value) => set("enabled", value)} on="On — every order is scored" off="Off — new orders are not scored" />
                            <SwitchField
                                id="screening-auto-hold"
                                label="Automatic holds"
                                checked={draft.autoHold}
                                disabled={locked || !draft.enabled}
                                onChange={(value) => set("autoHold", value)}
                                on="On — past the hold line, paused until a person looks"
                                off="Off — watch mode"
                            />
                        </div>
                        <RowLine>
                            Watch mode flags orders for review but never pauses them on its own; turn automatic holds on once the flags look right. Even then the most it does is a hold a person can release — cancelling as fraud and suspending an advertiser are always somebody&rsquo;s decision.
                        </RowLine>
                    </div>

                    <div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="screening-review-at" label="Review at" unit="score 0–100" value={draft.reviewAt} invalid={has("reviewAt") || has("order")} disabled={locked} onChange={(value) => set("reviewAt", value)} />
                            <Field id="screening-hold-at" label="Hold at" unit="score 0–100" value={draft.holdAt} invalid={has("holdAt") || has("order")} disabled={locked} onChange={(value) => set("holdAt", value)} />
                        </div>
                        <RowLine problem={thresholdProblem ? PROBLEM_LINE[thresholdProblem] : null}>
                            At the review line an order is flagged for Fraud review; at the hold line it is also paused — but only while automatic holds are on.
                        </RowLine>
                    </div>

                    <div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="screening-new-account" label="New account" unit="days" value={draft.newAccountDays} invalid={has("newAccountDays")} disabled={locked} onChange={(value) => set("newAccountDays", value)} />
                            <Field id="screening-big-order" label="Large order" unit="₹" prefix="₹" value={draft.bigOrderAmount} invalid={has("bigOrderAmount")} disabled={locked} onChange={(value) => set("bigOrderAmount", value)} />
                        </div>
                        <RowLine problem={accountProblem ? PROBLEM_LINE[accountProblem] : null}>
                            &ldquo;New account, large order&rdquo;: an advertiser younger than this many days placing an order above this amount.
                        </RowLine>
                    </div>

                    <div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="screening-velocity-count" label="Many orders" unit="more than" value={draft.velocityCount} invalid={has("velocityCount")} disabled={locked} onChange={(value) => set("velocityCount", value)} />
                            <Field id="screening-velocity-minutes" label="Within" unit="minutes" value={draft.velocityMinutes} invalid={has("velocityMinutes")} disabled={locked} onChange={(value) => set("velocityMinutes", value)} />
                        </div>
                        <RowLine problem={velocityProblem ? PROBLEM_LINE[velocityProblem] : null}>
                            &ldquo;Many orders in a short time&rdquo;: more than this many orders by one advertiser within this window.
                        </RowLine>
                    </div>
                </div>
            </SectionCard>
        </form>
    );
}
