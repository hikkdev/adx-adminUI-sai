import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatMoney, fromPaise, toPaise } from "@/lib/format";
import { supplyService } from "@/services/supply";
import type { ListingLifecycleStatus, StatusMeta } from "@/types";

/**
 * The listing review desk — DR 10's queue over the backend `listings` module.
 *
 * `POST /listings/:id/publish` existed and nothing in the console called it,
 * so every spot a publisher submitted sat at PENDING_REVIEW for ever. These are
 * the calls that empty that queue: read what is waiting, open one, approve it
 * onto the marketplace or send it back with a reason the publisher reads.
 *
 * Live only, with no fixture fallback, for the reason the rate-card screens
 * give: a plausible seeded queue would show an operator listings nobody
 * submitted and let them "approve" something that does not exist. With the
 * API off the screens say so. The domain flag is `supply`, which is where the
 * rest of the listing lifecycle already reads from.
 *
 * Every rupee figure here is a decimal string and stays one — see
 * `formatMoney` in `lib/format` for why nothing in this file builds a float.
 */

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

/** The rate-card gate's answer, exactly as `rate-cards#checkGate` shapes it. */
export type GateVerdict =
    | { state: "NOT_COVERED" }
    | { state: "OK"; cardId: string; cardRate: string; floor: string }
    | { state: "BELOW_FLOOR"; cardId: string; cardRate: string; floor: string; rate: string }
    | { state: "APPROVED_BELOW_FLOOR"; approvalId: string }
    | { state: "AWAITING_APPROVAL"; approvalId: string };

export type ListingDocumentKind =
    | "DISPLAY_AGREEMENT"
    | "OWNER_NOC"
    | "ADDRESS_PROOF"
    | "MUNICIPAL_PERMIT"
    | "VEHICLE_RC"
    | "OTHER";

export type ListingDocumentStatus = "PENDING" | "VERIFIED" | "REJECTED";

export type PricingUnit =
    | "PER_DAY"
    | "PER_WEEK"
    | "PER_MONTH"
    | "PER_SQFT_PER_DAY"
    | "PER_SQFT_PER_MONTH";

export type ContentStance = "ALLOWED" | "REQUIRES_APPROVAL" | "NOT_ALLOWED" | "PROHIBITED";

export interface ReviewDocument {
    id: string;
    kind: ListingDocumentKind;
    url: string;
    status: ListingDocumentStatus;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
}

export interface DocumentSummary {
    total: number;
    pending: number;
    verified: number;
    rejected: number;
}

export interface ReviewQueueRow {
    id: string;
    displayId: string | null;
    title: string;
    category: "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";
    subType: string | null;
    status: ListingLifecycleStatus;
    city: string | null;
    address: string;
    placement: string | null;
    widthFt: string | null;
    heightFt: string | null;
    areaSqFt: string | null;
    publisher: { id: string; name: string; displayId: string | null; city: string | null } | null;
    agent: { id: string; displayId: string | null; name: string | null } | null;
    photoCount: number;
    documentSummary: DocumentSummary;
    /** The canonical daily rate, and the unit and figure the publisher typed. */
    asking: { ratePerDay: string | null; basePrice: string | null; pricingUnit: PricingUnit };
    rateGrade: "PREMIUM" | "A" | "B" | "C" | null;
    gate: GateVerdict;
    submittedAt: string | null;
    createdAt: string;
    /** The reason it was last sent back, still on the row after a resubmission. */
    priorReason: string | null;
}

export interface ReviewCase extends ReviewQueueRow {
    description: string | null;
    latitude: number | null;
    longitude: number | null;
    targetAudience: string | null;
    uniqueSellingPoint: string | null;
    footfallNote: string | null;
    estimatedDailyFootfall: number | null;
    illumination: string | null;
    facing: string | null;
    elevation: string | null;
    visibility: string | null;
    trafficGrade: string | null;
    minBookingDays: number | null;
    availableNow: boolean;
    availableFrom: string | null;
    availableHoursFrom: string | null;
    availableHoursTo: string | null;
    peakPeriodNote: string | null;
    rateCardUrl: string | null;
    publisherMobile: string | null;
    vocabulary: {
        mediaType: string | null;
        sizeClass: string | null;
        material: string | null;
        venueType: string | null;
    };
    contentRules: { stance: ContentStance; category: { id: string; name: string } }[];
    photos: { id: string; url: string; type: string; createdAt: string }[];
    documents: ReviewDocument[];
}

/** `CHANGES_REQUESTED` goes back to the publisher as a draft; `REJECTED` is the end. */
export type SendBackOutcome = "CHANGES_REQUESTED" | "REJECTED";

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/** The four categories the wizard files a spot under, as the desk names them. */
export const CATEGORY_LABEL: Record<ReviewQueueRow["category"], string> = {
    INDOOR: "Indoor",
    OUTDOOR: "Outdoor",
    TRANSIT: "Transit",
    MEDIA: "Media",
};

export const DOCUMENT_KIND_LABEL: Record<ListingDocumentKind, string> = {
    DISPLAY_AGREEMENT: "Display agreement",
    OWNER_NOC: "Owner NOC",
    ADDRESS_PROOF: "Address proof",
    MUNICIPAL_PERMIT: "Municipal permit",
    /* AG-4: the registration certificate of a vehicle put up as a spot. */
    VEHICLE_RC: "Vehicle RC",
    OTHER: "Other document",
};

export const DOCUMENT_STATUS_META: Record<ListingDocumentStatus, StatusMeta> = {
    PENDING: { label: "Awaiting check", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

export const PRICING_UNIT_LABEL: Record<PricingUnit, string> = {
    PER_DAY: "per day",
    PER_WEEK: "per week",
    PER_MONTH: "per month",
    PER_SQFT_PER_DAY: "per sq ft per day",
    PER_SQFT_PER_MONTH: "per sq ft per month",
};

export const CONTENT_STANCE_META: Record<ContentStance, StatusMeta> = {
    ALLOWED: { label: "Allowed", tone: "success" },
    REQUIRES_APPROVAL: { label: "Needs owner approval", tone: "warning" },
    NOT_ALLOWED: { label: "Not allowed", tone: "danger" },
    PROHIBITED: { label: "Prohibited", tone: "danger" },
};

export const GATE_META: Record<GateVerdict["state"], StatusMeta> = {
    NOT_COVERED: { label: "No card covers it", tone: "neutral" },
    OK: { label: "Above the floor", tone: "success" },
    BELOW_FLOOR: { label: "Below the floor", tone: "danger" },
    AWAITING_APPROVAL: { label: "Price approval pending", tone: "warning" },
    APPROVED_BELOW_FLOOR: { label: "Below floor, approved", tone: "success" },
};

/* ------------------------------------------------------------------ */
/* Helpers — pure, so the screens can be reasoned about without a DOM  */
/* ------------------------------------------------------------------ */

/**
 * How far under the floor the asking rate is, as a decimal string, or null
 * when it is not under it. Counted in paise rather than subtracted as floats.
 */
export function floorGap(verdict: GateVerdict): string | null {
    if (verdict.state !== "BELOW_FLOOR") return null;
    const gap = toPaise(verdict.floor) - toPaise(verdict.rate);
    return gap > BigInt(0) ? fromPaise(gap) : null;
}

/** One sentence on the price, for the column and the case. */
export function gateSentence(verdict: GateVerdict): string {
    switch (verdict.state) {
        case "NOT_COVERED":
            return "No approved rate card prices this kind of spot here, so the gate passes.";
        case "OK":
            return `Floor ${formatMoney(verdict.floor)} a day on a card rate of ${formatMoney(verdict.cardRate)}.`;
        case "BELOW_FLOOR": {
            const gap = floorGap(verdict);
            return `${gap ? `${formatMoney(gap)} under` : "Under"} the floor of ${formatMoney(verdict.floor)} a day. It cannot publish until a price approval is granted or the rate is raised.`;
        }
        case "AWAITING_APPROVAL":
            return "Priced under the floor and waiting on a price approval. It can publish as soon as that comes through.";
        case "APPROVED_BELOW_FLOOR":
            return "Priced under the floor, and a person has already signed that off.";
    }
}

/** "2 of 3 verified", "1 rejected", "No documents". */
export function documentsLabel(summary: DocumentSummary): string {
    if (summary.total === 0) return "No documents";
    const parts = [`${summary.verified} of ${summary.total} verified`];
    if (summary.rejected > 0) parts.push(`${summary.rejected} rejected`);
    return parts.join(" · ");
}

/** "12m", "3h", "2d" since the ISO stamp; "—" when there is no stamp. */
export function ageLabel(iso: string | null, now: number): string {
    if (!iso) return "—";
    const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}

/** "20 × 10 ft · 200 sq ft", or null when the spot was never measured. */
export function sizeLabel(row: Pick<ReviewQueueRow, "widthFt" | "heightFt" | "areaSqFt">): string | null {
    if (!row.widthFt || !row.heightFt) return null;
    const dims = `${trimDecimal(row.widthFt)} × ${trimDecimal(row.heightFt)} ft`;
    return row.areaSqFt ? `${dims} · ${trimDecimal(row.areaSqFt)} sq ft` : dims;
}

/** "20.00" → "20", "6.50" → "6.5". Display only — measurements, never money. */
function trimDecimal(value: string): string {
    return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/**
 * What stands between this listing and the marketplace.
 *
 * `hard` is what the server will refuse — the rate-card gate answers 409 on
 * publish — so the button is disabled rather than letting the click fail.
 * `soft` is what a reviewer should see before approving anyway: paperwork
 * still unchecked, nothing to look at. The desk decides; the screen informs.
 */
export function approvalBlockers(row: Pick<ReviewQueueRow, "gate" | "documentSummary" | "photoCount">): {
    hard: string[];
    soft: string[];
} {
    const hard: string[] = [];
    const soft: string[] = [];

    if (row.gate.state === "BELOW_FLOOR") {
        hard.push("The asking rate is below the rate-card floor and has no price approval.");
    }
    if (row.gate.state === "AWAITING_APPROVAL") {
        hard.push("A price approval for this rate is still pending.");
    }
    if (row.documentSummary.pending > 0) {
        soft.push(
            `${row.documentSummary.pending} ${row.documentSummary.pending === 1 ? "document has" : "documents have"} not been checked.`
        );
    }
    if (row.documentSummary.rejected > 0) {
        soft.push(
            `${row.documentSummary.rejected} ${row.documentSummary.rejected === 1 ? "document was" : "documents were"} rejected and not replaced.`
        );
    }
    if (row.documentSummary.total === 0) soft.push("No documents were filed with this listing.");
    if (row.photoCount === 0) soft.push("No photographs were filed with this listing.");

    return { hard, soft };
}

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

export const listingReviewService = {
    /** Whether the desk has anything to read from. */
    live: (): boolean => isLive("supply"),

    /** Everything at PENDING_REVIEW, oldest wait first. */
    /** The desk's page. The queue is bounded now — every row costs a
     *  rate-card gate check server-side — so it arrives as
     *  `{ items, total, page, pageSize }` and the caller says how much it
     *  wants. The desk works oldest-first, which is the server's default. */
    queue: (page = 1, pageSize = 50) =>
        http
            .get<{ items: ReviewQueueRow[]; total: number }>(
                `/listings/review?page=${page}&pageSize=${pageSize}`
            )
            .then((result) => result.items ?? []),

    caseFor: (listingId: string) => http.get<ReviewCase>(`/listings/${listingId}/review`),

    /**
     * Approve: the listing goes live. The backend answers 409
     * `BELOW_RATE_CARD_FLOOR` when the gate says no, which the screen has
     * already shown the reviewer as a disabled button and a sentence.
     */
    approve: (listingId: string) =>
        http.post<{ id: string; status: ListingLifecycleStatus }>(`/listings/${listingId}/publish`),

    /** Send back with a reason the publisher is shown verbatim. */
    sendBack: (listingId: string, body: { reason: string; outcome: SendBackOutcome }) =>
        http.post<{ id: string; status: ListingLifecycleStatus; rejectionReason: string | null }>(
            `/listings/${listingId}/send-back`,
            body
        ),

    /**
     * One document's desk check. The endpoint is the supply module's and the
     * console already had the call; the review case is the first screen to
     * use it.
     */
    reviewDocument: (documentId: string, approve: boolean, rejectionReason?: string) =>
        supplyService.reviewDocument(documentId, approve, rejectionReason),
};
