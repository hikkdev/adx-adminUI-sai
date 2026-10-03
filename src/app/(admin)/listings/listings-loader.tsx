"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import {
    LISTING_CATEGORY_KEYS,
    LISTING_LIFECYCLE,
    listingsService,
    type AdminListingsPage,
    type ListingDraftsPage,
    type ListingLifecycle,
} from "@/services/listings";
import { ListingsTable, type DirectoryStatus } from "./listings-table";
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
 * 2 Oct 2026: the status and the category live in the URL
 * (`/listings/directory?status=PENDING_REVIEW&category=OUTDOOR`), so the
 * overview's rows, the old drafts tab and a pasted link all open the table
 * already narrowed. `?status=DRAFTS` shows the listing drafts — the spots
 * publishers saved half-way on their phones — in the same table; the drafts
 * read is asked for one row otherwise, for the "Drafts · N" count.
 *
 * No fixture fallback. The previous version drew seeded listings whose ids the
 * backend has never heard of, so following a row opened a record that did not
 * exist — the exact crossing `liveDomains` exists to prevent.
 */

/** One page. Generous, and the table says so when there is more behind it. */
const PAGE_SIZE = 100;

/** `?status=` as the table reads it; anything unknown is every status. */
export function statusFromQuery(value: string | null): DirectoryStatus {
    if (!value) return "ALL";
    const upper = value.toUpperCase();
    if (upper === "DRAFTS") return "DRAFTS";
    return (LISTING_LIFECYCLE as readonly string[]).includes(upper) ? (upper as ListingLifecycle) : "ALL";
}

/** `?category=` as the API spells it; anything unknown is every category. */
export function categoryFromQuery(value: string | null): string | null {
    const upper = (value ?? "").toUpperCase();
    return (LISTING_CATEGORY_KEYS as readonly string[]).includes(upper) ? upper : null;
}

export function ListingsLoader() {
    const live = isLive("listings");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    // QR-21 (the owner, 17 Sep 2026): the page opens on every listing, the
    // review queue one choice away — a desk that opened on the queue read as
    // "one listing" to a reader who had just seeded twenty live ones.
    const status = statusFromQuery(params.get("status"));
    const category = categoryFromQuery(params.get("category"));
    const drafting = status === "DRAFTS";

    const setQuery = React.useCallback(
        (next: { status?: DirectoryStatus; category?: string | null }) => {
            const query = new URLSearchParams(params.toString());
            const nextStatus = next.status ?? status;
            const nextCategory = next.category === undefined ? category : next.category;
            if (nextStatus === "ALL") query.delete("status");
            else query.set("status", nextStatus);
            if (nextCategory) query.set("category", nextCategory);
            else query.delete("category");
            const qs = query.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [params, pathname, router, status, category],
    );

    const listings = useApiResource<AdminListingsPage>(`listings:list:${status}:${category ?? "-"}:${live}`, () =>
        listingsService.list({
            ...(status === "ALL" || drafting ? {} : { status: [status] }),
            ...(category ? { category } : {}),
            sort: "SUBMITTED",
            // With drafts on show, only the counts are wanted from this read.
            pageSize: drafting ? 1 : PAGE_SIZE,
        }),
    );
    const drafts = useApiResource<ListingDraftsPage>(`listings:drafts:${drafting}:${live}`, () =>
        listingsService.drafts({ sort: "NEWEST", pageSize: drafting ? PAGE_SIZE : 1 }),
    );

    if (!live) return <ListingsOffline />;

    const reload = () => {
        listings.reload();
        drafts.reload();
    };

    return (
        <ResourceBoundary resource={listings}>
            {(page) =>
                drafting ? (
                    <ResourceBoundary resource={drafts}>
                        {(draftPage) => (
                            <ListingsTable
                                page={page}
                                drafts={draftPage}
                                draftsTotal={draftPage.total}
                                status={status}
                                category={category}
                                onStatusChange={(next) => setQuery({ status: next })}
                                onCategoryChange={(next) => setQuery({ category: next })}
                                onChanged={reload}
                            />
                        )}
                    </ResourceBoundary>
                ) : (
                    <ListingsTable
                        page={page}
                        drafts={null}
                        draftsTotal={drafts.data?.total ?? null}
                        status={status}
                        category={category}
                        onStatusChange={(next) => setQuery({ status: next })}
                        onCategoryChange={(next) => setQuery({ category: next })}
                        onChanged={reload}
                    />
                )
            }
        </ResourceBoundary>
    );
}
