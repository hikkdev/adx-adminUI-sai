"use client";

import * as React from "react";
import { Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { compareMoney, formatDate, formatMoney, formatPct, isZeroMoney } from "@/lib/format";
import { settingsService, type FinanceSettings, type InstallationCommissionMode } from "@/services/settings";
import {
    INCENTIVE_EVENTS,
    SIZE_BAND_LABEL,
    financeService,
    incentiveEventLabel,
    type BankAccount,
    type IncentiveEvent,
    type IncentiveRate,
    type PartySizeBand,
    type PayoutSchedule,
    type RailStatus,
    type TaxParty,
    type TaxRate,
    type WithdrawalLimit,
} from "@/services/finance";
import type { LegalEntity } from "@/services/invoices";
import { BankAccounts } from "./bank-accounts";
import { LegalEntityCard } from "./legal-entity-card";
import { PayoutCadence } from "./payout-cadence";
import { RailSettings } from "./rail-settings";

interface SettingsViewProps {
    limits: WithdrawalLimit[];
    taxRates: TaxRate[];
    incentiveRates: IncentiveRate[];
    /** Lot B: the supplier on every invoice. Null only with the API off. */
    legalEntity: LegalEntity | null;
    /** Lot B (Q102): null when the platform settings row could not be read. */
    installationMode: InstallationCommissionMode | null;
    /** Lot B (Q85): ADX's own accounts, the rail keys of the platform row, and which rails are configured. */
    bankAccounts: BankAccount[];
    financeSettings: FinanceSettings | null;
    rails: RailStatus[];
    /** Lot G (Q124): the weekly draft's clock, for the cadence card. Null when that read failed. */
    schedule: PayoutSchedule | null;
    onChanged: () => void;
}

/**
 * The numbers behind the rules, all of them rows rather than constants.
 *
 * Every figure on this page has already changed once during specification,
 * which is exactly why none of them is a constant in code: moving a cap or
 * turning TDS on should be a form, not a deployment.
 *
 * Two of the three write differently, and the difference matters:
 *
 * • A **withdrawal cap** is upserted at (band, months). Editing a rung changes
 *   what everyone on it can take out from the next request onward — there is no
 *   history to preserve, because a cap has never been copied onto anything.
 * • A **tax rate** and an **incentive rate** are effective-dated. Saving one
 *   does not edit the old row; it closes it and opens a new one, because an
 *   accrual from last month was withheld at the old rate and has to stay
 *   explicable. This is why the tables below show retired rows too.
 */

const BANDS: PartySizeBand[] = ["INDIVIDUAL", "SMALL_AGENCY", "LARGE_AGENCY"];
/* Every event the backend can record — DR 05's tier bonus included, because
   the ladder pays a promotion only when a TIER_BONUS rate exists for the tier. */
const EVENTS: readonly IncentiveEvent[] = INCENTIVE_EVENTS;

/** An amount as the wire wants it: digits, optionally two decimal places. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/* Lot B: PARTNER is the print shop — 194C at cost approval, seeded at zero beside the other two. */
const TAX_PARTY_LABEL: Record<TaxParty, string> = {
    PUBLISHER: "Publishers",
    AGENT: "Agents",
    PARTNER: "Print partners",
};

/** Today, as the `date` input and the API both want it. */
const today = () => new Date().toISOString().slice(0, 10);

export function SettingsView({
    limits,
    taxRates,
    incentiveRates,
    legalEntity,
    installationMode,
    bankAccounts,
    financeSettings,
    rails,
    schedule,
    onChanged,
}: SettingsViewProps) {
    return (
        <div className="space-y-5">
            <PageHeader
                title="Finance settings"
                subtitle="The legal entity on every invoice, the tiered withdrawal caps, the tax withheld at source, what an agent earns for each kind of work, the accounts ADX pays from and the rails it pays on."
            />
            {legalEntity && <LegalEntityCard entity={legalEntity} onChanged={onChanged} />}
            <WithdrawalCaps limits={limits} onChanged={onChanged} />
            <div className="grid gap-5 xl:grid-cols-2">
                <BankAccounts accounts={bankAccounts} onChanged={onChanged} />
                <RailSettings finance={financeSettings} rails={rails} onChanged={onChanged} />
            </div>
            {/* Lot G (package CG4, Q124): the weekly draft's slot — `finance.payoutBatchCadence`. */}
            <PayoutCadence
                cadence={financeSettings === null ? null : financeSettings.payoutBatchCadence}
                schedule={schedule}
                onChanged={onChanged}
            />
            <TaxRates rates={taxRates} onChanged={onChanged} />
            <IncentiveRates rates={incentiveRates} installationMode={installationMode} onChanged={onChanged} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Withdrawal caps                                                     */
/* ------------------------------------------------------------------ */

function WithdrawalCaps({
    limits,
    onChanged,
}: {
    limits: WithdrawalLimit[];
    onChanged: () => void;
}) {
    /* Drafts keyed by rung id. A row is "dirty" only once its input differs
       from what the server sent, so Save cannot post a no-op. */
    const [drafts, setDrafts] = React.useState<Record<string, string>>({});
    const [savingId, setSavingId] = React.useState<string | null>(null);
    const [adding, setAdding] = React.useState(false);
    const [newRung, setNewRung] = React.useState({
        band: "INDIVIDUAL" as PartySizeBand,
        minMonths: "0",
        dailyCap: "",
    });

    const byBand = React.useMemo(
        () =>
            BANDS.map((band) => ({
                band,
                rungs: limits
                    .filter((limit) => limit.band === band)
                    .sort((a, b) => a.minMonths - b.minMonths),
            })),
        [limits]
    );

    async function save(limit: WithdrawalLimit) {
        const next = (drafts[limit.id] ?? "").trim();
        if (!AMOUNT.test(next)) {
            toast.error("A cap is a rupee amount, with at most two decimal places.");
            return;
        }
        setSavingId(limit.id);
        try {
            await financeService.setLimit({
                band: limit.band,
                minMonths: limit.minMonths,
                dailyCap: next,
            });
            toast.success(
                `${SIZE_BAND_LABEL[limit.band]} at ${limit.minMonths} months capped at ${formatMoney(next)} a day`
            );
            setDrafts((current) => {
                const { [limit.id]: _removed, ...rest } = current;
                return rest;
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that cap.");
        } finally {
            setSavingId(null);
        }
    }

    async function addRung() {
        const months = Number(newRung.minMonths);
        if (!Number.isInteger(months) || months < 0 || months > 120) {
            toast.error("A rung starts at a whole number of months, 0 to 120.");
            return;
        }
        if (!AMOUNT.test(newRung.dailyCap.trim())) {
            toast.error("A cap is a rupee amount, with at most two decimal places.");
            return;
        }
        setSavingId("new");
        try {
            await financeService.setLimit({
                band: newRung.band,
                minMonths: months,
                dailyCap: newRung.dailyCap.trim(),
            });
            toast.success("Rung saved", {
                description: `${SIZE_BAND_LABEL[newRung.band]} reaching ${months} months may withdraw ${formatMoney(newRung.dailyCap.trim())} a day.`,
            });
            setNewRung({ band: "INDIVIDUAL", minMonths: "0", dailyCap: "" });
            setAdding(false);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that rung.");
        } finally {
            setSavingId(null);
        }
    }

    return (
        <SectionCard
            title="Daily withdrawal caps"
            description="A party sits on the highest rung their tenure reaches. The cap limits what they may ask for in a day; it is not a promise that the money is there."
            actions={
                <Button size="sm" variant="outline" onClick={() => setAdding((open) => !open)}>
                    <Plus className="mr-1.5 size-4" />
                    {adding ? "Cancel" : "Add a rung"}
                </Button>
            }
        >
            <div className="space-y-5">
                {adding && (
                    <Card className="rounded-lg border-border bg-muted/40 p-4 shadow-none">
                        <div className="grid gap-3 sm:grid-cols-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="rung-band">Band</Label>
                                <Select
                                    value={newRung.band}
                                    onValueChange={(value) =>
                                        setNewRung((current) => ({
                                            ...current,
                                            band: value as PartySizeBand,
                                        }))
                                    }
                                >
                                    <SelectTrigger id="rung-band">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BANDS.map((band) => (
                                            <SelectItem key={band} value={band}>
                                                {SIZE_BAND_LABEL[band]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="rung-months">From (months)</Label>
                                <Input
                                    id="rung-months"
                                    inputMode="numeric"
                                    value={newRung.minMonths}
                                    onChange={(event) =>
                                        setNewRung((current) => ({
                                            ...current,
                                            minMonths: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="rung-cap">Daily cap</Label>
                                <Input
                                    id="rung-cap"
                                    inputMode="decimal"
                                    placeholder="50000.00"
                                    value={newRung.dailyCap}
                                    onChange={(event) =>
                                        setNewRung((current) => ({
                                            ...current,
                                            dailyCap: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="flex items-end">
                                <Button
                                    className="w-full"
                                    disabled={savingId === "new"}
                                    onClick={addRung}
                                >
                                    {savingId === "new" ? "Saving…" : "Save rung"}
                                </Button>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            A rung at a band and month count that already exists overwrites it.
                        </p>
                    </Card>
                )}

                {byBand.map(({ band, rungs }) => (
                    <div key={band}>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {SIZE_BAND_LABEL[band]}
                        </h4>
                        {rungs.length === 0 ? (
                            <p className="mt-2 text-sm text-danger">
                                No rung configured. A party in this band cannot withdraw at all — the
                                backend refuses to work out an allowance without one.
                            </p>
                        ) : (
                            <ul className="mt-2 divide-y rounded-lg border">
                                {rungs.map((limit) => {
                                    const draft = drafts[limit.id];
                                    const dirty = draft !== undefined && draft.trim() !== limit.dailyCap;
                                    return (
                                        <li
                                            key={limit.id}
                                            className="flex flex-wrap items-center gap-3 px-4 py-3"
                                        >
                                            <div className="min-w-[9rem]">
                                                <p className="text-sm font-medium text-foreground">
                                                    From {limit.minMonths} months
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Currently {formatMoney(limit.dailyCap)} a day
                                                </p>
                                            </div>
                                            <Input
                                                inputMode="decimal"
                                                aria-label={`Daily cap for ${SIZE_BAND_LABEL[band]} from ${limit.minMonths} months`}
                                                className="w-40"
                                                value={draft ?? limit.dailyCap}
                                                onChange={(event) =>
                                                    setDrafts((current) => ({
                                                        ...current,
                                                        [limit.id]: event.target.value,
                                                    }))
                                                }
                                            />
                                            <Button
                                                size="sm"
                                                variant={dirty ? "default" : "outline"}
                                                disabled={!dirty || savingId === limit.id}
                                                onClick={() => save(limit)}
                                            >
                                                {savingId === limit.id ? "Saving…" : "Save"}
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}

/* ------------------------------------------------------------------ */
/* Tax withheld at source                                              */
/* ------------------------------------------------------------------ */

function TaxRates({ rates, onChanged }: { rates: TaxRate[]; onChanged: () => void }) {
    const [form, setForm] = React.useState({
        appliesTo: "PUBLISHER" as TaxParty,
        section: "194C",
        ratePct: "",
        effectiveFrom: today(),
        note: "",
    });
    const [busy, setBusy] = React.useState(false);

    /* In force = not yet closed. The rest are kept on screen because they are
       what past accruals were withheld at, and hiding them would make an old
       deduction impossible to explain. */
    const current = rates.filter((rate) => rate.effectiveTo === null);
    const retired = rates.filter((rate) => rate.effectiveTo !== null);

    const nothingWithheld = current.every((rate) => isZeroMoney(rate.ratePct));

    async function save() {
        if (!AMOUNT.test(form.ratePct.trim()) || Number(form.ratePct) > 100) {
            toast.error("A rate is a percentage between 0 and 100, with at most two decimals.");
            return;
        }
        if (form.section.trim().length < 3) {
            toast.error("Name the section of the Income Tax Act being applied, e.g. 194C.");
            return;
        }
        setBusy(true);
        try {
            await financeService.setTaxRate({
                appliesTo: form.appliesTo,
                section: form.section.trim(),
                ratePct: form.ratePct.trim(),
                effectiveFrom: new Date(form.effectiveFrom).toISOString(),
                ...(form.note.trim() ? { note: form.note.trim() } : {}),
            });
            toast.success(`${TAX_PARTY_LABEL[form.appliesTo]} TDS set`, {
                description: `${formatPct(form.ratePct.trim())} under ${form.section.trim()} from ${formatDate(form.effectiveFrom)}. Money already withheld keeps its old rate.`,
            });
            setForm((state) => ({ ...state, ratePct: "", note: "" }));
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that rate.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Tax withheld at source"
            description="Deducted when income is credited — an accrual or an incentive — not when it is withdrawn. A withdrawal therefore deducts nothing."
        >
            <div className="space-y-4">
                {nothingWithheld && current.length > 0 && (
                    <Card className="rounded-lg border-warning/40 bg-warning-soft p-3 shadow-none">
                        <div className="flex items-start gap-2.5">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                            <p className="text-xs text-foreground">
                                Every rate in force is 0%, so nothing is being withheld from anybody
                                today. That is the seeded default — TDS was confirmed as something ADX
                                deducts, but the rates were never given. Set them before the first
                                payout.
                            </p>
                        </div>
                    </Card>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-3 py-2">Applies to</th>
                                <th className="px-3 py-2">Section</th>
                                <th className="px-3 py-2">Rate</th>
                                <th className="px-3 py-2">In force</th>
                                <th className="px-3 py-2">Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...current, ...retired].map((rate) => (
                                <tr key={rate.id} className="border-b last:border-0">
                                    <td className="px-3 py-2.5 font-medium text-foreground">
                                        {TAX_PARTY_LABEL[rate.appliesTo]}
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground">{rate.section}</td>
                                    <td className="px-3 py-2.5 font-medium tabular-nums">
                                        {formatPct(rate.ratePct)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {rate.effectiveTo === null ? (
                                            <StatusBadge
                                                status={{
                                                    label: `From ${formatDate(rate.effectiveFrom)}`,
                                                    tone: "success",
                                                }}
                                            />
                                        ) : (
                                            <span className="text-xs text-muted-foreground">
                                                {formatDate(rate.effectiveFrom)} –{" "}
                                                {formatDate(rate.effectiveTo)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                        {rate.note ?? "—"}
                                    </td>
                                </tr>
                            ))}
                            {rates.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                                        No rate has been configured.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="rounded-lg border bg-muted/40 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Set a rate
                    </h4>
                    <div className="mt-3 grid gap-3 lg:grid-cols-5">
                        <div className="space-y-1.5">
                            <Label htmlFor="tax-applies">Applies to</Label>
                            <Select
                                value={form.appliesTo}
                                onValueChange={(value) =>
                                    setForm((state) => ({
                                        ...state,
                                        appliesTo: value as TaxParty,
                                        // The default section differs by party, and
                                        // getting it wrong is a compliance error rather
                                        // than a typo.
                                        section: value === "PUBLISHER" ? "194C" : "194H",
                                    }))
                                }
                            >
                                <SelectTrigger id="tax-applies">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PUBLISHER">Publishers</SelectItem>
                                    <SelectItem value="AGENT">Agents</SelectItem>
                                    <SelectItem value="PARTNER">Print partners</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tax-section">Section</Label>
                            <Input
                                id="tax-section"
                                value={form.section}
                                onChange={(event) =>
                                    setForm((state) => ({ ...state, section: event.target.value }))
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tax-rate">Rate %</Label>
                            <Input
                                id="tax-rate"
                                inputMode="decimal"
                                placeholder="2.00"
                                value={form.ratePct}
                                onChange={(event) =>
                                    setForm((state) => ({ ...state, ratePct: event.target.value }))
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="tax-from">Effective from</Label>
                            <Input
                                id="tax-from"
                                type="date"
                                value={form.effectiveFrom}
                                onChange={(event) =>
                                    setForm((state) => ({ ...state, effectiveFrom: event.target.value }))
                                }
                            />
                        </div>
                        <div className="flex items-end">
                            <Button className="w-full" disabled={busy} onClick={save}>
                                {busy ? "Saving…" : "Set rate"}
                            </Button>
                        </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                        <Label htmlFor="tax-note">Note (optional)</Label>
                        <Input
                            id="tax-note"
                            value={form.note}
                            onChange={(event) => setForm((state) => ({ ...state, note: event.target.value }))}
                            placeholder="Why this rate, and who confirmed it."
                        />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Saving closes the rate currently in force and opens a new one. Nothing already
                        withheld is re-rated.
                    </p>
                </div>
            </div>
        </SectionCard>
    );
}

/* ------------------------------------------------------------------ */
/* Incentive rates                                                     */
/* ------------------------------------------------------------------ */

function IncentiveRates({
    rates,
    installationMode,
    onChanged,
}: {
    rates: IncentiveRate[];
    installationMode: InstallationCommissionMode | null;
    onChanged: () => void;
}) {
    const [form, setForm] = React.useState({
        event: "PUBLISHER_ONBOARDED" as IncentiveEvent,
        tier: "*",
        amount: "",
        effectiveFrom: today(),
    });
    const [busy, setBusy] = React.useState(false);

    const sorted = React.useMemo(
        () =>
            [...rates].sort((a, b) => {
                if (a.event !== b.event) return a.event.localeCompare(b.event);
                if (a.effectiveTo !== b.effectiveTo) return a.effectiveTo === null ? -1 : 1;
                return compareMoney(b.amount, a.amount);
            }),
        [rates]
    );

    async function save() {
        if (!AMOUNT.test(form.amount.trim())) {
            toast.error("An incentive is a rupee amount, with at most two decimal places.");
            return;
        }
        setBusy(true);
        try {
            await financeService.setIncentiveRate({
                event: form.event,
                ...(form.tier.trim() ? { tier: form.tier.trim() } : {}),
                amount: form.amount.trim(),
                effectiveFrom: new Date(form.effectiveFrom).toISOString(),
            });
            toast.success(`${incentiveEventLabel(form.event)} set to ${formatMoney(form.amount.trim())}`, {
                description: `For tier ${form.tier.trim() || "*"} from ${formatDate(form.effectiveFrom)}. Incentives already earned keep the rate they were earned at.`,
            });
            setForm((state) => ({ ...state, amount: "" }));
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that rate.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Agent incentive rates"
            description={`What an agent earns for each kind of work, by tier. "*" covers every tier, so a rate that does not vary needs one row rather than one per tier.`}
        >
            <div className="space-y-4">
                <InstallationMode mode={installationMode} onChanged={onChanged} />
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-3 py-2">Event</th>
                                <th className="px-3 py-2">Tier</th>
                                <th className="px-3 py-2">Amount</th>
                                <th className="px-3 py-2">In force</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((rate) => (
                                <tr
                                    key={rate.id}
                                    className={cn(
                                        "border-b last:border-0",
                                        rate.effectiveTo !== null && "text-muted-foreground"
                                    )}
                                >
                                    <td className="px-3 py-2.5 font-medium text-foreground">
                                        {incentiveEventLabel(rate.event)}
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground">
                                        {rate.tier === "*" ? "Every tier" : rate.tier}
                                    </td>
                                    <td className="px-3 py-2.5 font-medium tabular-nums">
                                        {formatMoney(rate.amount)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {rate.effectiveTo === null ? (
                                            <StatusBadge
                                                status={{
                                                    label: `From ${formatDate(rate.effectiveFrom)}`,
                                                    tone: "success",
                                                }}
                                            />
                                        ) : (
                                            <span className="text-xs">
                                                {formatDate(rate.effectiveFrom)} –{" "}
                                                {formatDate(rate.effectiveTo)}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {rates.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                                        No incentive rate has been configured, so nothing is earned
                                        automatically. Ops can still record an incentive by hand.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="rounded-lg border bg-muted/40 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Set a rate
                    </h4>
                    <div className="mt-3 grid gap-3 lg:grid-cols-5">
                        <div className="space-y-1.5 lg:col-span-2">
                            <Label htmlFor="incentive-event">Event</Label>
                            <Select
                                value={form.event}
                                onValueChange={(value) =>
                                    setForm((state) => ({ ...state, event: value as IncentiveEvent }))
                                }
                            >
                                <SelectTrigger id="incentive-event">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EVENTS.map((event) => (
                                        <SelectItem key={event} value={event}>
                                            {incentiveEventLabel(event)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="incentive-tier">Tier</Label>
                            <Input
                                id="incentive-tier"
                                value={form.tier}
                                onChange={(event) =>
                                    setForm((state) => ({ ...state, tier: event.target.value }))
                                }
                                placeholder="* for every tier"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="incentive-amount">Amount</Label>
                            <Input
                                id="incentive-amount"
                                inputMode="decimal"
                                placeholder="500.00"
                                value={form.amount}
                                onChange={(event) =>
                                    setForm((state) => ({ ...state, amount: event.target.value }))
                                }
                            />
                        </div>
                        <div className="flex items-end">
                            <Button className="w-full" disabled={busy} onClick={save}>
                                {busy ? "Saving…" : "Set rate"}
                            </Button>
                        </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                        <Label htmlFor="incentive-from">Effective from</Label>
                        <Input
                            id="incentive-from"
                            type="date"
                            className="max-w-xs"
                            value={form.effectiveFrom}
                            onChange={(event) =>
                                setForm((state) => ({ ...state, effectiveFrom: event.target.value }))
                            }
                        />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Effective-dated like a rate card. An incentive already earned keeps the rate and
                        the tier it was earned at, so a change here never re-rates past work.
                    </p>
                </div>
            </div>
        </SectionCard>
    );
}

/* ------------------------------------------------------------------ */
/* Installation commission mode                                        */
/* ------------------------------------------------------------------ */

/**
 * Lot B (Q102): how an installation is priced.
 *
 * `installationFeeFor(order, tier)` is the one resolver. FLAT pays the
 * INSTALLATION rate at the agent's tier from the table below; PER_ORDER pays
 * the figure ops typed at assign or print-ready, and falls back to the flat
 * rate when nobody typed one. The switch lives on the platform settings row
 * — `PUT /settings/platform { installation: { commissionMode } }` — rather
 * than here, so it is written as a one-leaf patch and nothing beside it moves.
 */
function InstallationMode({
    mode,
    onChanged,
}: {
    mode: InstallationCommissionMode | null;
    onChanged: () => void;
}) {
    const [busy, setBusy] = React.useState(false);

    async function switchTo(next: InstallationCommissionMode) {
        if (next === mode) return;
        setBusy(true);
        try {
            await settingsService.update({ installation: { commissionMode: next } });
            toast.success(next === "FLAT" ? "Installations pay the flat rate" : "Installations pay the per-order fee", {
                description:
                    next === "FLAT"
                        ? "The INSTALLATION rate at the agent's tier, from the table below."
                        : "The agent fee ops types at assign or print-ready; the flat rate when none was typed.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not change the mode.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Installation commission</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {mode === null
                        ? "The platform settings row could not be read, so the mode is unknown."
                        : mode === "FLAT"
                          ? "Flat: the INSTALLATION rate at the agent's tier, quoted on the offer and recorded at sign-off."
                          : "Per order: the agent fee ops types at assign or print-ready. The flat rate stands in when none was typed."}
                </p>
            </div>
            <div className="flex items-center gap-1 rounded-md border bg-card p-0.5" role="radiogroup" aria-label="Installation commission mode">
                {(["FLAT", "PER_ORDER"] as const).map((option) => (
                    <Button
                        key={option}
                        type="button"
                        size="sm"
                        role="radio"
                        aria-checked={mode === option}
                        variant={mode === option ? "default" : "ghost"}
                        className="h-7"
                        disabled={busy || mode === null}
                        onClick={() => void switchTo(option)}
                    >
                        {option === "FLAT" ? "Flat" : "Per order"}
                    </Button>
                ))}
            </div>
        </div>
    );
}
