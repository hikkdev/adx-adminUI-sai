import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatMoney } from "@/lib/format";

/**
 * Promo codes — PC-1 (DR 12, 25 Sep 2026), wired to the backend
 * `promo-codes` module under Growth.
 *
 * A code is a percent or a flat rupee amount off a booking's media rent
 * plus production fees (never off GST), capped by `maxDiscount`, gated by
 * a minimum spend, a validity window, a total usage limit and a
 * per-advertiser limit. The advertiser types it on Review & pay; it counts
 * as redeemed only when the campaign is paid. A code is never deleted —
 * it is switched off — so its redemptions keep their code.
 *
 * Money is a decimal STRING end to end; the form sends what was typed.
 */

export type PromoDiscountKind = "PERCENT" | "FLAT";
export const PROMO_DISCOUNT_KINDS: readonly PromoDiscountKind[] = ["PERCENT", "FLAT"];

export interface PromoCode {
    id: string;
    code: string;
    description: string | null;
    kind: PromoDiscountKind;
    /** Percent (0–100) for PERCENT, rupees for FLAT. */
    value: string;
    maxDiscount: string | null;
    minSpend: string | null;
    startsAt: string | null;
    endsAt: string | null;
    usageLimit: number | null;
    perAdvertiserLimit: number | null;
    isActive: boolean;
    /** Paid campaigns the code is on, not counting those since cancelled. */
    redemptions: number;
    createdAt: string;
    updatedAt: string;
}

export interface PromoRedemption {
    id: string;
    campaignId: string;
    advertiserId: string;
    amount: string;
    redeemedAt: string;
    releasedAt: string | null;
}

export interface PromoCodeDetail extends PromoCode {
    history: PromoRedemption[];
}

/** What `POST /promo-codes` and `PATCH /promo-codes/:id` take. */
export interface PromoCodeInput {
    code?: string;
    description?: string | null;
    kind?: PromoDiscountKind;
    value?: string;
    maxDiscount?: string | null;
    minSpend?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    usageLimit?: number | null;
    perAdvertiserLimit?: number | null;
    isActive?: boolean;
}

/** The dialog's fields, as typed. */
export interface PromoFormValues {
    code: string;
    description: string;
    kind: PromoDiscountKind;
    value: string;
    maxDiscount: string;
    minSpend: string;
    /** `datetime-local` values, or "". */
    startsAt: string;
    endsAt: string;
    usageLimit: string;
    perAdvertiserLimit: string;
    isActive: boolean;
}

export const EMPTY_PROMO_FORM: PromoFormValues = {
    code: "",
    description: "",
    kind: "PERCENT",
    value: "",
    maxDiscount: "",
    minSpend: "",
    startsAt: "",
    endsAt: "",
    usageLimit: "",
    perAdvertiserLimit: "",
    isActive: true,
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** The desk reads the API or says it cannot; a seeded code would be a discount nobody approved. */
export const promoCodesReadApi = (): boolean => isLive("growth");

const isMoney = (value: string): boolean => /^\d+(\.\d{1,2})?$/.test(value.trim());
const isWhole = (value: string, min: number): boolean => value.trim() === "" || (/^\d+$/.test(value.trim()) && Number(value) >= min);

/** What the dialog refuses before the API would. */
export function draftProblems(values: PromoFormValues): Partial<Record<keyof PromoFormValues, string>> {
    const problems: Partial<Record<keyof PromoFormValues, string>> = {};
    const code = values.code.trim();
    if (code.length < 2) problems.code = "At least two characters.";
    else if (code.length > 32) problems.code = "At most 32 characters.";
    else if (!/^[A-Za-z0-9 _-]+$/.test(code)) problems.code = "Letters, digits, dashes and underscores only.";
    if (!isMoney(values.value)) problems.value = values.kind === "PERCENT" ? "A percent, up to two decimals — 20 or 12.5." : "Rupees, up to two decimals — 500 or 500.00.";
    else if (values.kind === "PERCENT" && Number(values.value) > 100) problems.value = "A percent code cannot take more than 100% off.";
    else if (Number(values.value) <= 0) problems.value = "More than zero.";
    if (values.maxDiscount.trim() && !isMoney(values.maxDiscount)) problems.maxDiscount = "Rupees, up to two decimals — or leave it empty for no cap.";
    if (values.minSpend.trim() && !isMoney(values.minSpend)) problems.minSpend = "Rupees, up to two decimals — or leave it empty.";
    if (values.startsAt && Number.isNaN(Date.parse(values.startsAt))) problems.startsAt = "Not a date.";
    if (values.endsAt && Number.isNaN(Date.parse(values.endsAt))) problems.endsAt = "Not a date.";
    if (values.startsAt && values.endsAt && !problems.startsAt && !problems.endsAt && Date.parse(values.endsAt) < Date.parse(values.startsAt)) {
        problems.endsAt = "The code would end before it starts.";
    }
    if (!isWhole(values.usageLimit, 1)) problems.usageLimit = "A whole number, at least 1 — or empty for no limit.";
    if (!isWhole(values.perAdvertiserLimit, 1)) problems.perAdvertiserLimit = "A whole number, at least 1 — or empty for no limit.";
    if (values.description.trim().length > 200) problems.description = "At most 200 characters.";
    return problems;
}

const moneyOrNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());
const wholeOrNull = (value: string): number | null => (value.trim() === "" ? null : Number(value.trim()));
const dateOrNull = (value: string): string | null => (value ? new Date(value).toISOString() : null);

/** The form as the API takes it — every field, so a PATCH clears what was emptied. */
export function toInput(values: PromoFormValues): PromoCodeInput {
    return {
        code: values.code.trim(),
        description: values.description.trim() || null,
        kind: values.kind,
        value: values.value.trim(),
        maxDiscount: moneyOrNull(values.maxDiscount),
        minSpend: moneyOrNull(values.minSpend),
        startsAt: dateOrNull(values.startsAt),
        endsAt: dateOrNull(values.endsAt),
        usageLimit: wholeOrNull(values.usageLimit),
        perAdvertiserLimit: wholeOrNull(values.perAdvertiserLimit),
        isActive: values.isActive,
    };
}

/** An ISO instant → the `datetime-local` value the form edits, in the browser's zone. */
function toLocalInput(iso: string | null): string {
    if (!iso) return "";
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A stored code back into the form. */
export function toForm(code: PromoCode): PromoFormValues {
    return {
        code: code.code,
        description: code.description ?? "",
        kind: code.kind,
        value: code.value,
        maxDiscount: code.maxDiscount ?? "",
        minSpend: code.minSpend ?? "",
        startsAt: toLocalInput(code.startsAt),
        endsAt: toLocalInput(code.endsAt),
        usageLimit: code.usageLimit === null ? "" : String(code.usageLimit),
        perAdvertiserLimit: code.perAdvertiserLimit === null ? "" : String(code.perAdvertiserLimit),
        isActive: code.isActive,
    };
}

const trimPercent = (value: string): string => value.replace(/\.?0+$/, "");

/** "20% off, up to ₹5,000" · "₹500 off" */
export function discountLabel(code: Pick<PromoCode, "kind" | "value" | "maxDiscount">): string {
    if (code.kind === "PERCENT") {
        const base = `${trimPercent(code.value)}% off`;
        return code.maxDiscount ? `${base}, up to ${formatMoney(code.maxDiscount)}` : base;
    }
    return `${formatMoney(code.value)} off`;
}

const day = (iso: string): string => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** "12 Oct – 1 Nov 2026" · "Until 1 Nov 2026" · "From 12 Oct 2026" · "Always" */
export function windowLabel(code: Pick<PromoCode, "startsAt" | "endsAt">): string {
    if (code.startsAt && code.endsAt) return `${day(code.startsAt)} – ${day(code.endsAt)}`;
    if (code.endsAt) return `Until ${day(code.endsAt)}`;
    if (code.startsAt) return `From ${day(code.startsAt)}`;
    return "Always";
}

/** "3 of 100" · "3" — and the per-advertiser rule after it when there is one. */
export function usageLabel(code: Pick<PromoCode, "redemptions" | "usageLimit" | "perAdvertiserLimit">): string {
    const used = code.usageLimit === null ? String(code.redemptions) : `${code.redemptions} of ${code.usageLimit}`;
    return code.perAdvertiserLimit === null ? used : `${used} · ${code.perAdvertiserLimit} per advertiser`;
}

/** Live now: on, and inside its window. */
export function isLiveNow(code: Pick<PromoCode, "isActive" | "startsAt" | "endsAt">, now = new Date()): boolean {
    if (!code.isActive) return false;
    if (code.startsAt && new Date(code.startsAt) > now) return false;
    if (code.endsAt && new Date(code.endsAt) < now) return false;
    return true;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const promoCodesService = {
    list: () => http.get<PromoCode[]>("/promo-codes"),
    get: (id: string) => http.get<PromoCodeDetail>(`/promo-codes/${id}`),
    /** ADMIN + growth.edit. 409 when the code already exists. */
    create: (input: PromoCodeInput) => http.post<PromoCode>("/promo-codes", input),
    update: (id: string, input: PromoCodeInput) => http.patch<PromoCode>(`/promo-codes/${id}`, input),
};
