"use client";

import * as React from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    REVIEW_STATUS_META,
    hideReasonProblem,
    reviewAnchor,
    reviewsReadApi,
    reviewsService,
    type Review,
    type ReviewSubjectType,
    type ReviewsPage,
} from "@/services/reviews";

interface ReviewsCardProps {
    subjectType: ReviewSubjectType;
    subjectId: string;
    /** The denormalised stars the subject row carries, when it does. */
    ratingAvg?: string | null;
    reviewCount?: number;
    className?: string;
    /** Re-read the page after a hide or unhide changes the subject's stars. */
    onChanged?: () => void;
}

/** Five stars, the filled ones counted from the rating. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
    return (
        <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    className={cn("size-3.5", star <= rating ? "fill-warning text-warning" : "text-border")}
                    aria-hidden
                />
            ))}
        </span>
    );
}

/**
 * The Reviews card on a listing or an agent page (Lot D).
 *
 * Every status is drawn — a hidden review stays on record with why — and
 * Hide asks for a reason before the API would. The stars in the header are
 * the subject row's own denormalised columns, recomputed by the server from
 * PUBLISHED rows on every write.
 */
export function ReviewsCard({ subjectType, subjectId, ratingAvg, reviewCount, className, onChanged }: ReviewsCardProps) {
    const live = reviewsReadApi();
    const resource = useApiResource<ReviewsPage>(`reviews:${subjectType}:${subjectId}:${live}`, () =>
        live
            ? reviewsService.list({ subjectType, subjectId, pageSize: 50 })
            : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50, counts: {} }),
    );
    const [hiding, setHiding] = React.useState<Review | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);

    const unhide = async (review: Review) => {
        setBusy(review.id);
        try {
            await reviewsService.unhide(review.id);
            toast.success("Review shown again", { description: "It is back in the average." });
            resource.reload();
            onChanged?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not unhide it");
        } finally {
            setBusy(null);
        }
    };

    const who = subjectType === "LISTING" ? "advertisers who booked this spot" : "publishers whose spots this agent installed";

    return (
        <Card className={cn("rounded-lg border-border p-5 shadow-none", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Reviews</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">From {who}. Each one hangs off a real booking.</p>
                </div>
                {ratingAvg ? (
                    <div className="text-right">
                        <p className="flex items-center justify-end gap-1.5 text-lg font-semibold text-foreground">
                            <Star className="size-4 fill-warning text-warning" aria-hidden />
                            {ratingAvg}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {reviewCount ?? 0} published review{reviewCount === 1 ? "" : "s"}
                        </p>
                    </div>
                ) : reviewCount ? (
                    <p className="text-xs text-muted-foreground">
                        {reviewCount} published review{reviewCount === 1 ? "" : "s"}
                    </p>
                ) : (
                    <StatusBadge status={{ label: "Not rated yet", tone: "neutral" }} />
                )}
            </div>

            {!live ? (
                <p className="mt-4 text-sm text-muted-foreground">Reviews read the API. Connect the console to the ADX backend to see them.</p>
            ) : (
                <div className="mt-4">
                    <ResourceBoundary resource={resource}>
                        {(page) =>
                            page.items.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nobody has written a review yet.</p>
                            ) : (
                                <ul className="divide-y">
                                    {page.items.map((review) => {
                                        const anchor = reviewAnchor(review);
                                        return (
                                            <li key={review.id} className="flex items-start gap-3 py-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Stars rating={review.rating} />
                                                        <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                                                        {review.status === "HIDDEN" && <StatusBadge status={REVIEW_STATUS_META.HIDDEN} />}
                                                    </div>
                                                    <p className={cn("mt-1 text-sm", review.status === "HIDDEN" ? "text-muted-foreground line-through" : "text-foreground")}>
                                                        {review.note ?? <span className="italic text-muted-foreground">No note — just the stars.</span>}
                                                    </p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {anchor.href ? (
                                                            <Link href={anchor.href} className="underline-offset-4 hover:underline">
                                                                {anchor.label}
                                                            </Link>
                                                        ) : (
                                                            anchor.label
                                                        )}
                                                        {review.status === "HIDDEN" && review.hiddenReason ? ` · hidden: ${review.hiddenReason}` : ""}
                                                    </p>
                                                </div>
                                                {review.status === "PUBLISHED" ? (
                                                    <Button size="sm" variant="ghost" className="h-7 shrink-0" disabled={busy !== null} onClick={() => setHiding(review)}>
                                                        Hide
                                                    </Button>
                                                ) : (
                                                    <Button size="sm" variant="ghost" className="h-7 shrink-0" disabled={busy !== null} onClick={() => unhide(review)}>
                                                        Unhide
                                                    </Button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )
                        }
                    </ResourceBoundary>
                </div>
            )}

            <HideDialog
                review={hiding}
                onOpenChange={(open) => !open && setHiding(null)}
                onDone={() => {
                    setHiding(null);
                    resource.reload();
                    onChanged?.();
                }}
            />
        </Card>
    );
}

function HideDialog({ review, onOpenChange, onDone }: { review: Review | null; onOpenChange: (open: boolean) => void; onDone: () => void }) {
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const problem = hideReasonProblem(reason);

    const submit = async () => {
        if (!review || problem) return;
        setBusy(true);
        try {
            await reviewsService.hide(review.id, reason.trim());
            toast.success("Review hidden", { description: "It leaves the average at once. The row stays on record." });
            setReason("");
            onDone();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not hide it");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={review !== null}
            onOpenChange={(open) => {
                if (!open && !busy) {
                    setReason("");
                    onOpenChange(false);
                }
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Hide this review?</DialogTitle>
                    <DialogDescription>
                        It comes off the public page and out of the average at once. The row stays as the record of what was said and
                        why it was taken down; it can be shown again later.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                    <Label htmlFor="hide-reason">Reason</Label>
                    <Textarea
                        id="hide-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Why it is being hidden — recorded on the review and in the audit trail"
                        className="min-h-20 resize-none"
                        maxLength={500}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={submit} disabled={busy || problem !== null}>
                        Hide review
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
