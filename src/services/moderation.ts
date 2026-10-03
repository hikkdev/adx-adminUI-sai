import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { DesignQuote } from "@/services/campaigns";
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

/**
 * The status row's "All" — the creatives in every status. `counts` also carries
 * the kind row's numbers (flagged, static, video, resubmitted, analysed,
 * unanalysed, everyKind); only the statuses are summed.
 */
export function allStatusesCount(counts: Readonly<Record<string, number>>): number {
    return CREATIVE_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

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

/* ── CR-1: the brief and the print state ─────────────────────────────── */

/** The three looks the booking step offers when ADX designs it. */
export type DesignStyle = "BOLD_AND_ENERGETIC" | "CLEAN_AND_MINIMAL" | "WARM_AND_FRIENDLY";

export const DESIGN_STYLE_LABEL: Record<DesignStyle, string> = {
    BOLD_AND_ENERGETIC: "Bold and energetic",
    CLEAN_AND_MINIMAL: "Clean and minimal",
    WARM_AND_FRIENDLY: "Warm and friendly",
};

/** What the advertiser wrote when choosing ADX Design Agency — `briefConfig` on the backend. */
export interface DesignBrief {
    objective: string;
    keyMessage: string;
    style: DesignStyle;
}

/**
 * The brief off a row's campaign, or null when there is none or it is not
 * one. `creativeConfig` is a JSON column that holds a different shape per
 * path, so it is read defensively rather than trusted.
 */
export function briefOf(row: Pick<CreativeReviewRow, "campaign">): DesignBrief | null {
    if (row.campaign.creativePath !== "ADX_DESIGN_AGENCY") return null;
    const config = row.campaign.creativeConfig;
    if (!config || typeof config !== "object") return null;
    const candidate = config as Partial<Record<keyof DesignBrief, unknown>>;
    if (typeof candidate.objective !== "string" || typeof candidate.keyMessage !== "string") return null;
    const style = candidate.style;
    if (style !== "BOLD_AND_ENERGETIC" && style !== "CLEAN_AND_MINIMAL" && style !== "WARM_AND_FRIENDLY") return null;
    return { objective: candidate.objective, keyMessage: candidate.keyMessage, style };
}

/** A request is overdue once the campaign's start has passed with nothing delivered. */
export function designDueLabel(row: Pick<CreativeReviewRow, "campaign">, now: Date = new Date()): { label: string; overdue: boolean } {
    const start = row.campaign.startDate ? new Date(row.campaign.startDate) : null;
    if (!start) return { label: "No flight date yet", overdue: false };
    const days = Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
    if (days < 0) return { label: `Flight started ${-days} day${days === -1 ? "" : "s"} ago`, overdue: true };
    if (days === 0) return { label: "Flight starts today", overdue: true };
    return { label: `Due in ${days} day${days === 1 ? "" : "s"}`, overdue: false };
}

/**
 * CR-1: a design ADX owes — `GET /campaigns/design-requests`.
 *
 * Not a creative row: choosing ADX Design Agency sets the campaign's path and
 * writes nothing else, and a creative row exists only once something is
 * uploaded. So the request is the campaign, with its spots (what formats to
 * design for), its brief, and the last delivery if one was sent back.
 */
export interface DesignRequestRow {
    campaign: {
        id: string;
        reference: string;
        name: string;
        status: string;
        startDate: string | null;
        endDate: string | null;
        creativeConfig: unknown;
        advertiser: { id: string; name: string; companyName: string | null };
        /** DQ-1: the quote as it stands — null until the desk names a price. Absent on a backend older than DQ-1. */
        designQuote?: DesignQuote | null;
    };
    spots: {
        id: string;
        listing: { id: string; title: string; city: string | null; widthFt: string | null; heightFt: string | null; category: string };
    }[];
    /** When the ask became current: the campaign's submission, or the last time a design was sent back. */
    owedSince: string;
    /** The last ADX design, if one was ever delivered — present means it was sent back. */
    lastDelivery: {
        id: string;
        status: CreativeStatus;
        designedByAdx: boolean;
        resubmissionOfId: string | null;
        fileUrl: string | null;
        reviewNote: string | null;
        reviewedAt: string | null;
        createdAt: string;
    } | null;
}

/** The brief off a request, read with the same care as off a review row. */
export function briefOfRequest(row: Pick<DesignRequestRow, "campaign">): DesignBrief | null {
    return briefOf({ campaign: { creativePath: "ADX_DESIGN_AGENCY", creativeConfig: row.campaign.creativeConfig } } as Pick<CreativeReviewRow, "campaign">);
}

/** A request is overdue once the campaign's start has passed with nothing delivered. */
export function requestDueLabel(row: Pick<DesignRequestRow, "campaign">, now: Date = new Date()): { label: string; overdue: boolean } {
    return designDueLabel({ campaign: { startDate: row.campaign.startDate } } as Pick<CreativeReviewRow, "campaign">, now);
}

export type PrintJobStatus = "REQUESTED" | "ACCEPTED" | "PRINTING" | "READY" | "COLLECTED" | "CANCELLED";

/**
 * Where an approved artwork stands on its way to a hoarding. Reads the spot's
 * order and job; an artwork pinned to no spot applies to the whole campaign
 * and has no single print state.
 */
export type PrintReadiness =
    | { state: "CAMPAIGN_WIDE" }
    | { state: "NOT_BOOKED" }
    | { state: "NO_JOB"; orderId: string }
    | { state: "AT_SHOP"; orderId: string; jobStatus: PrintJobStatus; partner: string };

export function printReadinessOf(row: Pick<CreativeReviewRow, "spot">): PrintReadiness {
    if (!row.spot) return { state: "CAMPAIGN_WIDE" };
    const order = row.spot.order;
    if (!order) return { state: "NOT_BOOKED" };
    if (!order.printJob) return { state: "NO_JOB", orderId: order.id };
    return { state: "AT_SHOP", orderId: order.id, jobStatus: order.printJob.status, partner: order.printJob.printPartner.name };
}

export const PRINT_READINESS_META: Record<PrintReadiness["state"], StatusMeta> = {
    CAMPAIGN_WIDE: { label: "Whole campaign", tone: "neutral" },
    NOT_BOOKED: { label: "Spot not booked", tone: "neutral" },
    NO_JOB: { label: "No print job yet", tone: "warning" },
    AT_SHOP: { label: "With a shop", tone: "info" },
};

export const PRINT_JOB_STATUS_LABEL: Record<PrintJobStatus, string> = {
    REQUESTED: "Requested",
    ACCEPTED: "Accepted",
    PRINTING: "Printing",
    READY: "Ready to collect",
    COLLECTED: "Collected",
    CANCELLED: "Cancelled",
};

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

/* ------------------------------------------------------------------ */
/* VA-1: what the vision model said                                    */
/* ------------------------------------------------------------------ */

export type AnalysisVerdict = "PASS" | "FAIL" | "UNSURE";
export type AnalysisRating = "PG" | "REGULAR" | "ADULT";

/** The flag vocabulary the model is held to; a word outside it comes back as OTHER. */
export const ANALYSIS_FLAG_LABEL: Record<string, string> = {
    TOBACCO: "Tobacco",
    ALCOHOL: "Alcohol",
    GAMBLING: "Gambling",
    ADULT_CONTENT: "Adult content",
    VIOLENCE: "Violence",
    HATE_OR_DISCRIMINATION: "Hate or discrimination",
    POLITICAL: "Political",
    RELIGIOUS_SENSITIVITY: "Religious sensitivity",
    MISLEADING_CLAIM: "Misleading claim",
    HEALTH_CLAIM: "Health claim",
    PRICE_CLAIM: "Price claim",
    MISSING_DISCLAIMER: "Disclaimer missing",
    COMPETITOR_MARK: "Competitor's mark",
    CELEBRITY_LIKENESS: "Celebrity likeness",
    CHILDREN_TARGETED: "Aimed at children",
    LOW_LEGIBILITY: "Hard to read",
    OFF_BRIEF: "Off the brief",
    OTHER: "Other",
};

export const analysisFlagLabel = (flag: string): string => ANALYSIS_FLAG_LABEL[flag] ?? flag.replace(/_/g, " ");

export const ANALYSIS_VERDICT_META: Record<AnalysisVerdict, StatusMeta> = {
    PASS: { label: "Pass", tone: "success" },
    FAIL: { label: "Fail", tone: "danger" },
    UNSURE: { label: "Unsure", tone: "warning" },
};

export const ANALYSIS_RATING_META: Record<AnalysisRating, StatusMeta> = {
    PG: { label: "PG", tone: "success" },
    REGULAR: { label: "Regular", tone: "info" },
    ADULT: { label: "Adult", tone: "danger" },
};

/**
 * One run of the vision pass, as the desk reads it. Never a decision: the
 * reviewer reads it first, the checklist and the buttons stay theirs.
 * `unique` is arithmetic over the platform's other artwork, not the model.
 */
export interface CreativeAnalysis {
    id: string;
    creativeId: string;
    provider: string;
    model: string;
    appropriate: { verdict: AnalysisVerdict; reason: string | null };
    relevant: { verdict: AnalysisVerdict; reason: string | null };
    legal: { verdict: AnalysisVerdict; reason: string | null };
    rating: AnalysisRating;
    ratingReason: string | null;
    flags: string[];
    summary: string;
    confidence: number;
    unique: boolean | null;
    nearest: { creativeId: string; distance: number } | null;
    createdAt: string;
}

/**
 * What the analysis says about the two checklist rows a model can speak to.
 *
 * Brand-safe fails when the artwork is inappropriate or illegal and passes
 * only when both are clean; legibility fails on the model's own flag. A
 * verdict of UNSURE, or a row the model has nothing to say about, is left
 * exactly as the reviewer had it — the desk decides, this only fills in.
 */
export function checksFromAnalysis(checks: CreativeCheck[], analysis: CreativeAnalysis): CreativeCheck[] {
    return checks.map((check) => {
        if (check.code === "BRAND_SAFE") {
            const worst = [analysis.appropriate.verdict, analysis.legal.verdict];
            if (worst.includes("FAIL")) return { ...check, result: "FAIL", note: analysis.appropriate.verdict === "FAIL" ? (analysis.appropriate.reason ?? undefined) : (analysis.legal.reason ?? undefined) };
            if (worst.every((verdict) => verdict === "PASS")) return { ...check, result: "PASS", note: "AI review: nothing prohibited or unsafe seen" };
            return check;
        }
        if (check.code === "TEXT_LEGIBLE" && analysis.flags.includes("LOW_LEGIBILITY")) {
            return { ...check, result: "FAIL", note: "AI review: the text is hard to read" };
        }
        return check;
    });
}

/** VA-4: what the queue's batch run did — which artworks got a reading, which the model could not be given, which it failed on. */
export interface AnalyseBatchResult {
    analysed: string[];
    skipped: { creativeId: string; reason: string }[];
    failed: { creativeId: string; reason: string }[];
}

/**
 * The reading in one glance, for a queue card: the worst of the three
 * verdicts as one badge (a FAIL anywhere is a fail; UNSURE anywhere is
 * unsure; else a pass), the rating as another, and a line naming which
 * rows fell short.
 */
export function analysisSummary(analysis: CreativeAnalysis): { verdict: StatusMeta; rating: StatusMeta; line: string } {
    const rows: [string, AnalysisVerdict][] = [
        ["appropriate", analysis.appropriate.verdict],
        ["relevant", analysis.relevant.verdict],
        ["legal", analysis.legal.verdict],
    ];
    const failing = rows.filter(([, verdict]) => verdict === "FAIL").map(([name]) => name);
    const unsure = rows.filter(([, verdict]) => verdict === "UNSURE").map(([name]) => name);
    const verdict: StatusMeta = failing.length
        ? { label: "AI: fail", tone: "danger" }
        : unsure.length
          ? { label: "AI: unsure", tone: "warning" }
          : { label: "AI: pass", tone: "success" };
    const head = failing.length ? `Fails: ${failing.join(", ")}` : unsure.length ? `Unsure: ${unsure.join(", ")}` : "Passes all three";
    const line = [head, ANALYSIS_RATING_META[analysis.rating].label, analysis.unique === false ? "near-duplicate" : null].filter(Boolean).join(" · ");
    return { verdict, rating: ANALYSIS_RATING_META[analysis.rating], line };
}

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
        /** CR-1: the flight — a design request is due by the day the campaign starts. Optional so a fixture may omit it. */
        startDate?: string | null;
        endDate?: string | null;
        /** CR-1: the path the advertiser chose and, for ADX Design Agency, the brief they wrote. */
        creativePath?: CreativePath | null;
        creativeConfig?: unknown;
        advertiser: { id: string; name: string; companyName: string | null };
    };
    spot: {
        id: string;
        listingId: string;
        listing: { id: string; title: string; city: string | null; widthFt: string | null; heightFt: string | null; category?: string };
        /** CR-1: the spot's order and the print job on it — Print-ready. Null until the spot is booked. */
        order?: {
            id: string;
            status: string;
            printJob: { id: string; status: PrintJobStatus; printPartner: { id: string; name: string } } | null;
        } | null;
    } | null;
    /** VA-1: the latest vision run — on the one-creative read and, VA-4, on every queue row. Null when nobody has asked. */
    analysis?: CreativeAnalysis | null;
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
    /** VA-4: only artworks with (true) or without (false) a reading. */
    analysed?: boolean;
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
    if (query.analysed !== undefined) params.set("analysed", String(query.analysed));
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

    /** One artwork with its campaign, spot, checks and flags — and, VA-1, its latest analysis. */
    get: (creativeId: string) => http.get<CreativeReviewRow>(`/campaigns/creatives/${creativeId}`),

    /** CR-1: the designs ADX owes, oldest flight first. */
    designRequests: async (): Promise<DesignRequestRow[]> => {
        const answer = await http.get<{ items: DesignRequestRow[] }>("/campaigns/design-requests");
        return answer.items ?? [];
    },

    /** VA-1: the desk asks the vision model. On demand; the answer is a row beside the creative, never a decision. */
    analyse: (creativeId: string) => http.post<CreativeAnalysis>(`/campaigns/creatives/${creativeId}/analyse`, {}),

    /**
     * VA-4: the batch. With ids, those artworks; without, everything awaiting
     * review that is a still image and has no reading yet, oldest first, up
     * to fifty. Each one is the same on-demand run as `analyse`.
     */
    analysePending: (creativeIds?: string[]) =>
        http.post<AnalyseBatchResult>("/campaigns/creatives/analyse", creativeIds?.length ? { creativeIds } : {}),

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
