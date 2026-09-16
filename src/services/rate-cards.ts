import { api as http } from "@/lib/api-client";

/**
 * Rate cards, wired to the backend `rate-cards` module.
 *
 * Live in every mode, with no fixture fallback — the same reasoning the pricing
 * engine screens use. A rate card decides whether a listing may be published, so
 * a screen showing a plausible seeded card would tell an operator that a price
 * has been approved when nobody approved anything. With the API off these
 * screens say so.
 *
 * The older fixtures under `@/data/pricing` quoted weekly. The API quotes per
 * day, which is the unit the rest of the platform settled on — listings,
 * comparables and the indicator all speak it, and a card in a second unit is
 * how a card rate and a listing rate get compared wrongly.
 */

export type RateCardStatus =
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "ACTIVE"
    | "SUPERSEDED"
    | "ARCHIVED";

export type RateGrade = "PREMIUM" | "A" | "B" | "C";

export const GRADES: RateGrade[] = ["PREMIUM", "A", "B", "C"];

export const GRADE_LABEL: Record<RateGrade, string> = {
    PREMIUM: "Premium",
    A: "Grade A",
    B: "Grade B",
    C: "Grade C",
};

export const RATE_CARD_STATE_META: Record<
    RateCardStatus,
    { label: string; tone: "success" | "warning" | "info" | "neutral" | "danger" }
> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    PENDING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
    ACTIVE: { label: "Active", tone: "success" },
    SUPERSEDED: { label: "Superseded", tone: "neutral" },
    ARCHIVED: { label: "Archived", tone: "neutral" },
};

export interface RateCardEntry {
    id: string;
    mediaTypeId: string;
    mediaTypeName?: string;
    grade: RateGrade;
    /** Null means this combination is not sold — not that it is free. */
    ratePerDay: string | null;
}

export interface RateCard {
    id: string;
    name: string;
    version: number;
    status: RateCardStatus;
    cityId: string | null;
    cityName: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    /** Fraction of the card rate below which a listing needs signing off. */
    floorPct: string;
    /**
     * Lot E (Q97): days a listing left under a revised floor has to raise its
     * rate before a rejected CARD_REVISION case can unpublish it. Never while
     * it has a running order.
     */
    graceDays: number;
    roundingRupees: number;
    notes: string | null;
    approvedById: string | null;
    approvedAt: string | null;
    submittedById: string | null;
    submittedAt: string | null;
    supersedesId: string | null;
    createdAt: string;
    entries?: RateCardEntry[];
    sitesPriced?: number;
}

export type PriceApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Lot E (Q67/Q97): who raised the case. The publisher publishing under the
 * floor — or the pricing engine's binding factor above its cap — is a
 * PUBLISH_REQUEST; a revised card whose floor rose over a live listing is a
 * CARD_REVISION, and that one carries a clock.
 */
export type PriceApprovalSource = "PUBLISH_REQUEST" | "CARD_REVISION";

export const APPROVAL_SOURCE_LABEL: Record<PriceApprovalSource, string> = {
    PUBLISH_REQUEST: "Publish request",
    CARD_REVISION: "Card revision",
};

export interface PriceApproval {
    id: string;
    listingId: string;
    listingTitle?: string;
    rateCardId: string | null;
    status: PriceApprovalStatus;
    source: PriceApprovalSource;
    /** CARD_REVISION only: until when the publisher may still raise the rate. */
    graceUntil: string | null;
    /** A rejection a running order stopped; the case stays PENDING until ops decide again. */
    heldByRunningOrder: boolean;
    requestedRatePerDay: string;
    cardRatePerDay: string | null;
    floorRatePerDay: string | null;
    reason: string | null;
    requestedById: string;
    decidedById: string | null;
    decidedAt: string | null;
    decisionNote: string | null;
    createdAt: string;
}

export interface QuoteStep {
    step: string;
    rule: string;
    factor: string;
    running: string;
}

export interface Quote {
    base: string;
    ratePerDay: string;
    cardId: string | null;
    cardName: string | null;
    floor: string | null;
    belowFloor: boolean;
    steps: QuoteStep[];
}

/** `GET /rate-cards/gate/:listingId` — whether the listing's price is one ADX has agreed to. */
export type GateVerdict =
    | { state: "NOT_COVERED" }
    | { state: "OK"; cardId: string; cardRate: string; floor: string }
    | { state: "BELOW_FLOOR"; cardId: string; cardRate: string; floor: string; rate: string }
    | { state: "APPROVED_BELOW_FLOOR"; approvalId: string }
    | { state: "AWAITING_APPROVAL"; approvalId: string };

export type GateReading = GateVerdict & { belowFloor: boolean };

export const GATE_STATE_META: Record<GateVerdict["state"], { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
    NOT_COVERED: { label: "No card covers it", tone: "neutral" },
    OK: { label: "At or above the floor", tone: "success" },
    BELOW_FLOOR: { label: "Below the floor", tone: "danger" },
    APPROVED_BELOW_FLOOR: { label: "Approved below the floor", tone: "info" },
    AWAITING_APPROVAL: { label: "Awaiting approval", tone: "warning" },
};

/** One ACTIVE listing a card leaves under its floor — `GET /rate-cards/:id/impact`. */
export interface ImpactRow {
    listingId: string;
    title: string;
    publisherId: string | null;
    publisherUserId: string | null;
    ratePerDay: string;
    cardRate: string;
    floor: string;
    /** How far under the floor, a day. */
    shortfall: string;
    /** The case already standing on the listing, when there is one. */
    liveCase: { id: string; status: PriceApprovalStatus; source: PriceApprovalSource } | null;
}

export interface RateCardImpact {
    cardId: string;
    name: string;
    version: number;
    status: RateCardStatus;
    graceDays: number;
    affected: number;
    rows: ImpactRow[];
}

/** What `approve` did beyond flipping the status: the CARD_REVISION cases it raised. */
export interface ApproveOutcome {
    affected: number;
    raised: number;
    listingIds: string[];
}

/** One cell of the grid as the builder holds it; null is "not sold at this grade". */
export interface DraftEntry {
    mediaTypeId: string;
    grade: RateGrade;
    ratePerDay: string | null;
}

/**
 * E10-2: the grid, the floor and the grace the builder has typed but not
 * saved — what `POST /rate-cards/:id/impact/dry-run` measures, and what
 * `publishDraft` persists once the operator approves.
 */
export interface RateCardDraft {
    entries: DraftEntry[];
    /** A fraction, four places — `0.8200`. */
    floorPct: string;
    graceDays: number;
    roundingRupees: number;
}

/** The dry-run body: the cells and the two settings the measurement reads; rounding is not one of them. */
export const dryRunBody = (draft: RateCardDraft): { entries: DraftEntry[]; floorPct: string; graceDays: number } => ({
    entries: draft.entries,
    floorPct: draft.floorPct,
    graceDays: draft.graceDays,
});

/** One page of the designed-list contract over price approvals (E10-2). */
export interface ApprovalsPage {
    items: PriceApproval[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed. */
    counts: Record<string, number>;
}

export interface ApprovalsQuery {
    status?: PriceApprovalStatus;
    source?: PriceApprovalSource;
    listingId?: string;
    page?: number;
    pageSize?: number;
}

/**
 * `?status=&source=&listingId=&page=&pageSize=` for `GET /rate-cards/approvals`.
 * The page is always named, because that is what makes the server answer
 * the list contract rather than the bare array it answered before E10-2.
 */
export function approvalsQuery(query: ApprovalsQuery = {}): string {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.source) params.set("source", query.source);
    const listingId = query.listingId?.trim();
    if (listingId) params.set("listingId", listingId);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(Math.min(query.pageSize ?? 20, 100)));
    return params.toString();
}

export const rateCardService = {
    list: (status?: RateCardStatus) =>
        http.get<RateCard[]>(`/rate-cards${status ? `?status=${status}` : ""}`),

    get: (id: string) => http.get<RateCard>(`/rate-cards/${id}`),

    create: (body: {
        name: string;
        cityId?: string | null;
        effectiveFrom?: string | null;
        effectiveTo?: string | null;
        floorPct?: string;
        graceDays?: number;
        roundingRupees?: number;
        notes?: string | null;
    }) => http.post<RateCard>("/rate-cards", body),

    update: (id: string, patch: Record<string, unknown>) =>
        http.patch<RateCard>(`/rate-cards/${id}`, patch),

    /** The grid is saved whole, because it is edited whole. */
    setEntries: (
        id: string,
        entries: { mediaTypeId: string; grade: RateGrade; ratePerDay: string | null }[]
    ) => http.put<RateCard>(`/rate-cards/${id}/entries`, { entries }),

    submit: (id: string) => http.post<RateCard>(`/rate-cards/${id}/submit`),
    /**
     * The act that lets a card decide whether a listing may publish — and,
     * since Lot E (Q97), the one that raises a CARD_REVISION case on every
     * ACTIVE listing the new floor leaves underneath it. `impact` says how
     * many.
     */
    approve: (id: string) => http.post<RateCard & { impact: ApproveOutcome }>(`/rate-cards/${id}/approve`),

    /**
     * What approving this card would do — readable on a draft, which is the
     * point: the Impact step of the approve dialog is drawn from this before
     * anything is signed.
     */
    impact: (id: string) => http.get<RateCardImpact>(`/rate-cards/${id}/impact`),

    /**
     * E10-2: the same measurement over the grid the builder holds, with the
     * floor and grace it would carry — nothing persisted, no revision
     * created, no case raised. The card's identity, city and status stay
     * the stored card's, which is what picks the listings measured.
     */
    impactDryRun: (id: string, draft: RateCardDraft) => http.post<RateCardImpact>(`/rate-cards/${id}/impact/dry-run`, dryRunBody(draft)),

    /** The verdict on one listing, plus the one-word `belowFloor` beside it. */
    gate: (listingId: string) => http.get<GateReading>(`/rate-cards/gate/${listingId}`),
    reject: (id: string) => http.post<RateCard>(`/rate-cards/${id}/reject`),
    archive: (id: string) => http.post<RateCard>(`/rate-cards/${id}/archive`),
    revise: (id: string) => http.post<RateCard>(`/rate-cards/${id}/revise`),

    quote: (body: {
        mediaTypeId: string;
        grade?: RateGrade;
        cityId?: string | null;
        factors?: { name: string; kind: "MULTIPLIER" | "BASE_ADJUST"; value: string }[];
    }) => http.post<Quote>("/rate-cards/quote", body),

    /** E10-2: the queue under `?status=&source=&listingId=`, paged — the list contract. */
    approvals: (query: ApprovalsQuery = {}) => http.get<ApprovalsPage>(`/rate-cards/approvals?${approvalsQuery(query)}`),

    decide: (id: string, approve: boolean, note?: string) =>
        http.patch<PriceApproval>(`/rate-cards/approvals/${id}`, { approve, note }),
};

/**
 * The publish flow, in the order the dialog's Approve runs it (E10-2):
 * nothing before this call has touched the server beyond the dry-run.
 *
 * An ACTIVE card is never edited, so its next version is created first and
 * the draft is written to that; a DRAFT or PENDING card takes the draft
 * itself. Then the settings and the grid are persisted, a DRAFT is
 * submitted, and the target is approved — the one act that raises the
 * CARD_REVISION cases the dry-run counted. Returns the card the approval
 * acted on and what the approval did.
 */
export async function publishDraft(card: RateCard, draft: RateCardDraft): Promise<{ target: RateCard; approved: RateCard & { impact: ApproveOutcome } }> {
    const target = card.status === "ACTIVE" ? await rateCardService.revise(card.id) : card;
    await rateCardService.update(target.id, { roundingRupees: draft.roundingRupees, floorPct: draft.floorPct, graceDays: draft.graceDays });
    await rateCardService.setEntries(target.id, draft.entries);
    if (target.status === "DRAFT") await rateCardService.submit(target.id);
    const approved = await rateCardService.approve(target.id);
    return { target, approved };
}
