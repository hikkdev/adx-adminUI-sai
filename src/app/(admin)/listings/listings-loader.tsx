"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import {
    listingsService,
    type AdminListingsPage,
    type ListingLifecycle,
} from "@/services/listings";
import { ListingsTable } from "./listings-table";
import { ListingsOffline } from "./listings-offline";

/**
 * The listings table's data.
 *
 * Server shell + client loader, because `api-client` keeps its token in
 * localStorage and cannot run on the server.
 *
 * The status facet goes to the API rather than being applied here: the chip
 * counts come back with the page and are computed over the whole filter
 * *without* the chip in force, which is not something a client holding one
 * page could work out for itself.
 *
 * No fixture fallback. The previous version drew seeded listings whose ids the
 * backend has never heard of, so following a row opened a record that did not
 * exist — the exact crossing `liveDomains` exists to prevent.
 */

/** One page. Generous, and the table says so when there is more behind it. */
const PAGE_SIZE = 100;

export function ListingsLoader() {
    const live = isLive("listings");
    const [status, setStatus] = React.useState<ListingLifecycle | "ALL">("PENDING_REVIEW");

    const resource = useApiResource<AdminListingsPage>(
        `listings:list:${status}:${live}`,
        () =>
            listingsService.list({
                ...(status === "ALL" ? {} : { status: [status] }),
                sort: "SUBMITTED",
                pageSize: PAGE_SIZE,
            }),
    );

    if (!live) return <ListingsOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <ListingsTable
                    page={page}
                    status={status}
                    onStatusChange={setStatus}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
