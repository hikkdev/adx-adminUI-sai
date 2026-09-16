import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * Creative moderation — DR 10's Content Review queue (`5102:38568`) and the
 * Creative Review workbench (`5102:39019`), live over Lot D's routes.
 *
 * Every artwork an advertiser uploads goes through ops before it prints or
 * goes live. The upload lands IN_REVIEW with two computed checks stored on the
 * row — do the pixels fit the hoarding (`DIMENSIONS_MATCH`), will the venue
 * take this content (`VENUE_STANCE`) — and a set of flags the reviewer reads
 * before deciding. Ops alone approve; the advertiser is told either way.
 *
 * No fixture fallback. The eight seeded `cr_*` creatives are gone rather than
 * kept: their ids were never issued by the backend, their "flags" were prose
 * nobody computed, and the Approve button under them changed a toast. A
 * decision here notifies a real advertiser, so the screen reads the API or
 * says it cannot.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type CreativeStatus =
    | "PENDING_UPLOAD"
    | "UPLOADED"
    | "IN_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "CHANGES_REQUESTED"
    | "AWAITING_ADVERTISER";

/** The chips on the queue, in the order the desk works them. */
export const CREATIVE_STATUSES: readonly CreativeStatus[] = [
    "IN_REVIEW",
    "AWAITING_ADVERTISER",
    "CHANGES_REQUESTED",
    "REJECTED",
    "APPROVED",
    "UPLOADED",
    "PENDING_UPLOAD",
];

export const CREATIVE_STATUS_META: Record<CreativeStatus, StatusMeta> = {
    PENDING_UPLOAD: { label: "Nothing uploaded", tone: "neutral" },
    UPLOADED: { label: "Uploaded", tone: "neutral" },
    IN_REVIEW: { label: "Awaiting review", tone: "warning" },
    APPROVED: { label: "Approved", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
    /** ADX designed it; the advertiser has not yet tap-accepted. */
    AWAITING_ADVERTISER: { label: "Awaiting advertiser", tone: "info" },
};

export type CreativePath = "STATIC_IMAGES" | "VIDEO_OR_MOTION" | "DYNAMIC_HTML5" | "ADX_DESIGN_AGENCY";

export const CREATIVE_PATH_LABEL: Record<CreativePath, string> = {
    STATIC_IMAGES: "Static",
    VIDEO_OR_MOTION: "Video",
    DYNAMIC_HTML5: "Dynamic HTML5",
    ADX_DESIGN_AGENCY: "ADX designed",
};

export type CreativeDecision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

export type CreativeCheckCode = "DIMENSIONS_MATCH" | "VENUE_STANCE" | "QR_PRESENT" | "TEXT_LEGIBLE" | "BRAND_SAFE";
export type CreativeCheckResult = "PASS" | "FAIL" | "UNKNOWN";

export interface CreativeCheck {
    code: CreativeCheckCode;
    result: CreativeCheckResult;
    note?: string;
}

/** The checklist rows, in the order the workbench draws them. */
export const CREATIVE_CHECK_META: Record<CreativeCheckCode, { name: string; detail: string; computed: boolean }> = {
    DIMENSIONS_MATCH: {
        name: "Dimensions match placement",
        detail: "The upload's shape against the booked spot's stated size, 5% tolerance",
        computed: true,
    },
    VENUE_STANCE: {
        name: "Venue accepts this content",
        detail: "The campaign's content category against every booked spot's rules",
        computed: true,
    },
    QR_PRESENT: { name: "QR code present", detail: "The tracking code is visible in the artwork", computed: false },
    TEXT_LEGIBLE: { name: "Legible at viewing distance", detail: "Text height against the placement", computed: false },
    BRAND_SAFE: { name: "Brand-safe imagery", detail: "No prohibited or unsafe content", computed: false },
};

export const CREATIVE_CHECK_CODES: readonly CreativeCheckCode[] = [
    "DIMENSIONS_MATCH",
    "VENUE_STANCE",
    "QR_PRESENT",
    "TEXT_LEGIBLE",
    "BRAND_SAFE",
];

export const CHECK_RESULT_META: Record<CreativeCheckResult, StatusMeta> = {
    PASS: { label: "Pass", tone: "success" },
    FAIL: { label: "Fail", tone: "danger" },
    UNKNOWN: { label: "Not judged", tone: "neutral" },
};

export type CreativeFlag = "VENUE_REQUIRES_APPROVAL" | "QR_MISSING" | "CONTENT_CATEGORY_MISSING";

export const CREATIVE_FLAG_LABEL: Record<CreativeFlag, string> = {
    VENUE_REQUIRES_APPROVAL: "Venue needs the publisher's approval",
    QR_MISSING: "QR-tracked, but no code named",
    CONTENT_CATEGORY_MISSING: "No content category on the campaign",
};

/** The flag's words, or the flag itself for one this map has not heard of. */
export const flagLabel = (flag: string): string => CREATIVE_FLAG_LABEL[flag as CreativeFlag] ?? flag.replace(/_/g, " ");

/* ------------------------------------------------------------------ */
/* Wire shapes                                                         */
/* ------------------------------------------------------------------ */

/** A creative as the desk reads it — the row with the little it needs of its campaign and spot. */
export interface CreativeReviewRow {
    id: string;
    campaignId: string;
    spotId: string | null;
    path: CreativePath;
    status: CreativeStatus;
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    widthPx: number | null;
    heightPx: number | null;
    durationMs: number | null;
    reviewNote: string | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    submittedAt: string | null;
    flags: string[];
    checks: CreativeCheck[] | null;
    /** A re-upload after a refusal points at the row it replaces. */
    resubmissionOfId: string | null;
    designedByAdx: boolean;
    advertiserAcceptedAt: string | null;
    advertiserAcceptedById: string | null;
    trackingCodeId: string | null;
    createdAt: string;
    updatedAt: string;
    campaign: {
        id: string;
        reference: string;
        name: string;
        status: string;
        advertiserId: string;
        agentId: string | null;
        createdByUserId: string;
        trackingMethod: string;
        contentCategoryId: string | null;
        advertiser: { id: string; name: string; companyName: string | null };
    };
    spot: {
        id: string;
        listingId: string;
        listing: { id: string; title: string; city: string | null; widthFt: string | null; heightFt: string | null };
    } | null;
}

/** The list contract: `{ items, total, page, pageSize, counts }`. */
export interface ReviewQueuePage {
    items: CreativeReviewRow[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed. */
    counts: Record<string, number>;
}

export interface ReviewQueueQuery {
    status?: CreativeStatus[];
    kind?: CreativePath;
    flagged?: boolean;
    resubmitted?: boolean;
    q?: string;
    sort?: "OLDEST" | "NEWEST";
    page?: number;
    pageSize?: number;
}

export interface CreativeReviewInput {
    decision: CreativeDecision;
    note?: string;
    checks?: CreativeCheck[];
}

export interface BulkReviewResult {
    reviewed: string[];
    failed: { creativeId: string; reason: string }[];
}

/* ------------------------------------------------------------------ */
/* Pure helpers — the screens read through these, and they are tested */
/* ------------------------------------------------------------------ */

/** These screens read the API or say they cannot; there is no seeded artwork. */
export const moderationReadsApi = (): boolean => apiConfig.live;

/** "840 KB", "9.4 MB", or nothing when the upload carried no size. */
export function fileSizeLabel(bytes: number | null): string | null {
    if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
    const KB = 1024;
    if (bytes < KB * KB) return `${Math.max(1, Math.round(bytes / KB))} KB`;
    return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

/** "Hoarding 40×20 ft · 1920×960 px" — the placement, from the spot and the upload. */
export function placementLabel(row: Pick<CreativeReviewRow, "spot" | "widthPx" | "heightPx">): string {
    const parts: string[] = [];
    if (row.spot) {
        const { widthFt, heightFt } = row.spot.listing;
        parts.push(
            widthFt && heightFt
                ? `${trimDecimal(widthFt)}×${trimDecimal(heightFt)} ft`
                : "Spot size not stated",
        );
    } else {
        parts.push("Campaign-level");
    }
    if (row.widthPx && row.heightPx) parts.push(`${row.widthPx}×${row.heightPx} px`);
    return parts.join(" · ");
}

const trimDecimal = (value: string): string => value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");

/** Video or motion is anything on that path, or a file whose type says so. */
export const isVideo = (row: Pick<CreativeReviewRow, "path" | "mimeType">): boolean =>
    row.path === "VIDEO_OR_MOTION" || Boolean(row.mimeType?.startsWith("video/"));

/**
 * A decision other than approval has to say why — the schema refuses it
 * otherwise, so the screen refuses it first, with the same words.
 */
export function noteRequired(decision: CreativeDecision, note: string): string | null {
    if (decision === "APPROVED") return null;
    return note.trim().length > 0 ? null : "Say what is wrong: a note is required unless the artwork is approved";
}

/**
 * The checklist as the workbench draws it: the computed rows the server
 * stored, then the manual rows it did not, each UNKNOWN until the reviewer
 * says otherwise. Stored results win over the defaults; the order is fixed.
 */
export function checklistOf(stored: CreativeCheck[] | null | undefined): CreativeCheck[] {
    const byCode = new Map((stored ?? []).map((check) => [check.code, check]));
    return CREATIVE_CHECK_CODES.map((code) => byCode.get(code) ?? { code, result: "UNKNOWN" });
}

/**
 * The rail beside the workbench — the next six in the queue after this one,
 * or the first six when this artwork is no longer in it.
 */
export function queueRail(items: CreativeReviewRow[], currentId: string, size = 6): CreativeReviewRow[] {
    const index = items.findIndex((item) => item.id === currentId);
    const after = index === -1 ? items : items.slice(index + 1);
    return after.filter((item) => item.id !== currentId).slice(0, size);
}

/** The `?a=b` for the queue, skipping what is unset. */
export function reviewQueueQuery(query: ReviewQueueQuery): string {
    const params = new URLSearchParams();
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.kind) params.set("kind", query.kind);
    if (query.flagged !== undefined) params.set("flagged", String(query.flagged));
    if (query.resubmitted !== undefined) params.set("resubmitted", String(query.resubmitted));
    if (query.q) params.set("q", query.q);
    if (query.sort) params.set("sort", query.sort);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const moderationService = {
    /** The desk, on the list contract with status counts. Oldest submission first by default. */
    queue: (query: ReviewQueueQuery = {}) =>
        http.get<ReviewQueuePage>(`/campaigns/creatives/review-queue${reviewQueueQuery(query)}`),

    /** One artwork with its campaign, spot, checks and flags. */
    get: (creativeId: string) => http.get<CreativeReviewRow>(`/campaigns/creatives/${creativeId}`),

    /** One decision. A note is required unless approved; the reviewer's checks replace the computed ones. */
    review: (campaignId: string, creativeId: string, input: CreativeReviewInput) =>
        http.patch<CreativeReviewRow>(`/campaigns/${campaignId}/creatives/${creativeId}/review`, input),

    /** The same decision across up to fifty; each is its own audit row and notification. */
    reviewMany: (creativeIds: string[], decision: CreativeDecision, note?: string) =>
        http.post<BulkReviewResult>("/campaigns/creatives/review", {
            creativeIds,
            decision,
            ...(note ? { note } : {}),
        }),

    /**
     * ADX-designed artwork, uploaded by ops on the campaign page. Lands
     * AWAITING_ADVERTISER; the advertiser tap-accepts before ops review.
     */
    uploadDesigned: (
        campaignId: string,
        input: {
            fileUrl: string;
            fileName?: string;
            fileSize?: number;
            mimeType?: string;
            spotId?: string | null;
            widthPx?: number;
            heightPx?: number;
        },
    ) => http.post<CreativeReviewRow>(`/campaigns/${campaignId}/creatives`, { ...input, designedByAdx: true }),
};
