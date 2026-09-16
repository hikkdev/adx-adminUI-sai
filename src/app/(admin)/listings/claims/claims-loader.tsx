"use client";

import * as React from "react";
import { useCursorPages } from "@/lib/use-cursor-pages";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { supplyService, type ListingClaim, type ListingClaimStatus } from "@/services/supply";
import { ClaimsView } from "./claims-view";

/**
 * The claims as a cursor read that grows behind "Load more", narrowed on
 * the server by `?status=` — the chip is part of the read's key, so a
 * change of chip is a fresh first page and the follow-on pages go with it.
 */
export function ClaimsLoader() {
    const [status, setStatus] = React.useState<ListingClaimStatus | null>("PENDING");
    const pages = useCursorPages<ListingClaim>(`supply:claims:${status ?? "all"}`, (cursor) => supplyService.claims(status, cursor));

    return (
        <ResourceBoundary resource={pages.resource}>
            {() => (
                <ClaimsView
                    claims={pages.rows}
                    status={status}
                    onStatusChange={setStatus}
                    hasMore={pages.hasMore}
                    loadingMore={pages.loadingMore}
                    moreError={pages.moreError}
                    onLoadMore={pages.loadMore}
                    onChanged={pages.reload}
                />
            )}
        </ResourceBoundary>
    );
}
