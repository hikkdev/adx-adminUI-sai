import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";
import type { LayoutSurface } from "./layouts";

/**
 * LM-1 (27 Sep 2026): the paid placements ADX sells, on the Growth desk.
 *
 * - Display ads: a buyer books an ad slot for dates, uploads artwork, pays;
 *   the desk reviews the artwork here (Approve, or Reject with a reason —
 *   a rejection refunds in full); it runs rotating with the slot's others.
 * - Sponsored listings ("boosts"): a publisher pays to have their own
 *   listing shown first in search (SEARCH_TOP) or in the "Similar" row
 *   (SIMILAR_TOP). No review — the listing is already approved.
 *
 * Prices are a flat rate per day set here per slot and per placement, plus
 * 18% GST; capacity is `maxConcurrent` per day. Money is a decimal STRING
 * end to end.
 */

export const PROMOTION_STATUSES = ["DRAFT", "PENDING_PAYMENT", "PENDING_REVIEW", "SCHEDULED", "LIVE", "ENDED", "REJECTED", "CANCELLED"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const PROMOTION_STATUS_META: Record<PromotionStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    PENDING_PAYMENT: { label: "Awaiting payment", tone: "neutral" },
    PENDING_REVIEW: { label: "In review", tone: "warning" },
    SCHEDULED: { label: "Scheduled", tone: "info" },
    LIVE: { label: "Live", tone: "success" },
    ENDED: { label: "Ended", tone: "neutral" },
    REJECTED: { label: "Rejected", tone: "danger" },
    CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const BOOST_PLACEMENTS = ["SEARCH_TOP", "SIMILAR_TOP"] as const;
export type BoostPlacement = (typeof BOOST_PLACEMENTS)[number];

export const BOOST_PLACEMENT_LABEL: Record<BoostPlacement, string> = {
    SEARCH_TOP: "Top of search",
    SIMILAR_TOP: "Top of “Similar”",
};

export const BOOST_PLACEMENT_MEANING: Record<BoostPlacement, string> = {
    SEARCH_TOP: "First in the search results the listing matches — its category, its city.",
    SIMILAR_TOP: "First in the “Similar listing” row on the listings it is similar to.",
};

export const GST_RATE = 0.18;

export interface AdSlot {
    id: string;
    key: string;
    label: string;
    description: string | null;
    surfaces: LayoutSurface[];
    spec: string;
    maxConcurrent: number;
    ratePerDay: string;
    minDays: number;
    isActive: boolean;
    /** The artwork size the spec names. */
    specDetail?: { key: string; label: string; width: number; height: number } | null;
}

export interface AdSlotInput {
    key?: string;
    label?: string;
    description?: string | null;
    surfaces?: LayoutSurface[];
    spec?: string;
    maxConcurrent?: number;
    ratePerDay?: string;
    minDays?: number;
    isActive?: boolean;
}

export interface PlacementConfig {
    placement: BoostPlacement;
    label: string;
    ratePerDay: string;
    maxConcurrent: number;
    minDays: number;
    isActive: boolean;
}

export type PlacementPatch = Partial<Pick<PlacementConfig, "label" | "ratePerDay" | "maxConcurrent" | "minDays" | "isActive">>;

export interface PromotionMedia {
    id?: string;
    url: string;
    width: number | null;
    height: number | null;
    altText: string | null;
}

export interface PromotionStats {
    impressions: number;
    clicks: number;
    /** A percent with two decimals. */
    ctr: number;
    byDay: { date: string; impressions: number; clicks: number }[];
}

/** A price as the server quoted it. */
export interface PromotionQuote {
    days: number;
    ratePerDay: string;
    subtotal: string;
    gstPct: string;
    gstAmount: string;
    total: string;
}

export interface AdBookingRow {
    id: string;
    /** ADB-DDMM-YYNN */
    displayId: string | null;
    status: PromotionStatus;
    advertiserId: string;
    title: string;
    headline: string | null;
    ctaLabel: string | null;
    targetUrl: string | null;
    /** Catalogue city ids; empty is everywhere. */
    cityIds: string[];
    /** Whole days, `YYYY-MM-DD`, first and last. */
    startDate: string;
    endDate: string;
    days: number;
    ratePerDay: string;
    subtotal: string;
    gstAmount: string;
    total: string;
    quote?: PromotionQuote;
    /** Past it, an unpaid booking is cancelled and its capacity freed. */
    payBy?: string | null;
    reviewNote: string | null;
    reviewedAt: string | null;
    paidAt: string | null;
    paymentId?: string | null;
    refundedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    createdAt: string;
    updatedAt?: string;
    slot?: { key: string; label: string; spec: string; surfaces?: string[] } | null;
    media?: PromotionMedia | null;
    advertiser?: { id: string; name?: string | null; displayId?: string | null } | null;
    cities?: { id: string; name: string }[];
    /** On the one-ad read. */
    stats?: PromotionStats;
}

export interface BoostRow {
    id: string;
    /** BST-DDMM-YYNN */
    displayId: string | null;
    status: PromotionStatus;
    listingId: string;
    publisherId: string;
    placements: BoostPlacement[];
    cityId: string | null;
    city: string | null;
    category: string;
    startDate: string;
    endDate: string;
    days: number;
    subtotal: string;
    gstAmount: string;
    total: string;
    payBy?: string | null;
    reviewNote?: string | null;
    paidAt: string | null;
    paymentId?: string | null;
    refundedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    createdAt: string;
    updatedAt?: string;
    listing?: { id: string; displayId?: string | null; title?: string | null; city?: string | null; category?: string | null } | null;
    publisher?: { id: string; name?: string | null; displayId?: string | null } | null;
    stats?: PromotionStats;
}

export interface PromotionPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed. */
    counts: Record<string, number>;
}

export interface PromotionsStats {
    window: { from: string; to: string };
    /** `ctr` is a percent with two decimals, as every `ctr` here. */
    totals: { impressions: number; clicks: number; ctr: number; adsRunning: number; boostsRunning: number };
    /** Placements paid for inside the window, less what was refunded. */
    revenue: { bookings: number; subtotal: string; gstAmount: string; total: string; refunded: string; net: string };
    bySlot: { slotKey: string; label: string; bookings: number; revenue: string; impressions: number; clicks: number; ctr: number }[];
    byPlacement: { placement: string; bookings: number; revenue: string; impressions: number; clicks: number; ctr: number }[];
    topAds: { adBookingId: string; displayId: string | null; title: string; slotKey: string; status: string; impressions: number; clicks: number; ctr: number }[];
}

/** `GET /promotions/slots/:key/availability` — each day of the window, booked and left of the slot's `maxConcurrent`. */
export interface SlotAvailability {
    slotKey: string;
    maxConcurrent: number;
    days: { date: string; booked: number; left: number }[];
    /** The first day with room, inside the window or after it; null when none within 186 days. */
    nextFreeDate: string | null;
}

export interface AdsQuery {
    status?: PromotionStatus;
    slotKey?: string;
    q?: string;
    page?: number;
    pageSize?: number;
}

export interface BoostsQuery {
    status?: PromotionStatus;
    placement?: BoostPlacement;
    q?: string;
    page?: number;
    pageSize?: number;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** The desk reads the API or says it cannot. */
export const promotionsReadApi = (): boolean => isLive("growth");

/** "12 Oct – 18 Oct 2026 · 7 days". Dates are whole UTC days, first and last. */
export function runLabel(row: { startDate: string; endDate: string; days?: number }): string {
    const fmt = (iso: string, year: boolean) =>
        new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
    const days = row.days ?? Math.round((Date.parse(row.endDate) - Date.parse(row.startDate)) / 86_400_000) + 1;
    return `${fmt(row.startDate, false)} – ${fmt(row.endDate, true)} · ${days} ${days === 1 ? "day" : "days"}`;
}

/** A server `ctr` (already a percent) as the desk prints it. */
export const pctLabel = (ctr: number | null | undefined, impressions: number): string => (!impressions || ctr === null || ctr === undefined ? "—" : `${ctr.toFixed(2)}%`);

/** Click-through as a percent with one decimal, or "—" when nothing was seen. */
export function ctrLabel(impressions: number, clicks: number): string {
    if (!impressions) return "—";
    return `${((clicks / impressions) * 100).toFixed(1)}%`;
}

/** Who bought an ad, in one line. */
export function buyerLabel(row: Pick<AdBookingRow, "advertiser" | "advertiserId">): string {
    const a = row.advertiser;
    if (a?.name) return a.displayId ? `${a.name} · ${a.displayId}` : a.name;
    return a?.displayId ?? row.advertiserId;
}

/** Which listing a boost promotes, in one line. */
export function boostListingLabel(row: Pick<BoostRow, "listing" | "listingId">): string {
    const l = row.listing;
    if (l?.title) return l.displayId ? `${l.title} · ${l.displayId}` : l.title;
    return l?.displayId ?? row.listingId;
}

/** Whether cancelling now would still refund — before the first day, in full. */
export function beforeStart(row: { startDate: string }, now = new Date()): boolean {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Date.parse(row.startDate) > today;
}

/** What the slot and placement editors refuse before the server does. */
export function pricingProblems(values: { ratePerDay: string; maxConcurrent: string; minDays: string }): Partial<Record<"ratePerDay" | "maxConcurrent" | "minDays", string>> {
    const problems: Partial<Record<"ratePerDay" | "maxConcurrent" | "minDays", string>> = {};
    if (!/^\d+(\.\d{1,2})?$/.test(values.ratePerDay.trim())) problems.ratePerDay = "Rupees, up to two decimals — 1500 or 1500.00.";
    else if (Number(values.ratePerDay) <= 0) problems.ratePerDay = "More than zero.";
    if (!/^\d+$/.test(values.maxConcurrent.trim()) || Number(values.maxConcurrent) < 1) problems.maxConcurrent = "A whole number, at least 1.";
    if (!/^\d+$/.test(values.minDays.trim()) || Number(values.minDays) < 1) problems.minDays = "A whole number, at least 1.";
    return problems;
}

/** A slot key as the layouts name it: upper snake. */
export const SLOT_KEY_PATTERN = /^[A-Z][A-Z0-9_]{2,59}$/;

/** "₹1,500.00 + GST = ₹1,770.00 a day" — the arithmetic, for the editor's hint. */
export function withGst(rate: string): string | null {
    if (!/^\d+(\.\d{1,2})?$/.test(rate.trim())) return null;
    const paise = Math.round(Number(rate) * 100);
    return (Math.round(paise * (1 + GST_RATE)) / 100).toFixed(2);
}

function listQuery(query: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const promotionsService = {
    /* Slots and placements — `growth.edit` to write. */
    slots: () => http.get<AdSlot[]>("/promotions/admin/slots"),
    createSlot: (input: AdSlotInput) => http.post<AdSlot>("/promotions/admin/slots", input),
    updateSlot: (id: string, input: AdSlotInput) => http.patch<AdSlot>(`/promotions/admin/slots/${encodeURIComponent(id)}`, input),
    placements: () => http.get<PlacementConfig[]>("/promotions/admin/placements"),
    /** The buyer's availability read — an on-sale slot only (an off-sale one is a 404). */
    slotAvailability: (key: string, from: string, to: string) => http.get<SlotAvailability>(`/promotions/slots/${encodeURIComponent(key)}/availability${listQuery({ from, to })}`),
    updatePlacement: (placement: BoostPlacement, patch: PlacementPatch) => http.patch<PlacementConfig>(`/promotions/admin/placements/${placement}`, patch),

    /* Display ads. Approve and reject need `content.approve`; a rejection refunds in full. */
    ads: (query: AdsQuery = {}) => http.get<PromotionPage<AdBookingRow>>(`/promotions/admin/ads${listQuery({ ...query })}`),
    ad: (id: string) => http.get<AdBookingRow>(`/promotions/ads/${encodeURIComponent(id)}`),
    approveAd: (id: string, note?: string) => http.post<AdBookingRow>(`/promotions/admin/ads/${encodeURIComponent(id)}/approve`, note ? { note } : {}),
    rejectAd: (id: string, reason: string) => http.post<AdBookingRow>(`/promotions/admin/ads/${encodeURIComponent(id)}/reject`, { reason }),

    /* Sponsored listings. */
    boosts: (query: BoostsQuery = {}) => http.get<PromotionPage<BoostRow>>(`/promotions/admin/boosts${listQuery({ ...query })}`),
    cancelBoost: (id: string, reason: string, refund: boolean) => http.post<BoostRow>(`/promotions/admin/boosts/${encodeURIComponent(id)}/cancel`, { reason, refund }),

    /* Performance. */
    stats: (from: string, to: string) => http.get<PromotionsStats>(`/promotions/admin/stats${listQuery({ from, to })}`),
};
