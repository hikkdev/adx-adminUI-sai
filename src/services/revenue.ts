import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";
import type {
    CommissionRate,
    CommissionRateInput,
    FeeSchedule,
    PublisherCommissionOverride,
    PublisherSubscription,
    Quote,
    SubscriptionSource,
    SubscriptionState,
    SubscriptionTierName,
    TaxSettings,
} from "@/types/revenue";

/**
 * Commission, fees and tax, wired to the backend `revenue` module.
 *
 * No fixture fallback, for the same reason the pricing engine has none: every
 * number here is what somebody is actually charged or paid, and a seeded take
 * rate on screen would be indistinguishable from the real one.
 */

const base = "/revenue";

/* ------------------------------------------------------------------ */
/* Publisher plans and subscriptions — Lot J (B1 / J-C)                */
/* ------------------------------------------------------------------ */

/*
 * The publisher side of the plan catalogue, built to the same shape as the
 * advertiser one in `packages.ts`: a catalogue ops reprice without a deploy,
 * an order that snapshots it, and a payment that turns the order into the
 * `PublisherSubscription` the commission ladder reads.
 *
 * Two facts the screens repeat out loud, because the module's invariants do:
 *
 * - AN EDIT PRICES THE NEXT PURCHASE ONLY. A subscription and an order keep
 *   their own copies of `ratePct` and `pricePerMonth`; `PATCH /plans/:tier`
 *   never re-rates anything already sold.
 *
 * - ENTITLEMENTS ARE COPY, WITH ONE EXCEPTION. The plan view says so itself
 *   (`enforced: false`, `enforcedKeys: ['liveChat']`): only `liveChat` is
 *   read by a rule — `false` keeps the tier's subscribers off live chat.
 *
 * A rate is a FRACTION on the wire ("0.1250" is 12.5%). The console prints
 * and edits it as a percentage and converts at the edge, here.
 */

export const SUBSCRIPTION_TIERS: readonly SubscriptionTierName[] = ["STANDARD", "PLUS", "PRO"];
export const isSubscriptionTier = (value: string | null | undefined): value is SubscriptionTierName =>
    SUBSCRIPTION_TIERS.includes(value as SubscriptionTierName);

export const SUBSCRIPTION_SOURCE_LABEL: Record<SubscriptionSource, string> = {
    ADMIN_GRANT: "Granted by ADX",
    SELF_SERVICE: "Bought in the app",
};
export const sourceLabel = (source: string): string =>
    SUBSCRIPTION_SOURCE_LABEL[source as SubscriptionSource] ?? source;

/** A promise on a plan card, as the API stores it: JSON, bounded by the editor to scalars. */
export type PlanEntitlementValue = string | number | boolean | null;
export type PlanEntitlements = Record<string, PlanEntitlementValue>;

/**
 * The keys the seed writes and the apps read. Everything else on a plan is
 * free-form copy. `liveChat` is the one a rule enforces.
 */
export const PLAN_ENTITLEMENT_FIELDS = [
    { key: "liveChat", label: "Live chat", kind: "boolean" },
    { key: "prioritySupport", label: "Priority support", kind: "boolean" },
    { key: "featuredListings", label: "Featured listings", kind: "number" },
    { key: "analytics", label: "Analytics", kind: "choice" },
    { key: "bookingReportPdf", label: "Booking report PDF", kind: "boolean" },
] as const;
export type PlanEntitlementField = (typeof PLAN_ENTITLEMENT_FIELDS)[number];
export const TYPED_ENTITLEMENT_KEYS: readonly string[] = PLAN_ENTITLEMENT_FIELDS.map((field) => field.key);
export const ANALYTICS_LEVELS = ["BASIC", "ADVANCED"] as const;
export type AnalyticsLevel = (typeof ANALYTICS_LEVELS)[number];

/** The free-form keys on a plan — every key the typed editor does not draw. */
export function freeFormEntitlements(entitlements: PlanEntitlements): PlanEntitlements {
    const rest: PlanEntitlements = {};
    for (const [key, value] of Object.entries(entitlements)) {
        if (!TYPED_ENTITLEMENT_KEYS.includes(key)) rest[key] = value;
    }
    return rest;
}

/** `campaignsPerMonth` → `Campaigns per month`; the key itself stays what the API keyed. */
export function entitlementLabel(key: string): string {
    const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** What a card shows for one value; `null` is "unlimited", the seed's own idiom. */
export function entitlementText(value: PlanEntitlementValue): string {
    if (value === null) return "Unlimited";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
}

/** Whether the tier's subscribers are on live chat: only an explicit `false` takes it away. */
export function planHasLiveChat(entitlements: PlanEntitlements): boolean {
    return entitlements.liveChat !== false;
}

/** A plan as `GET /revenue/plans` sends it. */
export interface WirePublisherPlan {
    id: string;
    tier: SubscriptionTierName | string;
    name: string;
    /** Decimal string. */
    pricePerMonth: string;
    /** A fraction — "0.1250". */
    ratePct: string;
    description: string | null;
    isPopular: boolean;
    entitlements: unknown;
    enforced?: boolean;
    enforcedKeys?: readonly string[];
    isActive: boolean;
    sortOrder: number;
}

/** A plan card. `ratePct` stays the wire's fraction; `commissionPct` is what the card prints. */
export interface PublisherPlan {
    id: string;
    tier: SubscriptionTierName;
    name: string;
    pricePerMonth: string;
    ratePct: string;
    /** The rate as a percentage string with up to two decimals — "12.5". */
    commissionPct: string;
    description: string | null;
    isPopular: boolean;
    entitlements: PlanEntitlements;
    /** The keys a rule reads; the rest is copy. Off the wire, so the editor never guesses. */
    enforcedKeys: readonly string[];
    active: boolean;
    sortOrder: number;
}

/** "0.1250" → "12.5"; "0.14" → "14". Rounded to two decimals of a percent, never the wire's fourth. */
export function fractionToPct(rate: string | null | undefined): string {
    if (rate === null || rate === undefined || rate === "") return "";
    const value = Number(rate);
    if (!Number.isFinite(value)) return "";
    return (Math.round(value * 10000) / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/** "12.5" → "0.1250": the fraction the API takes. Null when the input is not a percentage in bounds. */
export function pctToFraction(pct: string): string | null {
    const trimmed = pct.trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
    const value = Number(trimmed);
    if (value > 100) return null;
    return (value / 100).toFixed(4);
}

/** The rate a card prints: "12.5%"; a dash for nothing. */
export function formatRate(rate: string | null | undefined): string {
    const pct = fractionToPct(rate);
    return pct ? `${pct}%` : "—";
}

/** What the API accepts as an amount: rupees with at most two decimals. */
export const PLAN_MONEY = /^\d{1,12}(\.\d{1,2})?$/;
export const PLAN_SORT_ORDER_MAX = 1000;

function shapeEntitlements(value: unknown): PlanEntitlements {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: PlanEntitlements = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") out[key] = item;
        else out[key] = JSON.stringify(item);
    }
    return out;
}

export function shapePublisherPlan(wire: WirePublisherPlan): PublisherPlan {
    return {
        id: wire.id,
        tier: wire.tier as SubscriptionTierName,
        name: wire.name,
        pricePerMonth: wire.pricePerMonth,
        ratePct: wire.ratePct,
        commissionPct: fractionToPct(wire.ratePct),
        description: wire.description ?? null,
        isPopular: Boolean(wire.isPopular),
        entitlements: shapeEntitlements(wire.entitlements),
        enforcedKeys: wire.enforcedKeys ?? ["liveChat"],
        active: wire.isActive,
        sortOrder: wire.sortOrder,
    };
}

/** In the order the apps draw them; the API's order among equals. */
export function bySortOrder<T extends { sortOrder: number }>(rows: T[]): T[] {
    return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => a.row.sortOrder - b.row.sortOrder || a.index - b.index)
        .map((entry) => entry.row);
}

/** `PATCH /revenue/plans/:tier` — every field optional; the editor sends only what changed. */
export interface PublisherPlanPatch {
    name?: string;
    pricePerMonth?: string;
    /** A fraction. */
    ratePct?: string;
    description?: string | null;
    entitlements?: PlanEntitlements;
    isPopular?: boolean;
    isActive?: boolean;
    sortOrder?: number;
}

/* Orders */

export type SubscriptionOrderStatus = "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "EXPIRED";
export const SUBSCRIPTION_ORDER_STATUSES: readonly SubscriptionOrderStatus[] = ["PENDING_PAYMENT", "PAID", "CANCELLED", "EXPIRED"];
export const isSubscriptionOrderStatus = (value: string | null | undefined): value is SubscriptionOrderStatus =>
    SUBSCRIPTION_ORDER_STATUSES.includes(value as SubscriptionOrderStatus);

export const SUBSCRIPTION_ORDER_STATUS_META: Record<SubscriptionOrderStatus, StatusMeta> = {
    PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
    PAID: { label: "Paid", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "danger" },
    EXPIRED: { label: "Expired", tone: "neutral" },
};
export const subscriptionOrderStatusMeta = (status: string): StatusMeta =>
    SUBSCRIPTION_ORDER_STATUS_META[status as SubscriptionOrderStatus] ?? { label: status, tone: "neutral" };

export type SubscriptionCycle = "MONTHLY" | "ANNUAL";
export const cycleLabel = (cycle: string): string => (cycle === "ANNUAL" ? "Annual" : cycle === "MONTHLY" ? "Monthly" : cycle);

/** An order exactly as the API sends it (`orderView`). Money and rates are decimal strings. */
export interface WireSubscriptionOrder {
    id: string;
    reference: string;
    publisherId: string;
    publisherName: string;
    tier: SubscriptionTierName | string;
    planName: string;
    cycle: SubscriptionCycle | string;
    months: number;
    pricePerMonth: string;
    ratePct: string;
    subtotal: string;
    discountPct: string;
    discountAmount: string;
    gstPct: string;
    gstAmount: string;
    total: string;
    status: SubscriptionOrderStatus | string;
    startsAt: string | null;
    paidAt: string | null;
    paidMethod: string | null;
    paidReference: string | null;
    cancelledAt: string | null;
    subscriptionId: string | null;
    createdAt: string;
}

export interface SubscriptionOrder {
    id: string;
    reference: string;
    publisherId: string;
    publisherName: string;
    tier: string;
    planName: string;
    cycle: string;
    months: number;
    pricePerMonth: string;
    ratePct: string;
    subtotal: string;
    discountPct: string;
    discountAmount: string;
    gstPct: string;
    gstAmount: string;
    total: string;
    status: string;
    startsAt: string | null;
    paidAt: string | null;
    paidMethod: string | null;
    paidReference: string | null;
    cancelledAt: string | null;
    subscriptionId: string | null;
    createdAt: string;
}

export function shapeSubscriptionOrder(wire: WireSubscriptionOrder): SubscriptionOrder {
    return {
        id: wire.id,
        reference: wire.reference,
        publisherId: wire.publisherId,
        publisherName: wire.publisherName,
        tier: wire.tier,
        planName: wire.planName,
        cycle: wire.cycle,
        months: wire.months,
        pricePerMonth: wire.pricePerMonth,
        ratePct: wire.ratePct,
        subtotal: wire.subtotal,
        discountPct: wire.discountPct,
        discountAmount: wire.discountAmount,
        gstPct: wire.gstPct,
        gstAmount: wire.gstAmount,
        total: wire.total,
        status: wire.status,
        startsAt: wire.startsAt ?? null,
        paidAt: wire.paidAt ?? null,
        paidMethod: wire.paidMethod ?? null,
        paidReference: wire.paidReference ?? null,
        cancelledAt: wire.cancelledAt ?? null,
        subscriptionId: wire.subscriptionId ?? null,
        createdAt: wire.createdAt,
    };
}

/** Only an unpaid order can be cancelled or have a payment recorded against it. */
export const orderIsOpen = (order: Pick<SubscriptionOrder, "status">): boolean => order.status === "PENDING_PAYMENT";

/** Lot J2 (5): a trial is an order PAID at once for nothing — `paidMethod` is the word the server writes. */
export const TRIAL_PAID_METHOD = "TRIAL";
export const orderIsTrial = (order: Pick<SubscriptionOrder, "paidMethod">): boolean => order.paidMethod === TRIAL_PAID_METHOD;

export interface SubscriptionOrdersPage {
    items: SubscriptionOrder[];
    total: number;
    page: number;
    pageSize: number;
    /** How many orders carry each status, counted without the status facet in force. */
    counts: Record<SubscriptionOrderStatus, number>;
}

export interface SubscriptionOrdersQuery {
    q?: string;
    status?: SubscriptionOrderStatus[];
    publisherId?: string;
    page?: number;
    pageSize?: number;
}

/** The query string `GET /revenue/subscription-orders` takes, with nothing sent that was not asked for. */
export function subscriptionOrdersPath(query: SubscriptionOrdersQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.publisherId) params.set("publisherId", query.publisherId);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 25));
    return `${base}/subscription-orders?${params.toString()}`;
}

/* Subscriptions */

export type { SubscriptionState } from "@/types/revenue";
export const SUBSCRIPTION_STATES: readonly SubscriptionState[] = ["RUNNING", "UPCOMING", "ENDED"];
export const SUBSCRIPTION_STATE_META: Record<SubscriptionState, StatusMeta> = {
    RUNNING: { label: "Running", tone: "success" },
    UPCOMING: { label: "Upcoming", tone: "info" },
    ENDED: { label: "Ended", tone: "neutral" },
};
export const isSubscriptionState = (value: string | null | undefined): value is SubscriptionState =>
    SUBSCRIPTION_STATES.includes(value as SubscriptionState);

/**
 * Where a term stands at `now`: not yet started, in force, or over. The
 * list read has no facet of its own — it is the whole book — so the console
 * derives this from the dates it was sent, the same way the backend's
 * `runningAt` does.
 */
export function subscriptionState(row: Pick<PublisherSubscription, "startsAt" | "endsAt">, now = new Date()): SubscriptionState {
    if (new Date(row.startsAt).getTime() > now.getTime()) return "UPCOMING";
    if (row.endsAt !== null && new Date(row.endsAt).getTime() <= now.getTime()) return "ENDED";
    return "RUNNING";
}

/**
 * A row as the API sends it. The list (`GET /revenue/subscriptions`, Lot J2
 * (d)) carries `publisher: { id, name, displayId }`, `state` and `autoRenew`
 * beside the column set; the grant and the end answer the bare row with
 * `publisherId`. Either shapes to the same `PublisherSubscription`.
 */
export interface WirePublisherSubscription {
    id: string;
    publisherId?: string;
    publisher?: { id: string; name: string; displayId: string | null };
    tier: SubscriptionTierName | string;
    ratePct: string;
    pricePerMonth: string;
    startsAt: string;
    endsAt: string | null;
    source?: SubscriptionSource | string;
    planName?: string | null;
    createdAt?: string | null;
    autoRenew?: boolean;
    state?: SubscriptionState | string;
}

export function shapeSubscription(wire: WirePublisherSubscription): PublisherSubscription {
    return {
        id: wire.id,
        publisherId: wire.publisherId ?? wire.publisher?.id ?? "",
        tier: wire.tier as SubscriptionTierName,
        ratePct: wire.ratePct,
        pricePerMonth: wire.pricePerMonth,
        startsAt: wire.startsAt,
        endsAt: wire.endsAt ?? null,
        // A row from before the column was the console's own grant.
        source: wire.source === "SELF_SERVICE" ? "SELF_SERVICE" : "ADMIN_GRANT",
        planName: wire.planName ?? null,
        createdAt: wire.createdAt ?? null,
        publisherName: wire.publisher?.name ?? null,
        publisherDisplayId: wire.publisher?.displayId ?? null,
        autoRenew: wire.autoRenew === true,
        state: isSubscriptionState(wire.state) ? wire.state : subscriptionState(wire),
    };
}

/** What to call the publisher on a row: their name and PUB- id when the read named them, else the id the row carries. */
export function subscriptionPublisherLabel(row: Pick<PublisherSubscription, "publisherId" | "publisherName" | "publisherDisplayId">): string {
    if (!row.publisherName) return row.publisherId;
    return row.publisherDisplayId ? `${row.publisherName} · ${row.publisherDisplayId}` : row.publisherName;
}

/**
 * Lot J2: an ended term whose entitlements still answer. The list row does
 * not carry the grace, so the console derives it the way the backend's
 * entitled read does: ended, and `endsAt` + the audience policy's
 * `graceDays` still ahead of now. Null when not in grace or when there is
 * no grace at all.
 */
export function graceUntil(row: Pick<PublisherSubscription, "startsAt" | "endsAt">, graceDays: number, now = new Date()): Date | null {
    if (graceDays <= 0 || !row.endsAt || subscriptionState(row, now) !== "ENDED") return null;
    const until = new Date(new Date(row.endsAt).getTime() + graceDays * 24 * 60 * 60 * 1000);
    return until.getTime() > now.getTime() ? until : null;
}

/** The subscriptions book on the list contract (Lot J2, d): a page, its total and a count per state with the state facet removed. */
export interface SubscriptionsPage {
    items: PublisherSubscription[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<SubscriptionState, number>;
}

export interface SubscriptionsQuery {
    state?: SubscriptionState;
    q?: string;
    publisherId?: string;
    page?: number;
    pageSize?: number;
}

/** The query string `GET /revenue/subscriptions` takes, with nothing sent that was not asked for. */
export function subscriptionsPath(query: SubscriptionsQuery = {}): string {
    const params = new URLSearchParams();
    if (query.state) params.set("state", query.state);
    if (query.q) params.set("q", query.q);
    if (query.publisherId) params.set("publisherId", query.publisherId);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 25));
    return `${base}/subscriptions?${params.toString()}`;
}

/** The server's cap on a page — what one publisher's whole set is read with. */
const SUBSCRIPTIONS_PAGE_MAX = 100;

async function readSubscriptionsPage(query: SubscriptionsQuery = {}): Promise<SubscriptionsPage> {
    const page = await http.get<{
        items: WirePublisherSubscription[];
        total: number;
        page: number;
        pageSize: number;
        counts: Partial<Record<SubscriptionState, number>>;
    }>(subscriptionsPath(query));
    const counts = {} as Record<SubscriptionState, number>;
    for (const state of SUBSCRIPTION_STATES) counts[state] = page.counts?.[state] ?? 0;
    return { ...page, items: (page.items ?? []).map(shapeSubscription), counts };
}

/** `POST /revenue/subscriptions` — the grant. Rate and price prefilled from the plan on screen; explicit values win. */
export interface SubscriptionGrant {
    publisherId: string;
    tier: SubscriptionTierName;
    /** A calendar date or an ISO instant; the API parses it. */
    startsAt: string;
    endsAt?: string | null;
    /** A fraction. */
    ratePct?: string;
    pricePerMonth?: string;
}

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to; throwing before a request goes out keeps the desk honest.
 * The publisher plans sit with the finance screens, which gate on `finance`.
 */
function live() {
    if (!isLive("finance")) throw new Error("Publisher plans read the API; connect the console to the ADX backend first.");
    return http;
}

export const revenueService = {
    commissionRates: () => http.get<CommissionRate[]>(`${base}/commission`),

    /**
     * Writes a new rate and retires the one with the same key — the same
     * category, or the same media type with the same floor and ceiling — so
     * writing a second band leaves the first and the unbanded row alone.
     *
     * Not an edit: the old rate is what past bookings were priced under, and
     * overwriting it would erase what ADX charged last quarter.
     */
    setCommissionRate: (body: CommissionRateInput) => http.post<CommissionRate>(`${base}/commission`, body),

    /** The book on the list contract (ADMIN), newest start first, with the counts by state. */
    subscriptionsPage: readSubscriptionsPage,

    /** One publisher's whole set — the same read, the server's largest page. A publisher with more rows than that has a history, not a subscription. */
    subscriptions: async (publisherId: string): Promise<PublisherSubscription[]> =>
        (await readSubscriptionsPage({ publisherId, pageSize: SUBSCRIPTIONS_PAGE_MAX })).items,

    grantSubscription: async (body: SubscriptionGrant): Promise<PublisherSubscription> =>
        shapeSubscription(await live().post<WirePublisherSubscription>(`${base}/subscriptions`, body)),

    endSubscription: async (id: string): Promise<PublisherSubscription> =>
        shapeSubscription(await live().post<WirePublisherSubscription>(`${base}/subscriptions/${id}/end`, {})),

    /* Lot J (B1 / J-C): the publisher plan catalogue and the order book. */

    /** The three plans, retired rows included (`includeInactive` is honoured for ADMIN only), in draw order. */
    plans: async (): Promise<PublisherPlan[]> =>
        bySortOrder((await live().get<WirePublisherPlan[]>(`${base}/plans?includeInactive=true`)).map(shapePublisherPlan)),

    /** The editor; audited `PUBLISHER_PLAN_UPDATED` with the diff. Never re-rates a subscription already sold. */
    updatePlan: async (tier: SubscriptionTierName, patch: PublisherPlanPatch): Promise<PublisherPlan> =>
        shapePublisherPlan(await live().patch<WirePublisherPlan>(`${base}/plans/${tier}`, patch)),

    /** The order book (ADMIN) on the list contract, newest first, with the counts by status. */
    subscriptionOrders: async (query: SubscriptionOrdersQuery = {}): Promise<SubscriptionOrdersPage> => {
        const page = await live().get<{
            items: WireSubscriptionOrder[];
            total: number;
            page: number;
            pageSize: number;
            counts: Partial<Record<SubscriptionOrderStatus, number>>;
        }>(subscriptionOrdersPath(query));
        const counts = {} as Record<SubscriptionOrderStatus, number>;
        for (const status of SUBSCRIPTION_ORDER_STATUSES) counts[status] = page.counts?.[status] ?? 0;
        return { ...page, items: (page.items ?? []).map(shapeSubscriptionOrder), counts };
    },

    /** Money that arrived outside ADX: activates the order the way a wallet payment would. Audited. */
    recordOrderPayment: async (id: string, body: { reference: string; method: string }): Promise<SubscriptionOrder> =>
        shapeSubscriptionOrder(await live().post<WireSubscriptionOrder>(`${base}/subscription-orders/${id}/record-payment`, body)),

    /** PENDING_PAYMENT only; an admin's cancel is audited. */
    cancelOrder: async (id: string): Promise<SubscriptionOrder> =>
        shapeSubscriptionOrder(await live().post<WireSubscriptionOrder>(`${base}/subscription-orders/${id}/cancel`, {})),

    overrides: (publisherId?: string) =>
        http.get<PublisherCommissionOverride[]>(
            publisherId ? `${base}/overrides?publisherId=${publisherId}` : `${base}/overrides`
        ),

    /** ADX giving up its own revenue. The approver is recorded server-side. */
    grantOverride: (body: Record<string, unknown>) =>
        http.post<PublisherCommissionOverride>(`${base}/overrides`, body),

    fees: (includeInactive = false) =>
        http.get<FeeSchedule[]>(`${base}/fees?includeInactive=${includeInactive}`),

    createFee: (body: Record<string, unknown>) => http.post<FeeSchedule>(`${base}/fees`, body),

    updateFee: (id: string, body: Record<string, unknown>) =>
        http.patch<FeeSchedule>(`${base}/fees/${id}`, body),

    tax: () => http.get<TaxSettings | null>(`${base}/tax`),

    updateTax: (mediaGstPct: string) =>
        http.patch<TaxSettings>(`${base}/tax`, { mediaGstPct }),

    /** ADMIN only — the response names ADX's take rate and where it came from. */
    quote: (body: {
        listingId: string;
        days: number;
        spots?: number;
        rateDiscount?: string;
        goodwill?: string;
    }) => http.post<Quote>(`${base}/quote`, body),
};
