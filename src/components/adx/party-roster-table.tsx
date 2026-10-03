"use client";

import * as React from "react";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { DataTable } from "@/components/adx/data-table";
import { LoadMore } from "@/components/adx/load-more";
import type { PartyRosterFilterState } from "@/components/adx/party-roster-filter-bar";
import { useCursorPages } from "@/lib/use-cursor-pages";
import type { ApiResource } from "@/lib/use-api-resource";
import type { AccountStatusCounts } from "@/services/account-state";
import type { PartyRosterPage, PartyRosterQuery } from "@/services/party-roster";

/**
 * The party rosters' table — 29 Sep 2026: the shared columns
 * (`party-roster-columns`), the shared filter bar (`party-roster-filter-bar`)
 * in the table's toolbar, and the foot that reads the next page of a roster
 * longer than one read. Every desk renders this, so the frame around the
 * rows is the same on each.
 */

/** What a desk's table is handed: the rows read so far and how to read more. */
export interface PartyRosterView<T> {
    rows: T[];
    /** The server's count of every row the filters match; null when the route does not say. */
    total: number | null;
    hasMore: boolean;
    loadingMore: boolean;
    moreError: string | null;
    loadMore: () => void;
    /** A changed filter is being read under the rows still on screen. */
    refreshing: boolean;
    /** 2 Oct 2026: the server's count per account state — the Status select's numbers; empty when the route sends none. */
    statusCounts?: AccountStatusCounts;
}

/**
 * A roster read keyed on the filters: the first page as a resource (so
 * `ResourceBoundary` draws its three states), the pages after it behind
 * "Load more", and a changed filter refetching from the first page while
 * the rows already on screen stay put — the search box keeps its focus.
 */
export function usePartyRoster<T, P extends PartyRosterPage<T> = PartyRosterPage<T>>(
    key: string,
    filters: PartyRosterFilterState,
    fetchPage: (query: PartyRosterQuery, cursor: string | null) => Promise<P>,
): { resource: ApiResource<P>; view: PartyRosterView<T>; reload: () => void } {
    const pages = useCursorPages<T, P>(`${key}:${filters.key}`, (cursor) => fetchPage(filters.query, cursor));
    const { resource } = pages;
    return {
        resource,
        reload: pages.reload,
        view: {
            rows: pages.rows,
            total: resource.data?.total ?? null,
            hasMore: pages.hasMore,
            loadingMore: pages.loadingMore,
            moreError: pages.moreError,
            loadMore: pages.loadMore,
            refreshing: resource.loading && resource.data !== null,
            statusCounts: resource.data?.statusCounts ?? {},
        },
    };
}

export interface PartyRosterTableProps<T> {
    columns: ColumnDef<T>[];
    view: PartyRosterView<T>;
    /** What a row is called, singular — the foot's "Showing 20 of 45 publishers". */
    noun: string;
    filterBar: React.ReactNode;
    onRowClick: (row: T) => void;
    getRowId: (row: T) => string;
    emptyState: React.ReactNode;
    initialColumnVisibility?: VisibilityState;
    /** The bar a ticked selection raises — `DataTable`'s own; the failed rows of a run stay ticked through `keepSelected`. */
    bulkActions?: (rows: T[], clearSelection: () => void, keepSelected: (rows: T[]) => void) => React.ReactNode;
}

/** The roster: the shared filter bar in the table's toolbar, the rows, and the foot that reads the next page. */
export function PartyRosterTable<T>({ columns, view, noun, filterBar, onRowClick, getRowId, emptyState, initialColumnVisibility, bulkActions }: PartyRosterTableProps<T>) {
    return (
        <div className="space-y-3">
            <DataTable
                columns={columns}
                data={view.rows}
                toolbar={filterBar}
                initialPageSize={20}
                pageSizes={[10, 20, 50, 100]}
                onRowClick={onRowClick}
                getRowId={getRowId}
                emptyState={emptyState}
                initialColumnVisibility={initialColumnVisibility}
                bulkActions={bulkActions}
            />
            <LoadMore
                shown={view.rows.length}
                total={view.total}
                noun={noun}
                hasMore={view.hasMore}
                loading={view.loadingMore}
                error={view.moreError}
                onLoadMore={view.loadMore}
            />
        </div>
    );
}
