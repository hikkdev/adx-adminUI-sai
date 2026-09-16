"use client";

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import type { KycDocumentReview, KycRowStatus } from "@/types";
import { decisionMeta } from "./document-review";

interface DecisionHistoryProps {
    /** The record's own verdict, drawn first when there is one. */
    record: {
        status: KycRowStatus;
        reviewedAt: string | null;
        reviewedById: string | null;
        /** E7-3: the reviewer's name off the case read; the id stands in when there is none. */
        reviewedByName?: string | null;
        reviewNote: string | null;
        rejectionReason: string | null;
    };
    reviews: KycDocumentReview[];
    labelOf: (field: string) => string;
}

const RECORD_META: Record<KycRowStatus, { label: string; tone: "success" | "danger" | "info" | "warning" }> = {
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    NEEDS_INFO: { label: "Re-upload asked", tone: "info" },
    PENDING: { label: "Pending", tone: "warning" },
};

/**
 * What has been decided on this case, newest first — Lot D (Q42).
 *
 * The record's verdict, when there is one, with who made it and what they
 * said; then every decision on a tile from `documentReviews`. The record's
 * reviewer is named since E7-3 (`reviewedBy` on the case read); a tile's
 * decision is named since E10-1 (`reviewedBy { id, name }` on every
 * `documentReviews[]` row). The id stands in only for an account the
 * platform no longer has a name for.
 */
export function DecisionHistory({ record, reviews, labelOf }: DecisionHistoryProps) {
    const ordered = [...reviews].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
    const decided = record.status !== "PENDING" && record.reviewedAt;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="decision-history">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision history</h3>
            {!decided && ordered.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nothing has been decided on this case yet.</p>
            ) : (
                <ol className="mt-3 divide-y text-sm">
                    {decided && (
                        <li className="flex items-start gap-3 py-2.5">
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground">The record</p>
                                <p className="text-xs text-muted-foreground">
                                    {formatDateTime(record.reviewedAt!)}
                                    {record.reviewedById ? ` · by ${record.reviewedByName?.trim() || record.reviewedById}` : ""}
                                </p>
                                {(record.reviewNote || record.rejectionReason) && (
                                    <p className="mt-1 text-foreground">{record.reviewNote ?? record.rejectionReason}</p>
                                )}
                            </div>
                            <StatusBadge status={RECORD_META[record.status]} />
                        </li>
                    )}
                    {ordered.map((review) => (
                        <li key={review.id} className="flex items-start gap-3 py-2.5">
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground">{labelOf(review.field)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {formatDateTime(review.reviewedAt)} · by {review.reviewedBy?.name?.trim() || review.reviewedById}
                                </p>
                                {review.note && <p className="mt-1 text-foreground">{review.note}</p>}
                            </div>
                            <StatusBadge status={decisionMeta(review)!} />
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
}
