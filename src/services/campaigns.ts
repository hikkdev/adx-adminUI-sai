import { api as http } from "@/lib/api-client";

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
}

export function shapeCampaign(wire: WireCampaign): CampaignRow {
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
    };
}

/** "2026-10-01 to 2026-10-30", or the truth about a draft. */
export function flightLabel(row: Pick<CampaignRow, "startDate" | "endDate">): string {
    if (!row.startDate || !row.endDate) return "Not scheduled";
    return `${row.startDate.slice(0, 10)} to ${row.endDate.slice(0, 10)}`;
}

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

export const campaignService = {
    list: async (
        query: {
            status?: CampaignStatus[];
            q?: string;
            sort?: CampaignSort;
            pageSize?: number;
            /** ADMIN only; the API ignores it for anybody else. */
            advertiserId?: string;
        } = {},
    ): Promise<CampaignsPage> => {
        const params = new URLSearchParams();
        if (query.status?.length) params.set("status", query.status.join(","));
        if (query.q) params.set("q", query.q);
        if (query.advertiserId) params.set("advertiserId", query.advertiserId);
        params.set("sort", query.sort ?? "NEWEST");
        params.set("pageSize", String(query.pageSize ?? 100));
        const page = await http.get<{
            items: WireCampaign[];
            total: number;
            page: number;
            pageSize: number;
            counts: Record<string, number>;
        }>(`/campaigns?${params.toString()}`);
        return { ...page, items: (page.items ?? []).map(shapeCampaign) };
    },

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

    /** What the campaign did — scans, clicks and the landing-page interactions (Lot D, Q7). */
    analytics: (id: string) => http.get<CampaignAnalytics>(`/campaigns/${id}/analytics`),

    /** Lot D (Q138): the seeded content categories the wizard asks about. */
    contentCategories: () => http.get<ContentCategory[]>("/campaigns/content-categories"),
};

/**
 * The QR for a tracking code, drawn by the API (Lot D, Q139). Behind the
 * bearer token like every campaign read, so it is fetched through
 * `<PrivateFile>` rather than set as a plain `<img src>`.
 */
export const trackingCodeImageUrl = (campaignId: string, code: string, size = 240): string =>
    `/campaigns/${campaignId}/tracking-codes/${encodeURIComponent(code)}/image.png?size=${size}`;

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
    /** The public `/t/:code` URL the QR encodes. */
    url: string;
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

/** `GET /campaigns/:id/analytics` — read loosely; the page draws the interactions block. */
export interface CampaignAnalytics {
    scans?: { value: number; provenance: string };
    clicks?: { value: number; provenance: string };
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
export interface CampaignDetail extends WireCampaign {
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
}

export interface CampaignReview {
    campaignId?: string;
    reference?: string;
    total?: string;
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
