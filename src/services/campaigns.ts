import { api as http } from "@/lib/api-client";
import { flightLabel } from "@/lib/format";
import type { OrderPlacedBy, StatusMeta } from "@/types";

/**
 * Campaigns — DR 10's worklist (`5102:26294`) and DR 06's advertiser list.
 *
 * The console drew these from fixtures while `api-config.ts` asserted that
 * `Campaign` was not a table. It is: a seventeen-step model with five satellite
 * tables and fifteen routes, which both mobile apps already read. That constant
 * is gone with this file.
 *
 * No fixture fallback. The seeded `cmp_*` ids were never issued by the backend,
 * so an approve on one of them would have gone to a campaign that does not
 * exist — and the buttons that would have done it were inert JSX anyway.
 */

export type CampaignStatus =
    | "DRAFT"
    | "PENDING_PAYMENT"
    | "SCHEDULED"
    | "LIVE"
    | "PAUSED"
    | "COMPLETED"
    | "CANCELLED";

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
    "DRAFT",
    "PENDING_PAYMENT",
    "SCHEDULED",
    "LIVE",
    "PAUSED",
    "COMPLETED",
    "CANCELLED",
];

const LABEL: Record<CampaignStatus, string> = {
    DRAFT: "Draft",
    PENDING_PAYMENT: "Awaiting payment",
    SCHEDULED: "Scheduled",
    LIVE: "Live",
    PAUSED: "Paused",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
};

export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, "success" | "warning" | "danger" | "neutral"> = {
    DRAFT: "neutral",
    PENDING_PAYMENT: "warning",
    SCHEDULED: "warning",
    LIVE: "success",
    PAUSED: "warning",
    COMPLETED: "neutral",
    CANCELLED: "danger",
};

export const campaignStatusLabel = (status: CampaignStatus): string => LABEL[status] ?? status;

/** Each status's one line, for the Status select. */
export const CAMPAIGN_STATUS_DESCRIPTION: Record<CampaignStatus, string> = {
    DRAFT: "Being put together; not sent to pay yet.",
    PENDING_PAYMENT: "Sent to the advertiser; not paid yet.",
    SCHEDULED: "Paid; starts later, or held until the advertiser is verified.",
    LIVE: "Running now.",
    PAUSED: "Stopped for now.",
    COMPLETED: "The flight is over.",
    CANCELLED: "Called off; the spots were released.",
};

/* ------------------------------------------------------------------ */
/* What a campaign is waiting on (2 Oct 2026)                          */
/* ------------------------------------------------------------------ */

/**
 * The gates between a campaign and going live, as the admin list and the
 * launch queue name them (`waitingOn[]`) — derived on the server from the
 * real gates (QR-16's `launchBlockedBy`, the checkout state, the artwork
 * review, the design quote, the reservation fee, the spots). Empty when
 * nothing blocks. A reason this list has not heard of is still drawn, in
 * the server's own word.
 */
export type WaitingOnReason = "PAYMENT" | "KYC" | "ARTWORK" | "DESIGN_QUOTE" | "RESERVATION_FEE" | "PUBLISHER" | "AGENT";

export const WAITING_ON_REASONS: readonly WaitingOnReason[] = ["PAYMENT", "RESERVATION_FEE", "KYC", "ARTWORK", "DESIGN_QUOTE", "PUBLISHER", "AGENT"];

/** Each reason in plain words, with its one line for the Waiting on select. */
export const WAITING_ON_META: Record<WaitingOnReason, { label: string; description: string }> = {
    PAYMENT: { label: "Payment", description: "Sent to the advertiser to pay; not paid yet." },
    RESERVATION_FEE: { label: "Reservation fee", description: "The fee that holds the spots is due." },
    KYC: { label: "Advertiser KYC", description: "Paid, but the advertiser is not verified, so it cannot go live." },
    ARTWORK: { label: "Artwork approval", description: "Artwork is in, waiting for ADX to approve it." },
    DESIGN_QUOTE: { label: "Design quote", description: "The advertiser asked ADX to design; the quote is not settled." },
    PUBLISHER: { label: "Publisher", description: "A spot is waiting for its publisher to accept." },
    AGENT: { label: "Agent", description: "A spot is waiting for an agent to install it." },
};

const isWaitingOnReason = (reason: string): reason is WaitingOnReason => (WAITING_ON_REASONS as readonly string[]).includes(reason);

/** "Advertiser KYC", or the server's word in sentence case for a reason added since. */
export function waitingOnLabel(reason: string): string {
    if (isWaitingOnReason(reason)) return WAITING_ON_META[reason].label;
    const words = reason.replace(/_/g, " ").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Waiting on Payment · Advertiser KYC" — the pill line under a status; null when nothing blocks. */
export function waitingOnLine(reasons: readonly string[] | null | undefined): string | null {
    if (!reasons || reasons.length === 0) return null;
    return `Waiting on ${reasons.map(waitingOnLabel).join(" · ")}`;
}

/** Lifetime counts off the tracking events — QR scans, landing views, CTA clicks, enquiries (form submits). */
export interface CampaignPerformanceTotals {
    scans: number;
    views: number;
    ctaClicks: number;
    enquiries: number;
}

/** "120 scans · 80 views · 4 enquiries" — compact, for a list cell. */
export function performanceLine(totals: CampaignPerformanceTotals | null | undefined): string | null {
    if (!totals) return null;
    const part = (value: number, one: string, many: string) => `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
    return [part(totals.scans, "scan", "scans"), part(totals.views, "view", "views"), part(totals.enquiries, "enquiry", "enquiries")].join(" · ");
}

/** E11-2: the landing page as `GET /campaigns/:id` carries it — narrowly, without the blocks. */
export interface CampaignLandingSummary {
    id: string;
    slug: string;
    status: "DRAFT" | "PUBLISHED";
    url: string;
    publishedAt: string | null;
}

/** A campaign row exactly as `GET /campaigns` sends it. */
export interface WireCampaign {
    id: string;
    reference: string;
    name: string;
    status: CampaignStatus;
    goal: string | null;
    brandName: string | null;
    /** The repository maps `targetLocation` onto this. It is free text. */
    city: string | null;
    budget: string | null;
    total: string | null;
    startDate: string | null;
    endDate: string | null;
    spotCount: number;
    createdAt: string;
    updatedAt: string;
    /*
     * 2 Oct 2026 — the admin list's added columns. Every one optional: the
     * list draws before the backend sends them, and a party-facing read
     * never will.
     */
    advertiserId?: string;
    /**
     * The advertiser behind it. On ADX's reads it is the orders' `placedBy`
     * shape (business + ADV-…, person + ADX-…); the apps' rows carry a narrow
     * `{ id, displayId, name }` instead, which `shapeCampaign` leaves out.
     */
    advertiser?: OrderPlacedBy | { id: string; displayId: string | null; name: string } | null;
    /** What stands between it and going live; empty when nothing does. */
    waitingOn?: string[];
    /** Spots running now, out of `spotsTotal`. */
    spotsLive?: number | null;
    spotsTotal?: number | null;
    /** Lifetime tracking counts. */
    performance?: CampaignPerformanceTotals | null;
    /** What was actually paid, a decimal string; null until it is. */
    paidAmount?: string | null;
    paidAt?: string | null;
    /** Whole days left in the flight while it is live; null otherwise. */
    daysLeft?: number | null;
    /** The landing page, narrowly; null when there is none. */
    landingPage?: CampaignLandingSummary | null;
}

export interface CampaignRow {
    id: string;
    reference: string;
    name: string;
    status: CampaignStatus;
    goal: string | null;
    brandName: string | null;
    /**
     * Where the campaign is aimed, as the advertiser typed it in the wizard.
     *
     * Named `area` rather than `city` on purpose: the column behind it is
     * `targetLocation`, free text that may be a mall, a pin label or a market.
     * Calling it a city invites a city filter that would be filtering prose.
     */
    area: string | null;
    budget: string | null;
    /** What the chosen spots come to. The cart's value, not money spent. */
    committed: string | null;
    startDate: string | null;
    endDate: string | null;
    spotCount: number;
    createdAt: string;
    updatedAt: string;
    /* 2 Oct 2026 — the admin list's columns, defaulted when the read leaves them off. */
    advertiserId: string | null;
    advertiser: OrderPlacedBy | null;
    waitingOn: string[];
    /** Null when the read does not say; the cell then prints the spot count alone. */
    spotsLive: number | null;
    spotsTotal: number;
    performance: CampaignPerformanceTotals | null;
    /** What was paid; null until paid (or when the read does not say). */
    paid: string | null;
    paidAt: string | null;
    daysLeft: number | null;
    landingPage: CampaignLandingSummary | null;
}

/** A list row — or the detail, whose `advertiser` is the apps' narrow join and is left out. */
export function shapeCampaign(wire: Omit<WireCampaign, "advertiser"> & { advertiser?: unknown }): CampaignRow {
    return {
        id: wire.id,
        reference: wire.reference,
        name: wire.name,
        status: wire.status,
        goal: wire.goal,
        brandName: wire.brandName,
        area: wire.city,
        budget: wire.budget,
        committed: wire.total,
        startDate: wire.startDate,
        endDate: wire.endDate,
        spotCount: wire.spotCount ?? 0,
        createdAt: wire.createdAt,
        updatedAt: wire.updatedAt,
        advertiserId: wire.advertiserId ?? null,
        advertiser: partyOf(wire.advertiser),
        waitingOn: wire.waitingOn ?? [],
        spotsLive: wire.spotsLive ?? null,
        spotsTotal: wire.spotsTotal ?? wire.spotCount ?? 0,
        performance: wire.performance ?? null,
        paid: wire.paidAmount ?? null,
        paidAt: wire.paidAt ?? null,
        daysLeft: wire.daysLeft ?? null,
        landingPage: wire.landingPage ?? null,
    };
}

/** The advertiser in the party shape, or null — the apps' narrow `{ id, displayId, name }` is not that shape and is left out. */
export function partyOf(advertiser: unknown): OrderPlacedBy | null {
    if (!advertiser || typeof advertiser !== "object" || !("business" in advertiser)) return null;
    return advertiser as OrderPlacedBy;
}

/** The flight as every list prints it ("12 – 25 Oct 2026"); a draft with no dates says so. One helper, `@/lib/format`. */
export const campaignFlightLabel = (row: { startDate: string | null; endDate: string | null }): string => flightLabel(row, "Not scheduled");

/** "12 – 25 Oct 2026 · 6 days left" while live; the flight alone otherwise. */
export function flightWithDaysLeft(row: Pick<CampaignRow, "startDate" | "endDate" | "status" | "daysLeft">): { flight: string; left: string | null } {
    const flight = campaignFlightLabel(row);
    if (row.status !== "LIVE" || row.daysLeft === null || row.daysLeft < 0) return { flight, left: null };
    return { flight, left: row.daysLeft === 0 ? "Last day" : `${row.daysLeft} ${row.daysLeft === 1 ? "day" : "days"} left` };
}

/** The statuses a campaign may still be cancelled from — the cancel route's own rule. */
export const CANCELLABLE: readonly CampaignStatus[] = ["DRAFT", "PENDING_PAYMENT", "SCHEDULED", "LIVE", "PAUSED"];
export const canCancel = (status: CampaignStatus): boolean => CANCELLABLE.includes(status);

/** Whether "Remind advertiser" applies: sent to pay and not paid. */
export const awaitingPayment = (row: Pick<CampaignRow, "status">): boolean => row.status === "PENDING_PAYMENT";

/**
 * The share of the budget the chosen spots come to — DR 06's "37% of ₹50,000".
 *
 * Null when there is no budget to be a share of, because a bar with no
 * denominator is a bar that means nothing. Capped at 100 so an overspend fills
 * the track rather than running past its end.
 */
export function spendShare(row: Pick<CampaignRow, "budget" | "committed">): number | null {
    const budget = Number(row.budget ?? 0);
    if (!Number.isFinite(budget) || budget <= 0) return null;
    const committed = Number(row.committed ?? 0);
    return Math.min(100, Math.round((committed / budget) * 100));
}

export interface CampaignsPage {
    items: CampaignRow[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export type CampaignSort = "NEWEST" | "OLDEST" | "BUDGET_DESC" | "ENDING_SOON" | "NAME";

/** The list's facets — every one the server's, so the counts and the pager cover the whole result. */
export interface CampaignListQuery {
    status?: CampaignStatus[];
    /** Name, reference, brand — and (2 Oct 2026) the advertiser's business or person, ADV-/ADX- ids. */
    q?: string;
    sort?: CampaignSort;
    page?: number;
    pageSize?: number;
    /** ADMIN only; the API ignores it for anybody else. */
    advertiserId?: string;
    /** A catalogue city's slug, or the text as typed. */
    city?: string;
    /** The flight overlaps [from, to] — YYYY-MM-DD, either end optional. */
    from?: string;
    to?: string;
    waitingOn?: string[];
    /** BRAND_AWARENESS, DIGITAL_LIFT, LOCAL_FOOTFALL — the overview's By goal rows open the list on one. */
    goal?: string[];
}

export const CAMPAIGN_SORTS: readonly CampaignSort[] = ["NEWEST", "OLDEST", "BUDGET_DESC", "ENDING_SOON", "NAME"];

/** The goals a campaign is set, in plain words — the list's goal facet. */
export const CAMPAIGN_GOAL_LABEL: Record<string, string> = {
    BRAND_AWARENESS: "Brand awareness",
    DIGITAL_LIFT: "Digital lift",
    LOCAL_FOOTFALL: "Local footfall",
};

/** The query string `GET /campaigns` takes, nothing sent that was not asked for. */
export function campaignsListPath(query: CampaignListQuery = {}): string {
    const params = new URLSearchParams();
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.q) params.set("q", query.q);
    if (query.advertiserId) params.set("advertiserId", query.advertiserId);
    if (query.city) params.set("city", query.city);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.waitingOn?.length) params.set("waitingOn", query.waitingOn.join(","));
    if (query.goal?.length) params.set("goal", query.goal.join(","));
    params.set("sort", query.sort ?? "NEWEST");
    params.set("pageSize", String(query.pageSize ?? 100));
    if (query.page && query.page > 1) params.set("page", String(query.page));
    return `/campaigns?${params.toString()}`;
}

/** The ceiling on one CSV export of the filtered set. */
export const CAMPAIGN_EXPORT_CAP = 5000;

export const campaignService = {
    list: async (query: CampaignListQuery = {}): Promise<CampaignsPage> => {
        const page = await http.get<{
            items: WireCampaign[];
            total: number;
            page: number;
            pageSize: number;
            counts: Record<string, number>;
        }>(campaignsListPath(query));
        return { ...page, items: (page.items ?? []).map(shapeCampaign) };
    },

    /** Every row the filters match, a hundred at a time, up to the export cap — "Export CSV" over the filtered set. */
    listAll: async (query: Omit<CampaignListQuery, "page" | "pageSize">, cap = CAMPAIGN_EXPORT_CAP): Promise<CampaignRow[]> => {
        const rows: CampaignRow[] = [];
        for (let page = 1; rows.length < cap; page += 1) {
            const next = await campaignService.list({ ...query, page, pageSize: 100 });
            rows.push(...next.items);
            if (next.items.length === 0 || rows.length >= next.total) break;
        }
        return rows.slice(0, cap);
    },

    /**
     * 2 Oct 2026: a nudge to the advertiser to pay — through the existing
     * notify, ADMIN only, once a day per campaign (429 inside the day),
     * audited. 409 when the campaign is not awaiting payment.
     */
    remindPayment: (id: string) => http.post<RemindPaymentResult>(`/campaigns/${encodeURIComponent(id)}/remind-payment`, {}),

    /**
     * What a cancel would do, without doing it — the cancel path's own
     * refund computation, applied to nothing: the hold it would release,
     * the refund it would open and for how much. Cancel… shows it before
     * anything is sent.
     */
    cancelImpact: (id: string) => http.get<CancelImpact>(`/campaigns/${encodeURIComponent(id)}/cancel-impact`),

    /** The launch queue: paid campaigns that cannot go live yet, oldest waiting first, with what each waits on. */
    launchQueue: async (query: LaunchQueueQuery = {}): Promise<LaunchQueuePage> => {
        const page = await http.get<LaunchQueuePage>(launchQueuePath(query));
        return { ...page, items: page.items ?? [], counts: page.counts ?? {} };
    },

    /** Lifetime and daily counts over the flight — scans, landing views, CTA clicks, enquiries. */
    performance: (id: string) => http.get<CampaignPerformance>(`/campaigns/${encodeURIComponent(id)}/performance`),

    get: async (id: string): Promise<CampaignDetail | null> => {
        try {
            return await http.get<CampaignDetail>(`/campaigns/${id}`);
        } catch {
            return null;
        }
    },

    /**
     * What still stands between a campaign and going live — the same read the
     * advertiser's own review step blocks on, so ops and the advertiser cannot
     * disagree about what is outstanding.
     */
    review: (id: string) => http.get<CampaignReview>(`/campaigns/${id}/review`),

    /**
     * Commits the money and launches it — on the advertiser's behalf, out of
     * their wallet (Lot C, Q88). The reference typed back is the confirmation;
     * at or above `finance.opsAuthoriseThreshold` the API answers 409
     * `FOUR_EYES` until a second, different admin is named.
     */
    authorize: (id: string, input: { confirm: string; approvedByUserId?: string }) =>
        http.post<AuthorizeResult>(`/campaigns/${id}/authorize`, input),

    /**
     * The finished brief sent to the advertiser to pay (Lot C, Q88):
     * PENDING_PAYMENT, the spots held 24 h, the advertiser told. A re-send
     * refreshes the hold.
     */
    submitForPayment: (id: string) => http.post<SubmitForPaymentResult>(`/campaigns/${id}/submit-for-payment`, {}),

    /** Releases it. A reason is required so the advertiser is told why. */
    cancel: (id: string, reason: string) => http.post<unknown>(`/campaigns/${id}/cancel`, { reason }),

    /** The codes minted at authorisation, with their scan and click counts. */
    trackingCodes: (id: string) => http.get<TrackingCode[]>(`/campaigns/${id}/tracking-codes`),

    /**
     * QR-1: puts the QR engine's hosted short code in front of every code
     * not yet hosted — for a campaign paid for while the engine was down or
     * before it was configured. Ops only; idempotent; the engine's own
     * refusal comes back as it is.
     */
    syncTrackingCodesWithEngine: (id: string) => http.post<{ linked: number; codes: TrackingCode[] }>(`/campaigns/${id}/tracking-codes/sync-engine`, {}),

    /** What the campaign did — scans, clicks and the landing-page interactions (Lot D, Q7). */
    analytics: (id: string) => http.get<CampaignAnalytics>(`/campaigns/${id}/analytics`),

    /** Lot D (Q138): the seeded content categories the wizard asks about. */
    contentCategories: () => http.get<ContentCategory[]>("/campaigns/content-categories"),

    /**
     * DQ-1: the desk's price for designing the artwork — ADMIN with
     * `content.edit`. Rupees with up to two decimals, a note of at most 500
     * characters. 409 when the campaign did not ask ADX to design, is already
     * paid, or the standing quote is ACCEPTED; a declined or unanswered quote
     * is replaced. Answers the campaign as `GET /campaigns/:id` does.
     */
    quoteDesign: (id: string, input: DesignQuoteInput) =>
        http.post<CampaignDetail>(`/campaigns/${id}/design-quote`, {
            amount: input.amount.trim(),
            ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        }),
};

/* ------------------------------------------------------------------ */
/* DQ-1: the design quote                                              */
/* ------------------------------------------------------------------ */

export type DesignQuoteStatus = "QUOTED" | "ACCEPTED" | "DECLINED";

/** The quote as the design-requests read and the detail carry it; null until the desk names a price. */
export interface DesignQuote {
    amount: string;
    status: DesignQuoteStatus;
    note: string | null;
    quotedAt: string | null;
    respondedAt: string | null;
}

export interface DesignQuoteInput {
    amount: string;
    note?: string | null;
}

/** The chip: where the quote stands, "Awaiting quote" while none was ever named. */
export const DESIGN_QUOTE_STATUS_META: Record<DesignQuoteStatus | "NONE", StatusMeta> = {
    NONE: { label: "Awaiting quote", tone: "warning" },
    QUOTED: { label: "Quoted", tone: "info" },
    ACCEPTED: { label: "Accepted", tone: "success" },
    DECLINED: { label: "Declined", tone: "neutral" },
};

export const designQuoteStatusMeta = (quote: Pick<DesignQuote, "status"> | null | undefined): StatusMeta =>
    DESIGN_QUOTE_STATUS_META[quote?.status ?? "NONE"] ?? DESIGN_QUOTE_STATUS_META.NONE;

/** The quote off the detail's flat columns, in the same shape the design-requests read sends. */
export function designQuoteOf(
    campaign: Pick<CampaignDetail, "designQuoteAmount" | "designQuoteStatus" | "designQuoteNote" | "designQuotedAt" | "designQuoteRespondedAt">,
): DesignQuote | null {
    if (!campaign.designQuoteAmount || !campaign.designQuoteStatus) return null;
    return {
        amount: campaign.designQuoteAmount,
        status: campaign.designQuoteStatus,
        note: campaign.designQuoteNote ?? null,
        quotedAt: campaign.designQuotedAt ?? null,
        respondedAt: campaign.designQuoteRespondedAt ?? null,
    };
}

/**
 * Whether the desk may name (or re-name) a price: the campaign asked ADX to
 * design, is not yet paid, and the standing quote — if any — is not
 * accepted. A declined or unanswered quote may be re-quoted; the backend's
 * own rule, pinned here so the button is not drawn where it would 409.
 */
export function canQuoteDesign(
    /** The detail's columns, or a design-requests row's campaign — every row there is on the ADX path, so it may leave `creativePath` off. */
    campaign: { creativePath?: string | null; status: string },
    quote: Pick<DesignQuote, "status"> | null | undefined,
): boolean {
    if (campaign.creativePath !== undefined && campaign.creativePath !== "ADX_DESIGN_AGENCY") return false;
    if (campaign.status !== "DRAFT" && campaign.status !== "PENDING_PAYMENT") return false;
    return quote?.status !== "ACCEPTED";
}

/** What the quote dialog refuses before the API would. */
export function designQuoteProblem(input: { amount: string; note: string }): string | null {
    const amount = input.amount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return "Enter the design fee in rupees, up to two decimal places.";
    if (Number(amount) <= 0) return "A quote has to be more than zero.";
    if (input.note.trim().length > 500) return "The note is at most 500 characters.";
    return null;
}

/* ------------------------------------------------------------------ */
/* RF-1: the reservation                                               */
/* ------------------------------------------------------------------ */

export type ReservationStatus = "DUE" | "PAID" | "ADJUSTED" | "SUPERSEDED" | "RETAINED" | "LAPSED";

/**
 * The reservation as `GET /campaigns/:id` carries it — null when none was
 * ever taken. `payable` is what the checkout still asks for: the total less
 * the fee once it is paid. `retained` is the part of the fee kept when the
 * hold lapsed unpaid.
 */
export interface CampaignReservation {
    fee: string;
    status: ReservationStatus;
    dueAt: string | null;
    paidAt: string | null;
    holdUntil: string | null;
    retained: string | null;
    payable: string | null;
    paymentId: string | null;
}

export const RESERVATION_STATUS_META: Record<ReservationStatus, StatusMeta> = {
    DUE: { label: "Fee due", tone: "warning" },
    PAID: { label: "Held", tone: "success" },
    ADJUSTED: { label: "Folded into the checkout", tone: "success" },
    SUPERSEDED: { label: "Superseded", tone: "neutral" },
    RETAINED: { label: "Part retained", tone: "danger" },
    LAPSED: { label: "Lapsed", tone: "neutral" },
};

export const reservationStatusMeta = (status: string): StatusMeta =>
    RESERVATION_STATUS_META[status as ReservationStatus] ?? { label: status.replace(/_/g, " ").toLowerCase(), tone: "neutral" };

/** RF-1: what the review offers — the terms the advertiser sees on Review & pay; `offered` is the threshold met while the feature is on. */
export interface ReservationOffer {
    enabled: boolean;
    offered: boolean;
    amount: string;
    pct: number;
    minCheckoutValue: number;
    payWithinMinutes: number;
    holdHours: number;
    retainPct: number;
}

/* ------------------------------------------------------------------ */
/* PS-1: who prints                                                    */
/* ------------------------------------------------------------------ */

export type FulfilmentChoice = "ADX_PRINTS" | "ADVERTISER_SHIPS";

export const FULFILMENT_LABEL: Record<FulfilmentChoice, string> = {
    ADX_PRINTS: "ADX prints",
    ADVERTISER_SHIPS: "Advertiser ships",
};

/** The line's own choice, or the campaign's when the line has none; null when neither said. */
export const fulfilmentLabel = (line: FulfilmentChoice | null | undefined, campaign: FulfilmentChoice | null | undefined): string | null => {
    const choice = line ?? campaign ?? null;
    return choice ? (FULFILMENT_LABEL[choice] ?? choice) : null;
};

/** One priced line of the review, as far as the console draws it. */
export interface CampaignReviewLine {
    spotId: string;
    listingId: string;
    title: string;
    city: string | null;
    days: number;
    quantity: number;
    lineTotal: string;
    fees: { label: string; amount: string }[];
    gst: string;
    gross: string;
    /** PS-1: the print choice the line was priced under; null means the campaign's. */
    fulfilment: FulfilmentChoice | null;
}

/**
 * The QR for a tracking code, drawn by the API (Lot D, Q139). Behind the
 * bearer token like every campaign read, so it is fetched through
 * `<PrivateFile>` rather than set as a plain `<img src>`.
 */
export const trackingCodeImageUrl = (campaignId: string, code: string, size = 240): string =>
    `/campaigns/${campaignId}/tracking-codes/${encodeURIComponent(code)}/image.png?size=${size}`;

/** QR-1: the same code as the vector a print designer wants — the engine's styled artwork when it hosts the code. */
export const trackingCodeSvgUrl = (campaignId: string, code: string): string =>
    `/campaigns/${campaignId}/tracking-codes/${encodeURIComponent(code)}/image.svg`;

/**
 * `POST /campaigns/:id/submit-for-payment` — an envelope, not the campaign:
 * the campaign as `GET /campaigns/:id` answers it, the review it passed, and
 * when the hold on its spots lapses (ISO).
 */
export interface SubmitForPaymentResult {
    campaign: CampaignDetail;
    review: CampaignReview;
    reservedUntil: string;
}

export interface AuthorizeResult {
    /** Lot B (Q1): the CAMPAIGN_ASSIST incentive recorded for the agent, if any. */
    incentive?: { id: string; amount: string } | null;
    approvedByUserId?: string | null;
    [key: string]: unknown;
}

export interface TrackingCode {
    id: string;
    spotId: string | null;
    code: string;
    /** ADX's own `/t/:code` URL — where every scan is counted. */
    url: string;
    /**
     * QR-1: what the hoarding actually carries — the engine's short URL
     * (`/r/XXXX` on the ADX short origin, which 302s to `url`) when the
     * engine hosts the code, else `url` itself. Absent on a backend older
     * than QR-1, in which case it is `url`.
     */
    printedUrl?: string;
    /** QR-1: who hosts the code in front of `/t/` — GENQR, or LOCAL for a code the hoarding carries as `/t/` itself. */
    engine?: "LOCAL" | "GENQR";
    shortUrl?: string | null;
    engineLinkedAt?: string | null;
    method: string;
    destination: string | null;
    promoCode: string | null;
    scans: number;
    clicks: number;
    redemptions: number;
}

export interface ContentCategory {
    id: string;
    name: string;
    slug: string;
    isSensitive: boolean;
    isActive: boolean;
}

/**
 * QR-1: the QR engine's log of the same scans — folded over the hosted
 * codes. Drawn BESIDE ADX's measured number, never in its place: the
 * engine sees the phone's country, city, browser and OS that ADX does not
 * read. Null when no engine hosts any of the campaign's codes.
 */
export interface CampaignEngineView {
    provenance: "ENGINE";
    engine: "GENQR";
    basis: string;
    codesLinked: number;
    codesTotal: number;
    codesUnanswered: number;
    days: number;
    totalScans: number;
    scansInWindow: number;
    scansByDay: { date: string; count: number }[];
    hourlyBreakdown: { hour: number; count: number }[];
    deviceBreakdown: { label: string; count: number }[];
    browserBreakdown: { label: string; count: number }[];
    osBreakdown: { label: string; count: number }[];
    countryBreakdown: { label: string; code: string | null; count: number }[];
    cityBreakdown: { label: string; count: number }[];
}

/** `GET /campaigns/:id/analytics` — read loosely; the page draws the interactions block. */
export interface CampaignAnalytics {
    scans?: { value: number; provenance: string };
    clicks?: { value: number; provenance: string };
    /** QR-1: the engine's panel, or null / absent. */
    engine?: CampaignEngineView | null;
    /** Lot D (Q7): what happened on the landing page after the scan. MEASURED, never invented. */
    interactions?: {
        provenance: "MEASURED";
        byDevice: { device: string | null; count: number }[];
        byHour: { hourIst: number | null; count: number }[];
        byCity: { city: string | null; count: number }[];
        byCta: { ctaLabel: string | null; count: number }[];
    };
    [key: string]: unknown;
}

/** A creative row on the campaign aggregate — the moderation record (Lot D, Q44). */
export interface CampaignCreativeRow {
    id: string;
    spotId: string | null;
    path: string;
    status: string;
    fileUrl: string | null;
    fileName: string | null;
    reviewNote: string | null;
    reviewedAt: string | null;
    submittedAt: string | null;
    flags: string[];
    resubmissionOfId: string | null;
    designedByAdx: boolean;
    advertiserAcceptedAt: string | null;
}

/** E6: the refund the cancel recorded, as `GET /campaigns/:id` carries it. */
export interface CampaignRefundSummary {
    id: string;
    amount: string;
    status: "PENDING" | "RELEASED" | "REJECTED";
    reason: string;
    releasedAt: string | null;
}

/** The aggregate `GET /campaigns/:id` answers with. Read loosely — the wizard
 *  writes seventeen steps into it and this screen reads a handful. */
export interface CampaignDetail extends Omit<WireCampaign, "advertiser"> {
    /** The narrow advertiser the apps read; the console's line reads `placedBy`. */
    advertiser?: { id: string; name: string; companyName: string | null } | null;
    /** 2 Oct 2026, ADX's read: the advertiser as the orders' "Placed by". */
    placedBy?: OrderPlacedBy | null;
    /** 2 Oct 2026, ADX's read: per reason in `waitingOn`, the fact needed to act on it. */
    waitingFacts?: WaitingFacts;
    advertiserId: string;
    agentId: string | null;
    step: number;
    productName?: string | null;
    industry?: string | null;
    targetLocation?: string | null;
    /** Lot D (Q8/Q107): every market the campaign targets; `targetMarket` stays the first. */
    targetMarkets?: string[];
    targetMarket?: string | null;
    /** Advisory, never a refusal: more than one market and no per-market creative. */
    multiMarketWarning?: boolean;
    /** Lot D (Q138): what the creative advertises, from the seeded list. */
    contentCategoryId?: string | null;
    creativePath?: string | null;
    trackingMethod?: string;
    /** Lot C (Q88): when ops sent it to the advertiser to pay. */
    submittedForPaymentAt?: string | null;
    spotsSubtotal?: string | null;
    discount?: string | null;
    spots?: {
        id: string;
        listingId: string;
        status: string;
        lineTotal: string | null;
        /** OM-1: the order fulfilling this spot, once one exists; the aggregate's `include` always sends it. */
        orderId?: string | null;
        /** Lot B (Q38): stamped at authorisation from the quote that priced
         *  the review, as a fraction ("0.1500"). Null on a spot authorised
         *  before the stamp existed — the accrual resolves that one. */
        commissionPct?: string | null;
        commissionSource?: string | null;
        /** The narrow listing the aggregate joins. */
        listing?: { id: string; title: string; city: string | null };
    }[];
    creatives?: CampaignCreativeRow[];
    codes?: { id: string; code: string; spotId: string | null }[];
    refund?: CampaignRefundSummary | null;
    /** PS-1: who prints, for the whole campaign; a line may say otherwise. */
    fulfilment?: FulfilmentChoice | null;
    /** DQ-1: the design quote's flat columns; `designQuoteOf` folds them. Absent on a backend older than DQ-1. */
    designQuoteAmount?: string | null;
    designQuoteStatus?: DesignQuoteStatus | null;
    designQuoteNote?: string | null;
    designQuotedAt?: string | null;
    designQuotedByUserId?: string | null;
    designQuoteRespondedAt?: string | null;
    /** RF-1: the reservation, or null when none was ever taken. Absent on a backend older than RF-1. */
    reservation?: CampaignReservation | null;
    /** QR-16: what stops a paid campaign from going live — `["KYC"]` while the advertiser is unverified. */
    launchBlockedBy?: string[];
}

export interface CampaignReview {
    campaignId?: string;
    reference?: string;
    total?: string;
    /** The bill's parts, in the frame's order: spots + fees − discount + GST (net of the discount's share) = total. */
    lines?: CampaignReviewLine[];
    spotsSubtotal?: string;
    feesTotal?: string;
    /** GST-D: net of `discountGst` — the tax on what is actually paid. */
    gstAmount?: string;
    discount?: string;
    /** GST-D: the tax the discount took off with it; the discount comes off the taxable value. */
    discountGst?: string;
    /** PC-1: the code behind `discount`, when one is on the booking. */
    promo?: { code: string; amount: string } | null;
    /** DQ-1: ADX's accepted design quote as a fee on the booking; null until accepted. */
    designFee?: { amount: string; gst: string; note: string | null } | null;
    /** RF-1: the offer as Review & pay draws it. */
    reservationFee?: ReservationOffer | null;
    /** What the wizard has not answered — AUTHORIZE / AGREEMENT_REQUIRED among them. */
    missing?: { step: string; field: string; label: string }[];
    /** Lot D (Q120): artwork with a file that ops have not approved. */
    outstanding?: { code: string; label: string; creativeIds: string[] }[];
    /** Lot D (Q123): the insertion order, and whether it stands on the version live now. */
    agreements?: {
        kind: string;
        accepted: boolean;
        templateVersion: number | null;
        currentVersion: number | null;
        current: boolean;
    }[];
    /** Lot G (Q116/136): a spot with no slot left over the flight — the holds counted against the listing's `slotsTotal`. */
    clashes?: { spotId: string; listingId: string; title: string; reason?: "NO_SLOT_LEFT" }[];
    [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* 2 Oct 2026: reminders, the cancel's dry run, the launch queue,      */
/* the performance read, the CSV                                       */
/* ------------------------------------------------------------------ */

/** `POST /campaigns/:id/remind-payment` — what the advertiser was reminded of, when it went, and when the next one may. */
export interface RemindPaymentResult {
    campaignId?: string;
    reference?: string;
    about?: "PAYMENT" | "RESERVATION_FEE";
    amountDue?: string | null;
    remindedAt?: string;
    nextAllowedAt?: string | null;
}

/** `GET /campaigns/:id/cancel-impact` — the cancel's own outcome, computed and not applied. */
export interface CancelImpact {
    campaignId?: string;
    reference?: string;
    cancellable?: boolean;
    notCancellableBecause?: "ALREADY_CANCELLED" | "COMPLETED" | null;
    /** Paid but not started: the wallet hold that goes back, a decimal string. */
    holdReleased?: string | null;
    /** Whether a refund would be opened at the refund desk. */
    refundNeeded?: boolean;
    /** The unused whole days of what was paid, a decimal string. */
    refundAmount?: string | null;
    unusedDays?: number;
    reservationFee?: { status: "PAID" | "DUE"; fee: string | null; retained: string | null; returned: string | null } | null;
}

export interface LaunchQueueQuery {
    reason?: string;
    q?: string;
    page?: number;
    pageSize?: number;
}

export function launchQueuePath(query: LaunchQueueQuery = {}): string {
    const params = new URLSearchParams();
    if (query.reason) params.set("reason", query.reason);
    if (query.q) params.set("q", query.q);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 25));
    return `/campaigns/launch-queue?${params.toString()}`;
}

/**
 * Per reason, the fact needed to act on it (`waitingFacts`) — present for
 * each reason on the row: the fee and when it is due; what is still owed;
 * the design quote's state; the advertiser profile the KYC request acts
 * on and its state; the artwork still outstanding; the spots and orders
 * waiting on a publisher or an agent.
 */
export interface WaitingFacts {
    RESERVATION_FEE?: { amount: string | null; dueAt: string | null };
    PAYMENT?: { amountDue: string | null; sentForPaymentAt: string | null; reservationFeePaid: boolean };
    DESIGN_QUOTE?: { state: "NOT_QUOTED" | "QUOTED"; amount: string | null; quotedAt: string | null };
    KYC?: { advertiserId: string; kycStatus: string; accountState?: string };
    ARTWORK?: { creatives: { id: string; status: string; designedByAdx?: boolean }[] };
    PUBLISHER?: { spotIds: string[]; orderIds: string[] };
    AGENT?: { spotIds: string[]; orderIds: string[] };
}

/** One row of the launch queue. */
export interface LaunchQueueRow {
    id: string;
    reference: string;
    name: string;
    status: CampaignStatus;
    brandName?: string | null;
    advertiser: OrderPlacedBy | null;
    startDate?: string | null;
    endDate?: string | null;
    total?: string | null;
    paidAt?: string | null;
    paidAmount?: string | null;
    reservationFeePaidAt?: string | null;
    /** Since when it has waited — the payment (or the reservation fee) — and how many whole days that is. */
    waitingSince?: string | null;
    waitingDays?: number | null;
    waitingOn: string[];
    waitingFacts?: WaitingFacts;
}

export interface LaunchQueuePage {
    items: LaunchQueueRow[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per reason, over the whole queue (a row waiting on two reasons counts in both). */
    counts: Record<string, number>;
}

/** Whole days since a moment, for a row the server sent no `waitingDays` for. */
export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
    if (!iso) return null;
    const ms = now.getTime() - new Date(iso).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

/** One day of the flight on the performance read. */
export interface PerformanceDay extends CampaignPerformanceTotals {
    day: string;
}

/** `GET /campaigns/:id/performance` — lifetime and daily counts over the flight (the days run so far). */
export interface CampaignPerformance {
    campaignId?: string;
    reference?: string;
    status?: CampaignStatus;
    startDate?: string | null;
    endDate?: string | null;
    lifetime: CampaignPerformanceTotals;
    series: PerformanceDay[];
}

export const CAMPAIGNS_CSV_HEADER = [
    "Reference",
    "Campaign",
    "Advertiser",
    "Advertiser ID",
    "Brand",
    "Status",
    "Waiting on",
    "Spots live",
    "Spots",
    "Start",
    "End",
    "Booked (₹)",
    "Paid (₹)",
    "Scans",
    "Views",
    "CTA clicks",
    "Enquiries",
] as const;

/** The rows as a CSV sheet, header first — the ticked rows or the filtered set. */
export function campaignsCsvRows(rows: readonly CampaignRow[]): (string | number | null)[][] {
    return [
        [...CAMPAIGNS_CSV_HEADER],
        ...rows.map((row) => [
            row.reference,
            row.name,
            row.advertiser?.business?.name ?? row.advertiser?.name ?? null,
            row.advertiser?.business?.displayId ?? row.advertiser?.displayId ?? null,
            row.brandName,
            campaignStatusLabel(row.status),
            row.waitingOn.map(waitingOnLabel).join("; "),
            row.spotsLive,
            row.spotsTotal,
            row.startDate ? row.startDate.slice(0, 10) : null,
            row.endDate ? row.endDate.slice(0, 10) : null,
            row.committed,
            row.paid,
            row.performance?.scans ?? null,
            row.performance?.views ?? null,
            row.performance?.ctaClicks ?? null,
            row.performance?.enquiries ?? null,
        ]),
    ];
}
