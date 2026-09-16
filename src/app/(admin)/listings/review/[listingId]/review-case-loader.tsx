"use client";

import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    listingReviewService,
    type ReviewCase,
    type ReviewQueueRow,
} from "@/services/listing-review";
import { DeskOffline } from "../desk-offline";
import { ReviewCaseView } from "./review-case";

interface Loaded {
    /** Null when the id is not a listing — rendered as its own not-found. */
    theCase: ReviewCase | null;
    /** The rest of the desk, for the queue rail on the right. */
    queue: ReviewQueueRow[];
}

export function ReviewCaseLoader({ listingId }: { listingId: string }) {
    const live = listingReviewService.live();
    const resource = useApiResource<Loaded>(`listing-review:case:${listingId}:${live}`, async () => {
        if (!live) return { theCase: null, queue: [] };
        const [theCase, queue] = await Promise.all([
            listingReviewService.caseFor(listingId).catch((cause: unknown) => {
                // A 404 is an answer, not a failure: the id is not a listing.
                if (cause instanceof ApiError && cause.status === 404) return null;
                throw cause;
            }),
            listingReviewService.queue(),
        ]);
        return { theCase, queue };
    });

    if (!live) return <DeskOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {({ theCase, queue }) =>
                theCase ? (
                    <ReviewCaseView theCase={theCase} queue={queue} onChanged={resource.reload} />
                ) : (
                    <EmptyState
                        icon={FileQuestion}
                        title="No such listing"
                        description="Nothing on the API answers to this id. It may have been deleted, or the link is stale."
                        action={
                            <Button size="sm" variant="outline" asChild>
                                <Link href="/listings/review">Back to the queue</Link>
                            </Button>
                        }
                    />
                )
            }
        </ResourceBoundary>
    );
}
