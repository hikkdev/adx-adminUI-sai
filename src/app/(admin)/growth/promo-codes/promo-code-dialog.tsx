"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import {
    EMPTY_PROMO_FORM,
    PROMO_DISCOUNT_KINDS,
    draftProblems,
    promoCodesService,
    toForm,
    toInput,
    type PromoCode,
    type PromoDiscountKind,
    type PromoFormValues,
} from "@/services/promo-codes";

interface PromoCodeDialogProps {
    open: boolean;
    /** The code being edited, or null for a new one. */
    code: PromoCode | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

const KIND_LABEL: Record<PromoDiscountKind, string> = { PERCENT: "Percent off", FLAT: "Rupees off" };

/** PC-1: one dialog for a new code and for editing one — exactly what the backend takes. */
export function PromoCodeDialog({ open, code, onOpenChange, onSaved }: PromoCodeDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                {/* Mounted only while open, so the form is fresh each time. */}
                {open && <PromoForm code={code} onClose={() => onOpenChange(false)} onSaved={onSaved} />}
            </DialogContent>
        </Dialog>
    );
}

function PromoForm({ code, onClose, onSaved }: { code: PromoCode | null; onClose: () => void; onSaved: () => void }) {
    const [values, setValues] = React.useState<PromoFormValues>(() => (code ? toForm(code) : { ...EMPTY_PROMO_FORM }));
    const [touched, setTouched] = React.useState<Partial<Record<keyof PromoFormValues, boolean>>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const problems = draftProblems(values);
    const ready = Object.keys(problems).length === 0;
    const set = <K extends keyof PromoFormValues>(key: K, value: PromoFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
    const touch = (key: keyof PromoFormValues) => setTouched((t) => ({ ...t, [key]: true }));
    const errorOf = (key: keyof PromoFormValues) => (touched[key] ? problems[key] : undefined);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setTouched(Object.fromEntries(Object.keys(values).map((k) => [k, true])));
        if (!ready || busy) return;
        setBusy(true);
        setFormError(null);
        try {
            const input = toInput(values);
            const saved = code ? await promoCodesService.update(code.id, input) : await promoCodesService.create(input);
            toast.success(code ? `${saved.code} updated` : `${saved.code} made`, {
                description: saved.isActive ? "Advertisers can type it on Review & pay." : "Switch it on when it should work.",
            });
            onSaved();
        } catch (cause) {
            setFormError(cause instanceof ApiError ? cause.message : "The code did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{code ? `Edit ${code.code}` : "New promo code"}</DialogTitle>
                <DialogDescription>
                    A code takes its cut off media rent plus production fees, before GST. It counts as used only when the campaign is paid.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Code" error={errorOf("code")}>
                    <Input value={values.code} onChange={(e) => set("code", e.target.value)} onBlur={() => touch("code")} placeholder="FESTIVE20" className="font-mono uppercase" autoFocus />
                </Field>
                <Field label="Kind">
                    <Select value={values.kind} onValueChange={(v) => set("kind", v as PromoDiscountKind)}>
                        <SelectTrigger aria-label="Kind">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PROMO_DISCOUNT_KINDS.map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                    {KIND_LABEL[kind]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                {/* One line under each pair, never a hint under one cell (the form symmetry policy). */}
                <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">The code is upper-cased and de-spaced when saved.</p>
                <Field label={values.kind === "PERCENT" ? "Percent off" : "Rupees off"} error={errorOf("value")}>
                    <Input value={values.value} onChange={(e) => set("value", e.target.value)} onBlur={() => touch("value")} placeholder={values.kind === "PERCENT" ? "20" : "500"} inputMode="decimal" />
                </Field>
                <Field label="Cap (₹)" error={errorOf("maxDiscount")}>
                    <Input value={values.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} onBlur={() => touch("maxDiscount")} placeholder="5000" inputMode="decimal" />
                </Field>
                <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">The cap is the most it takes off. Empty is no cap.</p>
                <Field label="Minimum spend (₹)" error={errorOf("minSpend")} hint="Media plus production, before GST. Empty is none.">
                    <Input value={values.minSpend} onChange={(e) => set("minSpend", e.target.value)} onBlur={() => touch("minSpend")} placeholder="10000" inputMode="decimal" />
                </Field>
                <div />
                <Field label="Starts" error={errorOf("startsAt")} hint="Empty starts now.">
                    <Input type="datetime-local" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} onBlur={() => touch("startsAt")} />
                </Field>
                <Field label="Ends" error={errorOf("endsAt")} hint="Empty never ends.">
                    <Input type="datetime-local" value={values.endsAt} onChange={(e) => set("endsAt", e.target.value)} onBlur={() => touch("endsAt")} />
                </Field>
                <Field label="Total uses" error={errorOf("usageLimit")} hint="Paid campaigns, across everyone. Empty is unlimited.">
                    <Input value={values.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} onBlur={() => touch("usageLimit")} placeholder="100" inputMode="numeric" />
                </Field>
                <Field label="Uses per advertiser" error={errorOf("perAdvertiserLimit")} hint="Empty is unlimited.">
                    <Input value={values.perAdvertiserLimit} onChange={(e) => set("perAdvertiserLimit", e.target.value)} onBlur={() => touch("perAdvertiserLimit")} placeholder="1" inputMode="numeric" />
                </Field>
            </div>
            <Field label="Description" error={errorOf("description")} hint="For the desk; the advertiser never sees it.">
                <Textarea value={values.description} onChange={(e) => set("description", e.target.value)} onBlur={() => touch("description")} rows={2} placeholder="Festive launch — 20% off for the first hundred bookings" />
            </Field>
            <label className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">
                    <span className="block font-medium text-foreground">Active</span>
                    <span className="block text-xs text-muted-foreground">Off, and nobody can type it; a campaign already paid keeps its discount.</span>
                </span>
                <Switch checked={values.isActive} onCheckedChange={(v) => set("isActive", v)} aria-label="Active" />
            </label>

            {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : code ? "Save changes" : "Make the code"}
                </Button>
            </DialogFooter>
        </form>
    );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            {children}
            {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}
