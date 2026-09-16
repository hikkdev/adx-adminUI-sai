import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * Reviews — what people say about a spot or an agent (Lot D, Q5/Q19/Q104/Q112/Q137).
 *
 * One table, one rule: every review hangs off the transaction that earned the
 * right to write it. An advertiser reviews a spot through the campaign spot
 * that ran on it; a publisher rates an agent through the order that agent
 * installed. "24 reviews" is a claim about 24 bookings.
 *
 * The desk hides, never deletes: the row stays as the record of what was said
 * and why it was taken down, and the stars are recomputed from PUBLISHED rows
 * on every write. No fixtures — a seeded review would be a claim about a
 * booking nobody made.
 */

export type ReviewSubjectType = "LISTING" | "AGENT";
export type ReviewAnchorKind = "ORDER" | "CAMPAIGN_SPOT";
export type ReviewStatus = "PUBLISHED" | "HIDDEN";

export const REVIEW_STATUS_META: Record<ReviewStatus, StatusMeta> = {
    PUBLISHED: { label: "Published", tone: "success" },
    HIDDEN: { label: "Hidden", tone: "neutral" },
};

/** A review as `GET /reviews` sends it. */
export interface Review {
    id: string;
    subjectType: ReviewSubjectType;
    subjectId: string;
    authorUserId: string;
    authorPublisherId: string | null;
    authorAdvertiserId: string | null;
    anchorKind: ReviewAnchorKind;
    anchorId: string;
    /** One to five, whole stars. */
    rating: number;
    note: string | null;
    status: ReviewStatus;
    hiddenReason: string | null;
    hiddenById: string | null;
    createdAt: string;
}

/** The list contract: `{ items, total, page, pageSize, counts }`. */
export interface ReviewsPage {
    items: Review[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export interface ReviewsQuery {
    subjectType?: ReviewSubjectType;
    subjectId?: string;
    status?: ReviewStatus[];
    q?: string;
    sort?: "NEWEST" | "OLDEST";
    page?: number;
    pageSize?: number;
}

/** The party the review is about, and where it links. */
export function reviewAnchor(review: Pick<Review, "anchorKind" | "anchorId">): { label: string; href: string | null } {
    if (review.anchorKind === "ORDER") return { label: `Order ${review.anchorId.slice(-6).toUpperCase()}`, href: `/orders/${review.anchorId}` };
    return { label: `Campaign spot ${review.anchorId.slice(-6).toUpperCase()}`, href: null };
}

/** Hiding needs a reason — five characters is the floor below which nothing is a sentence. */
export const hideReasonProblem = (reason: string): string | null =>
    reason.trim().length >= 5 ? null : "Say why this review is being hidden.";

/** The `?a=b` for the desk, skipping what is unset. */
export function reviewsQuery(query: ReviewsQuery): string {
    const params = new URLSearchParams();
    if (query.subjectType) params.set("subjectType", query.subjectType);
    if (query.subjectId) params.set("subjectId", query.subjectId);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.q) params.set("q", query.q);
    if (query.sort) params.set("sort", query.sort);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

/** The cards read the API or say they cannot. */
export const reviewsReadApi = (): boolean => apiConfig.live;

export const reviewsService = {
    /** The desk: every status, with the histogram counted without the status facet. */
    list: (query: ReviewsQuery = {}) => http.get<ReviewsPage>(`/reviews${reviewsQuery(query)}`),

    /** Takes it out of the average at once. ADMIN + content.approve; audited REVIEW_HIDDEN. */
    hide: (id: string, reason: string) => http.patch<Review>(`/reviews/${id}/hide`, { reason }),

    /** Puts it back. Audited REVIEW_UNHIDDEN. */
    unhide: (id: string) => http.patch<Review>(`/reviews/${id}/unhide`, {}),
};
