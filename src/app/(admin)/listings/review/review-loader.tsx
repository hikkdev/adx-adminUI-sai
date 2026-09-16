"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { listingReviewService, type ReviewQueueRow } from "@/services/listing-review";
import { DeskOffline } from "./desk-offline";
import { ReviewQueue } from "./review-queue";

export function ReviewLoader() {
    const live = listingReviewService.live();
    const resource = useApiResource<ReviewQueueRow[]>(`listing-review:queue:${live}`, () =>
        live ? listingReviewService.queue() : Promise.resolve([])
    );

    if (!live) return <DeskOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(rows) => <ReviewQueue rows={rows} />}
        </ResourceBoundary>
    );
}
