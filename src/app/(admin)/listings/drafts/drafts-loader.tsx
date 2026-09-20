"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { listingsService, type ListingDraftsPage } from "@/services/listings";
import { DraftsView, type IdleChip } from "./drafts-view";

/**
 * QR-8: the listing drafts as one read — every publisher's half-written
 * spot, oldest untouched first, narrowed on the server by the idle chip and
 * the search. Both are part of the read's key, so a change is a fresh page.
 */
export function DraftsLoader() {
    const [idle, setIdle] = React.useState<IdleChip>(0);
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim(), 350);

    const resource = useApiResource<ListingDraftsPage>(`listings:drafts:${idle}:${settledQ}`, () =>
        listingsService.drafts({ idleDays: idle, ...(settledQ ? { q: settledQ } : {}), sort: "IDLE", pageSize: 100 }),
    );

    return (
        <ResourceBoundary resource={resource}>
            {(page) => <DraftsView page={page} idle={idle} onIdleChange={setIdle} q={q} onQueryChange={setQ} />}
        </ResourceBoundary>
    );
}
