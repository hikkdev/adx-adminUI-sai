import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { failureMessage, type BulkOutcome } from "@/lib/bulk";
import { sumMoney } from "@/lib/format";
import { signalLabel } from "@/services/fraud";
import { shapeOrder } from "@/services/orders";
import type { Order, OrderRiskSignal, OrderScreening, StatusMeta } from "@/types";

/**
 * Order screening — the owner, 2 Oct 2026: "We can automate the fraud
 * review part and then add a manual way to review the flagged orders?" →
 * "Watch mode, no automatic holds … I agree on both."
 *
 * Every order is scored by the backend (`fraud` module) and a score past
 * the review line flags it. Watch mode first: the automatic hold exists
 * and ships off, so a flag only asks a person to look. What a person may
 * do from the console — hold, release, clear, cancel as fraud, open a
 * case — is all here, against the routes of the contract:
 *
 *   GET  /orders/fraud-review?status=&q=&page=&pageSize=&sort=
 *   POST /orders/:id/hold · release · clear · confirm-fraud · fraud-case · rescore
 *   GET  /orders/:id/cancel-impact
 *   POST /orders/fraud-review/bulk { action, orderIds, reason? }
 *
 * The console is staff-only, so it may say "fraud". Nothing here is ever
 * shown to a party: the advertiser on a held order reads the backend's own
 * neutral line ("Your order is being reviewed — we'll update you shortly").
 */

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

/**
 * What the routes ask, as the fraud desk's routes do: reading behind
 * `kyc.view`, acting behind `kyc.edit`, and cancelling as fraud also needs
 * the orders' own cancel permission (`marketplace.edit`, the cancel
 * route's). The console disables what the viewer may not do, and says why.
 */
export const ORDER_SCREENING_PERMISSION = {
    view: "kyc.view",
    act: "kyc.edit",
    cancel: "marketplace.edit",
} as const;

/** Why an action is off for this viewer — the title on a disabled control. */
export const NO_ACT_PERMISSION = "Needs the fraud desk's edit permission (kyc.edit).";
export const NO_CANCEL_PERMISSION = "Also needs the permission to cancel orders (marketplace.edit).";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** The review queue's status filter — the wire's words. */
export const REVIEW_FILTERS = ["FLAGGED", "HELD", "CLEARED", "CONFIRMED", "ALL"] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

/** The Status select's options: the word, and one line on what it means. */
export const REVIEW_FILTER_OPTIONS: readonly { value: ReviewFilter; label: string; description: string }[] = [
    { value: "FLAGGED", label: "Flagged", description: "Scored past the review line, waiting for a person" },
    { value: "HELD", label: "Held", description: "Paused: no dispatch, earnings or sign-off until released" },
    { value: "CLEARED", label: "Cleared", description: "Looked at and found fine" },
    { value: "CONFIRMED", label: "Confirmed fraud", description: "Cancelled as fraud through the normal cancel path" },
    { value: "ALL", label: "Everyone", description: "Every scored order" },
];

export const REVIEW_SORTS = ["score", "newest"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
export const REVIEW_SORT_LABEL: Record<ReviewSort, string> = {
    score: "Highest risk first",
    newest: "Newest first",
};

/** Where a row stands in the review — the row's Status pill. Held speaks over Flagged; a confirmed order over both. */
export type ReviewState = "FLAGGED" | "HELD" | "CLEARED" | "CONFIRMED_FRAUD" | "NONE";

export const REVIEW_STATE_META: Record<ReviewState, StatusMeta> = {
    FLAGGED: { label: "Flagged", tone: "warning" },
    HELD: { label: "Held", tone: "danger" },
    CLEARED: { label: "Cleared", tone: "success" },
    CONFIRMED_FRAUD: { label: "Confirmed fraud", tone: "danger" },
    NONE: { label: "Not flagged", tone: "neutral" },
};

export function reviewStateOf(screening: OrderScreening | null | undefined): ReviewState {
    if (!screening) return "NONE";
    if (screening.reviewStatus === "CONFIRMED_FRAUD") return "CONFIRMED_FRAUD";
    if (screening.heldAt) return "HELD";
    if (screening.reviewStatus === "FLAGGED") return "FLAGGED";
    if (screening.reviewStatus === "CLEARED") return "CLEARED";
    return "NONE";
}

/** Whether the order is paused for review right now. */
export const isHeld = (order: Pick<Order, "screening">): boolean => Boolean(order.screening?.heldAt);

/** What the score says — the backend's `OrderRiskBand`. */
export type RiskBand = NonNullable<OrderScreening["band"]>;

/** What the score says, as a pill beside the number. */
export const RISK_BAND_META: Record<RiskBand, StatusMeta> = {
    LOW: { label: "Low", tone: "success" },
    REVIEW: { label: "Review", tone: "warning" },
    HOLD: { label: "High", tone: "danger" },
};

/** The score as the console prints it: 0–100, whole. Null until scored. */
export function riskPercent(score: number | null | undefined): number | null {
    if (score === null || score === undefined || !Number.isFinite(score)) return null;
    return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

/* ------------------------------------------------------------------ */
/* Signals in plain words                                              */
/* ------------------------------------------------------------------ */

/**
 * Every signal in plain words — the six the order adds, and the party
 * signals the fraud desk scores (the order borrows them for both sides).
 * The desk's own labels (`SIGNAL_LABEL`) name the attribute ("PAN
 * number"); these say what was seen.
 */
export const ORDER_SIGNAL_WORDS: Record<string, string> = {
    NEW_ACCOUNT_BIG_ORDER: "New account, large order",
    ORDER_VELOCITY: "Many orders in a short time",
    DUPLICATE_ORDER: "Same spot and dates ordered twice",
    PAYMENT_TROUBLE: "Payment trouble",
    LINKED_PARTIES: "Advertiser and publisher look linked",
    PRIOR_CONFIRMED_FRAUD: "Previously confirmed fraud",
    SHARED_PAN: "Shares a PAN with another account",
    SHARED_BANK: "Shares a payout account with another account",
    SHARED_IP_SUBNET: "Signs in from the same network as another account",
    SHARED_PHONE_ACROSS_ROLES: "Same mobile used in another role",
    SHARED_DEVICE: "Same phone as another account",
    BANK_NAME_MISMATCH: "Payout account in someone else's name",
    DUPLICATE_LISTING_PHOTOS: "Listing photos copied from another spot",
    PROOF_FAR_FROM_SITE: "Installation photos taken far from the site",
    SELF_DEALING: "Booking their own spots",
    COMMISSION_FARMING: "Sign-ups that look like commission farming",
    REFUND_DISPUTE_RATE: "Many refunds or disputes",
    WITHDRAW_AFTER_CREDIT: "Withdraws as soon as money lands",
    LISTING_VELOCITY: "Many listings in a short time",
};

/** A signal's plain words; a key added since falls back to the desk's label, then to the key made readable. */
export function signalWords(key: string): string {
    const words = ORDER_SIGNAL_WORDS[key];
    if (words) return words;
    const label = signalLabel(key);
    if (label !== key) return label;
    const readable = key.toLowerCase().replace(/_/g, " ").trim();
    return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : key;
}

export type SignalSide = "advertiser" | "publisher" | "order";
export const SIGNAL_SIDE_LABEL: Record<SignalSide, string> = {
    advertiser: "Advertiser",
    publisher: "Publisher",
    order: "Order",
};

/** Whose side a signal is on — the wire's word in any case; anything else is the order's own. */
export function sideOf(signal: Pick<OrderRiskSignal, "side">): SignalSide {
    const side = signal.side?.trim().toLowerCase();
    return side === "advertiser" || side === "publisher" ? side : "order";
}

/** How a Clear remembers a signal: its side, upper case as the wire says it, and its key — `PUBLISHER:SHARED_BANK`. */
export const clearedKey = (signal: Pick<OrderRiskSignal, "key" | "side">): string => `${sideOf(signal).toUpperCase()}:${signal.key}`;

export interface ScreeningSignalRow {
    key: string;
    words: string;
    side: SignalSide;
    weight: number;
    value: number | null;
    /** `weight × value` — what it put on the score; 0 while the value is null. */
    contribution: number;
    detail: string;
    /** A Clear dismissed this one: it no longer flags the order on its own. */
    cleared: boolean;
}

/**
 * The signals that were found — a value above zero, or null (could not be
 * computed, said so) — strongest first. A signal that read 0 was looked for
 * and not seen, and is not listed.
 */
export function screeningSignals(screening: Pick<OrderScreening, "signals" | "clearedSignalKeys"> | null | undefined): ScreeningSignalRow[] {
    if (!screening) return [];
    /* Both parties run the same signals, so a Clear remembers each as `SIDE:KEY` (ADVERTISER:SHARED_PAN). */
    const cleared = new Set(screening.clearedSignalKeys);
    return screening.signals
        .filter((signal) => signal.value === null || signal.value > 0)
        .map((signal) => ({
            key: signal.key,
            words: signalWords(signal.key),
            side: sideOf(signal),
            weight: signal.weight,
            value: signal.value,
            contribution: signal.value === null ? 0 : Math.round(signal.weight * signal.value * 1000) / 1000,
            detail: signal.detail,
            cleared: cleared.has(clearedKey(signal)),
        }))
        .sort((a, b) => b.contribution - a.contribution || (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0));
}

/** The "Why" cell: the two strongest signals in plain words, and how many more there are. */
export function whyLine(screening: Pick<OrderScreening, "signals" | "clearedSignalKeys"> | null | undefined, top = 2): { words: string[]; more: number } {
    const rows = screeningSignals(screening);
    return { words: rows.slice(0, top).map((row) => row.words), more: Math.max(0, rows.length - top) };
}

/* ------------------------------------------------------------------ */
/* What a person may do to a row                                       */
/* ------------------------------------------------------------------ */

export type ReviewAction = "HOLD" | "RELEASE" | "CLEAR" | "CONFIRM_FRAUD";

/**
 * Why an action is left alone on this order, or null when it applies —
 * the bulk plan's skip rule and the row menu's disabled state, one rule.
 * The server is the judge; this only keeps a button that would 409 off.
 */
export function reviewSkip(action: ReviewAction, order: Pick<Order, "status" | "screening">): string | null {
    const state = reviewStateOf(order.screening);
    switch (action) {
        case "HOLD":
            if (state === "CONFIRMED_FRAUD") return "confirmed fraud";
            if (state === "HELD") return "already held";
            if (order.status === "COMPLETED") return "completed";
            if (order.status === "CANCELLED") return "cancelled";
            return null;
        case "RELEASE":
            return state === "HELD" ? null : "not held";
        case "CLEAR":
            if (state === "CONFIRMED_FRAUD") return "confirmed fraud";
            if (state === "CLEARED") return "already cleared";
            if (state === "NONE") return "not flagged";
            return null;
        case "CONFIRM_FRAUD":
            /* An order whose advertisement is already up (PENDING_OTP onward) is refused 409 ORDER_LIVE with a
               sentence pointing to disputes — the server's to say, so the console offers the move and shows it. */
            if (state === "CONFIRMED_FRAUD") return "already confirmed";
            if (order.status === "CANCELLED") return "already cancelled";
            return null;
    }
}

/** The participle the plan and the summary say: "3 held". */
export const REVIEW_PARTICIPLE: Record<ReviewAction, string> = {
    HOLD: "held",
    RELEASE: "released",
    CLEAR: "cleared",
    CONFIRM_FRAUD: "cancelled as fraud",
};

/** The backend's bound on a reason, as on every ops reason on an order. */
export const REVIEW_REASON_MIN = 3;
export const REVIEW_REASON_MAX = 500;
export const reasonOk = (text: string): boolean => text.trim().length >= REVIEW_REASON_MIN && text.trim().length <= REVIEW_REASON_MAX;

/** The cap on one bulk call. */
export const REVIEW_BULK_MAX = 100;

/* ------------------------------------------------------------------ */
/* The cancel impact                                                   */
/* ------------------------------------------------------------------ */

type Amount = string | number | null | undefined;

/**
 * `GET /orders/:id/cancel-impact` — what cancelling would do, read-only (the
 * cancel's own computation as a dry run). Every field optional: the dialog
 * prints what came. `cancellable` false with `blockedReason` is the
 * sentence a cancel would be refused with (ORDER_LIVE: the advertisement is
 * already up — raise a dispute).
 */
export interface CancelImpact {
    orderId?: string;
    status?: string;
    cancellable?: boolean;
    blockedReason?: string | null;
    /** `to`: ADVERTISER_WALLET, or NONE when nothing is owed. */
    refund?: { amount?: Amount; to?: string | null; note?: string | null } | null;
    /** What the cancel reverses (nothing: it stops further days) and what was already credited, which stays. */
    publisherReversal?: { amount?: Amount; accruedToDate?: Amount; note?: string | null } | null;
    agentsReleased?: number | null;
    campaignEffects?: string[] | null;
    campaign?: { campaignId?: string; reference?: string; spotsCancelled?: number; refundNeeded?: boolean } | null;
}

/** Where a refund goes, in words; NONE is no refund and is not listed. */
const REFUND_TO: Record<string, string> = { ADVERTISER_WALLET: "the advertiser's wallet" };

const amountOf = (value: Amount): string | null => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return /^-?\d+(\.\d+)?$/.test(text) ? text : null;
};

export interface ImpactTotal {
    /** How many orders the total covers, and how many could not be read. */
    orders: number;
    unread: number;
    refund: string;
    /** Where the refunds go, each once. */
    refundTo: string[];
    publisherReversal: string;
    /** Already credited to the publishers; stays — reversing it is a finance decision. */
    publisherAccrued: string;
    agentsReleased: number;
    campaignEffects: string[];
    /** Orders a cancel would refuse, and why — each sentence once. */
    blocked: number;
    blockedReasons: string[];
}

/** The impacts summed for the confirm dialog — the money, the agents freed, each campaign effect said once. */
export function sumImpacts(impacts: readonly (CancelImpact | null)[]): ImpactTotal {
    const read = impacts.filter((impact): impact is CancelImpact => impact !== null);
    const refundTo = new Set<string>();
    const effects = new Set<string>();
    const reasons = new Set<string>();
    let blocked = 0;
    for (const impact of read) {
        const to = impact.refund?.to?.trim();
        if (to && to !== "NONE") refundTo.add(REFUND_TO[to] ?? to);
        for (const effect of impact.campaignEffects ?? []) if (effect.trim()) effects.add(effect.trim());
        if (impact.cancellable === false) {
            blocked += 1;
            if (impact.blockedReason?.trim()) reasons.add(impact.blockedReason.trim());
        }
    }
    return {
        orders: read.length,
        unread: impacts.length - read.length,
        refund: sumMoney(read.map((impact) => amountOf(impact.refund?.amount))),
        refundTo: [...refundTo],
        publisherReversal: sumMoney(read.map((impact) => amountOf(impact.publisherReversal?.amount))),
        publisherAccrued: sumMoney(read.map((impact) => amountOf(impact.publisherReversal?.accruedToDate))),
        agentsReleased: read.reduce((sum, impact) => sum + (typeof impact.agentsReleased === "number" && Number.isFinite(impact.agentsReleased) ? impact.agentsReleased : 0), 0),
        campaignEffects: [...effects],
        blocked,
        blockedReasons: [...reasons],
    };
}

/* ------------------------------------------------------------------ */
/* The queue                                                           */
/* ------------------------------------------------------------------ */

export interface ReviewQuery {
    status?: ReviewFilter;
    q?: string;
    sort?: ReviewSort;
    page?: number;
    pageSize?: number;
}

/** One page of the queue, as the console reads it: the rows shaped as orders, and the count per status. */
export interface ReviewPage {
    items: Order[];
    total: number;
    page: number;
    pageSize: number;
    counts: Partial<Record<ReviewFilter, number>>;
}

type WireOrderRow = Parameters<typeof shapeOrder>[0];

/** The page as the route sends it. Optional throughout: the console draws what came. */
export interface WireReviewPage {
    items?: WireOrderRow[];
    total?: number;
    page?: number;
    pageSize?: number;
    counts?: Record<string, number>;
}

/** `?status=&q=&page=&pageSize=&sort=` — nothing sent that was not asked for, the status and sort always. */
export function reviewPath(query: ReviewQuery = {}): string {
    const params = new URLSearchParams();
    params.set("status", query.status ?? "FLAGGED");
    if (query.q?.trim()) params.set("q", query.q.trim());
    params.set("sort", query.sort ?? "score");
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(Math.min(query.pageSize ?? 25, REVIEW_BULK_MAX)));
    return `/orders/fraud-review?${params.toString()}`;
}

export function shapeReviewPage(raw: WireReviewPage, query: ReviewQuery = {}): ReviewPage {
    const counts: Partial<Record<ReviewFilter, number>> = {};
    for (const key of REVIEW_FILTERS) {
        const value = raw.counts?.[key];
        if (typeof value === "number") counts[key] = value;
    }
    return {
        items: (raw.items ?? []).map(shapeOrder),
        total: raw.total ?? 0,
        page: raw.page ?? query.page ?? 1,
        pageSize: raw.pageSize ?? query.pageSize ?? 25,
        counts,
    };
}

/* ------------------------------------------------------------------ */
/* Bulk                                                                */
/* ------------------------------------------------------------------ */

/** One order's answer in a bulk run. */
export interface BulkReviewResult {
    id: string;
    ok: boolean;
    code?: string | null;
    message?: string | null;
}

/** The bulk route's answer: `{ action, results, succeeded, failed }` (a bare list is read too). */
export type WireBulkReview = BulkReviewResult[] | { action?: string; results?: BulkReviewResult[]; succeeded?: number; failed?: number };

/**
 * The per-order results as the shared bulk outcome, in the selection's
 * order: an order the answer does not mention is a failure, and says so.
 */
export function outcomeOf<T extends { id: string }>(rows: readonly T[], results: readonly BulkReviewResult[]): BulkOutcome<T> {
    const byId = new Map(results.map((result) => [result.id, result]));
    const outcome: BulkOutcome<T> = { done: [], failed: [] };
    for (const row of rows) {
        const result = byId.get(row.id);
        if (result?.ok) outcome.done.push(row);
        else
            outcome.failed.push({
                row,
                message: result ? result.message?.trim() || result.code || "That did not go through." : "No answer came back for this order.",
            });
    }
    return outcome;
}

const resultsOf = (raw: WireBulkReview): BulkReviewResult[] => (Array.isArray(raw) ? raw : (raw.results ?? []));

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

function live() {
    if (!isLive("orders")) throw new Error("Order screening reads the API; connect the console to the ADX backend first.");
    return http;
}

/** What "Open fraud case" answers — the case, or the order carrying its id. */
export interface OrderFraudCaseAnswer {
    fraudCaseId?: string | null;
    fraudCase?: { id?: string; displayId?: string | null; status?: string } | null;
    /** True when a new case was opened (201); `attached` when the order joined the advertiser's open one (200). */
    opened?: boolean;
    attached?: boolean;
}

export const orderScreeningService = {
    /** The queue, on the list contract, with a count per status. */
    list: async (query: ReviewQuery = {}): Promise<ReviewPage> => shapeReviewPage(await live().get<WireReviewPage>(reviewPath(query)), query),

    /** Paused for review: no dispatch, no earnings, no sign-off. `ORDER_HELD`. */
    hold: (id: string, reason: string) => live().post<unknown>(`/orders/${id}/hold`, { reason }),

    /** `ORDER_RELEASED`. */
    release: (id: string, note?: string) => live().post<unknown>(`/orders/${id}/release`, note?.trim() ? { note: note.trim() } : {}),

    /** Not fraud: released if held, CLEARED, and today's signals remembered so they do not flag it again. `ORDER_RISK_CLEARED`. */
    clear: (id: string, note?: string) => live().post<unknown>(`/orders/${id}/clear`, note?.trim() ? { note: note.trim() } : {}),

    /** CONFIRMED_FRAUD, cancelled through the normal cancel path (refunds and reversals as any cancel). 409 on a completed order. `ORDER_CONFIRMED_FRAUD`. */
    confirmFraud: (id: string, reason: string) => live().post<unknown>(`/orders/${id}/confirm-fraud`, { reason }),

    /** What cancelling would do, read-only — for the confirm dialog. */
    cancelImpact: (id: string) => live().get<CancelImpact>(`/orders/${id}/cancel-impact`),

    /** Opens a case on the advertiser, or attaches the order to its open one. */
    openFraudCase: (id: string) => live().post<OrderFraudCaseAnswer>(`/orders/${id}/fraud-case`, {}),

    /** Scored again now. `ORDER_RESCORED`. */
    rescore: (id: string) => live().post<unknown>(`/orders/${id}/rescore`, {}),

    /** One call per hundred orders; each order answers for itself. */
    bulk: async (action: ReviewAction, orderIds: readonly string[], reason?: string): Promise<BulkReviewResult[]> => {
        const results: BulkReviewResult[] = [];
        for (let start = 0; start < orderIds.length; start += REVIEW_BULK_MAX) {
            const chunk = orderIds.slice(start, start + REVIEW_BULK_MAX);
            const raw = await live().post<WireBulkReview>("/orders/fraud-review/bulk", {
                action,
                orderIds: chunk,
                ...(reason?.trim() ? { reason: reason.trim() } : {}),
            });
            results.push(...resultsOf(raw));
        }
        return results;
    },
};

/** The case id an "Open fraud case" answer names, whichever shape it came in. */
export function caseIdOf(answer: OrderFraudCaseAnswer | null | undefined): string | null {
    return answer?.fraudCaseId ?? answer?.fraudCase?.id ?? null;
}

/** Where a fraud case opens — the desk, preselected. */
export const fraudCaseHref = (caseId: string): string => `/disputes/fraud?case=${encodeURIComponent(caseId)}`;

/**
 * Runs one action over orders: the single route for one, the bulk route
 * for several. Never throws — a refused call is that order's failure, with
 * the server's own sentence.
 */
export async function runReview<T extends Order>(action: ReviewAction, rows: readonly T[], text: string): Promise<BulkOutcome<T>> {
    if (rows.length === 0) return { done: [], failed: [] };
    if (rows.length === 1) {
        const row = rows[0]!;
        try {
            if (action === "HOLD") await orderScreeningService.hold(row.id, text.trim());
            else if (action === "RELEASE") await orderScreeningService.release(row.id, text);
            else if (action === "CLEAR") await orderScreeningService.clear(row.id, text);
            else await orderScreeningService.confirmFraud(row.id, text.trim());
            return { done: [row], failed: [] };
        } catch (cause) {
            return { done: [], failed: [{ row, message: failureMessage(cause) }] };
        }
    }
    try {
        return outcomeOf(rows, await orderScreeningService.bulk(action, rows.map((row) => row.id), text));
    } catch (cause) {
        const message = failureMessage(cause);
        return { done: [], failed: rows.map((row) => ({ row, message })) };
    }
}

/* ------------------------------------------------------------------ */
/* Settings › Fraud — `fraud.orderScreening`                           */
/* ------------------------------------------------------------------ */

/** `settings.fraud.orderScreening` — the thresholds are 0–1 on the wire. */
export interface OrderScreeningSettings {
    enabled: boolean;
    reviewThreshold: number;
    holdThreshold: number;
    /** Off by default: watch mode. */
    autoHold: boolean;
    newAccountDays: number;
    /** Rupees. */
    bigOrderAmount: number;
    velocityCount: number;
    velocityMinutes: number;
}

export const ORDER_SCREENING_DEFAULTS: OrderScreeningSettings = {
    enabled: true,
    reviewThreshold: 0.5,
    holdThreshold: 0.8,
    autoHold: false,
    newAccountDays: 7,
    bigOrderAmount: 100000,
    velocityCount: 5,
    velocityMinutes: 60,
};

/**
 * The form's bounds — the backend's `orderScreeningSchema` exactly: the
 * thresholds 0–1 (typed here as the 0–100 score the queue prints, one
 * decimal place, so three on the wire — the score's own precision), the
 * hold line not below the review line (`orderScreeningProblem`, a 400),
 * whole days, counts and minutes, and the large-order amount in rupees,
 * paise allowed, up to ₹10 crore.
 */
export const ORDER_SCREENING_BOUNDS = {
    threshold: { min: 0, max: 100 },
    newAccountDays: { min: 1, max: 365 },
    bigOrderAmount: { min: 0, max: 100_000_000 },
    velocityCount: { min: 1, max: 1000 },
    velocityMinutes: { min: 1, max: 10_080 },
} as const;

/** The draft as text, the way the inputs hold it. */
export interface OrderScreeningDraft {
    enabled: boolean;
    reviewAt: string;
    holdAt: string;
    autoHold: boolean;
    newAccountDays: string;
    bigOrderAmount: string;
    velocityCount: string;
    velocityMinutes: string;
}

/** 0.555 → "55.5": the stored three places, as the 0–100 score with one. */
export const thresholdText = (value: number): string => String(Math.round(value * 1000) / 10);

export function toScreeningDraft(settings: OrderScreeningSettings): OrderScreeningDraft {
    return {
        enabled: settings.enabled,
        reviewAt: thresholdText(settings.reviewThreshold),
        holdAt: thresholdText(settings.holdThreshold),
        autoHold: settings.autoHold,
        newAccountDays: String(settings.newAccountDays),
        bigOrderAmount: String(settings.bigOrderAmount),
        velocityCount: String(settings.velocityCount),
        velocityMinutes: String(settings.velocityMinutes),
    };
}

const wholeIn = (text: string, bounds: { min: number; max: number }): number | null => {
    if (!/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= bounds.min && value <= bounds.max ? value : null;
};

/** Rupees with at most two places of paise, inside the bounds, or null. */
const rupeesIn = (text: string, bounds: { min: number; max: number }): number | null => {
    if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= bounds.min && value <= bounds.max ? value : null;
};

/** A 0–100 score with at most one decimal place, or null. */
const scoreIn = (text: string): number | null => {
    if (!/^\d{1,3}(\.\d)?$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= ORDER_SCREENING_BOUNDS.threshold.min && value <= ORDER_SCREENING_BOUNDS.threshold.max ? value : null;
};

export type ScreeningDraftProblem = "reviewAt" | "holdAt" | "order" | "newAccountDays" | "bigOrderAmount" | "velocityCount" | "velocityMinutes";

/** What is wrong with the draft, field by field — empty when it can be saved. */
export function screeningDraftProblems(draft: OrderScreeningDraft): ScreeningDraftProblem[] {
    const problems: ScreeningDraftProblem[] = [];
    const review = scoreIn(draft.reviewAt);
    const hold = scoreIn(draft.holdAt);
    if (review === null) problems.push("reviewAt");
    if (hold === null) problems.push("holdAt");
    if (review !== null && hold !== null && hold < review) problems.push("order");
    if (wholeIn(draft.newAccountDays, ORDER_SCREENING_BOUNDS.newAccountDays) === null) problems.push("newAccountDays");
    if (rupeesIn(draft.bigOrderAmount, ORDER_SCREENING_BOUNDS.bigOrderAmount) === null) problems.push("bigOrderAmount");
    if (wholeIn(draft.velocityCount, ORDER_SCREENING_BOUNDS.velocityCount) === null) problems.push("velocityCount");
    if (wholeIn(draft.velocityMinutes, ORDER_SCREENING_BOUNDS.velocityMinutes) === null) problems.push("velocityMinutes");
    return problems;
}

/**
 * The draft as the section, or null while anything is out of bounds. A
 * threshold whose text did not move keeps the stored value exactly, so an
 * untouched 0.555 is not sent back as 0.56.
 */
export function fromScreeningDraft(draft: OrderScreeningDraft, before: OrderScreeningSettings): OrderScreeningSettings | null {
    if (screeningDraftProblems(draft).length > 0) return null;
    const threshold = (text: string, stored: number) => (text.trim() === thresholdText(stored) ? stored : Math.round(Number(text.trim()) * 10) / 1000);
    return {
        enabled: draft.enabled,
        reviewThreshold: threshold(draft.reviewAt, before.reviewThreshold),
        holdThreshold: threshold(draft.holdAt, before.holdThreshold),
        autoHold: draft.autoHold,
        newAccountDays: Number(draft.newAccountDays.trim()),
        bigOrderAmount: Number(draft.bigOrderAmount.trim()),
        velocityCount: Number(draft.velocityCount.trim()),
        velocityMinutes: Number(draft.velocityMinutes.trim()),
    };
}
