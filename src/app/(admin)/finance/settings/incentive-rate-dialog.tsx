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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import {
    INCENTIVE_EVENTS,
    financeService,
    incentiveEventLabel,
    incentiveTierLabel,
    incentiveTierOptions,
    type IncentiveEvent,
    type IncentiveRate,
} from "@/services/finance";

/** What the dialog opens with — blank for "Set a rate", a row's own figures for "Change". */
export interface IncentiveRateDraft {
    event: IncentiveEvent;
    tier: string;
    amount: string;
    paysNothing: boolean;
    /** `YYYY-MM-DD`, as the date input holds it. */
    effectiveFrom: string;
}

/** Today, as the date input and the API both want it. */
const today = () => new Date().toISOString().slice(0, 10);

/** An amount as the wire wants it: digits, optionally two decimal places. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

export const blankIncentiveDraft = (): IncentiveRateDraft => ({
    event: "PUBLISHER_ONBOARDED",
    tier: "*",
    amount: "",
    paysNothing: false,
    effectiveFrom: today(),
});

/** A row in force, as the Change dialog opens on it: its event, tier and figure, from today. */
export const draftFromRate = (rate: IncentiveRate): IncentiveRateDraft => ({
    event: rate.event,
    tier: rate.tier,
    amount: rate.paysNothing ? "" : rate.amount,
    paysNothing: rate.paysNothing,
    effectiveFrom: today(),
});

interface IncentiveRateDialogProps {
    /** Null while closed. "set" opens a blank form; "change" opens on a row. */
    open: { mode: "set" | "change"; draft: IncentiveRateDraft } | null;
    onClose: () => void;
    onSaved: () => void;
}

/**
 * Setting or changing one incentive rate.
 *
 * Rates are effective-dated: saving never edits the row in force, it closes
 * it and opens a new one, so an incentive earned last month stays explicable
 * at the rate it was earned at. "Pays nothing" writes a row too — only a row
 * can stop a broader one, and ₹0.00 would read as a price somebody set.
 */
export function IncentiveRateDialog({ open, onClose, onSaved }: IncentiveRateDialogProps) {
    return (
        <Dialog open={open !== null} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-lg">
                {/* Mounted only while open, so each opening starts from its own draft. */}
                {open && <IncentiveRateForm mode={open.mode} initial={open.draft} onClose={onClose} onSaved={onSaved} />}
            </DialogContent>
        </Dialog>
    );
}

function IncentiveRateForm({
    mode,
    initial,
    onClose,
    onSaved,
}: {
    mode: "set" | "change";
    initial: IncentiveRateDraft;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = React.useState<IncentiveRateDraft>(initial);
    const [busy, setBusy] = React.useState(false);
    const tiers = incentiveTierOptions(form.event, initial.tier);

    function chooseEvent(event: IncentiveEvent) {
        setForm((state) => {
            /* A side key prices only the lead events; moving off one falls back to every tier. */
            const offered = incentiveTierOptions(event, initial.tier).some((option) => option.value === state.tier);
            return { ...state, event, tier: offered ? state.tier : "*" };
        });
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        if (!form.paysNothing && !AMOUNT.test(form.amount.trim())) {
            toast.error("An incentive is a rupee amount, with at most two decimal places.");
            return;
        }
        if (!form.effectiveFrom) {
            toast.error("Choose the day this rate starts on.");
            return;
        }
        setBusy(true);
        try {
            await financeService.setIncentiveRate({
                event: form.event,
                tier: form.tier,
                amount: form.paysNothing ? "0.00" : form.amount.trim(),
                ...(form.paysNothing ? { paysNothing: true } : {}),
                effectiveFrom: new Date(form.effectiveFrom).toISOString(),
            });
            toast.success(
                form.paysNothing
                    ? `${incentiveEventLabel(form.event)} now pays nothing`
                    : `${incentiveEventLabel(form.event)} set to ${formatMoney(form.amount.trim())}`,
                {
                    description: `For ${incentiveTierLabel(form.tier).toLowerCase()} from ${formatDate(form.effectiveFrom)}. Incentives already earned keep the rate they were earned at.`,
                },
            );
            onSaved();
            onClose();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that rate.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{mode === "change" ? "Change a rate" : "Set a rate"}</DialogTitle>
                <DialogDescription>
                    {mode === "change"
                        ? `${incentiveEventLabel(initial.event)} for ${incentiveTierLabel(initial.tier).toLowerCase()}. Type the new figure and the day it starts on.`
                        : "What an agent earns for one kind of work, for every tier or for one."}
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <Label htmlFor="incentive-event">Event</Label>
                    <Select value={form.event} onValueChange={(value) => chooseEvent(value as IncentiveEvent)}>
                        <SelectTrigger id="incentive-event" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {INCENTIVE_EVENTS.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {incentiveEventLabel(option)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="incentive-tier">Tier</Label>
                    <Select value={form.tier} onValueChange={(value) => setForm((state) => ({ ...state, tier: value }))}>
                        <SelectTrigger id="incentive-tier" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {tiers.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-1.5">
                    <Label htmlFor="incentive-amount">Amount (₹)</Label>
                    <Input
                        id="incentive-amount"
                        inputMode="decimal"
                        className="h-9 tabular-nums"
                        placeholder={form.paysNothing ? "Pays nothing" : "500.00"}
                        value={form.paysNothing ? "" : form.amount}
                        disabled={form.paysNothing}
                        onChange={(event) => setForm((state) => ({ ...state, amount: event.target.value }))}
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="incentive-from">Starts on</Label>
                    <Input
                        id="incentive-from"
                        type="date"
                        className="h-9"
                        value={form.effectiveFrom}
                        onChange={(event) => setForm((state) => ({ ...state, effectiveFrom: event.target.value }))}
                    />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 sm:col-span-2">
                    <Label htmlFor="incentive-pays-nothing" className="text-sm font-normal">
                        Pays nothing — switch this event off for the tier chosen
                    </Label>
                    <Switch
                        id="incentive-pays-nothing"
                        checked={form.paysNothing}
                        onCheckedChange={(checked) => setForm((state) => ({ ...state, paysNothing: checked }))}
                    />
                </div>

                <p className="text-xs text-muted-foreground sm:col-span-2">
                    Saving closes the current rate on the day before and starts this one. Incentives already earned keep the rate they were
                    earned at.
                </p>
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save rate"}
                </Button>
            </DialogFooter>
        </form>
    );
}
