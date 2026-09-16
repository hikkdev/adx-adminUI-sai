"use client";

import { useCursorPages } from "@/lib/use-cursor-pages";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { supplyService } from "@/services/supply";
import type { ListingAttempt } from "@/types";
import { AttemptsTable } from "./attempts-table";

/** One cursor page at a time, the next behind "Load more" (Q-C item 6). */
export function AttemptsLoader() {
    const pages = useCursorPages<ListingAttempt>("supply:attempts", (cursor) => supplyService.attempts(cursor));

    return (
        <ResourceBoundary resource={pages.resource}>
            {() => (
                <AttemptsTable
                    attempts={pages.rows}
                    hasMore={pages.hasMore}
                    loadingMore={pages.loadingMore}
                    moreError={pages.moreError}
                    onLoadMore={pages.loadMore}
                />
            )}
        </ResourceBoundary>
    );
}
