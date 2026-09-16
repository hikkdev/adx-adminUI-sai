"use client";

import * as React from "react";
import { ApiError } from "@/lib/api-client";
import { useApiResource, type ApiResource } from "@/lib/use-api-resource";

/** One page of a cursor read: the rows and the id to pass back for the next, null when exhausted. */
export interface CursorPageOf<T> {
    rows: T[];
    nextCursor: string | null;
}

export interface CursorPages<T> {
    /** The first page as a resource — loading, error and reload exactly as `useApiResource` gives them. */
    resource: ApiResource<CursorPageOf<T>>;
    /** Every row read so far: the first page and the pages loaded after it, in order. */
    rows: T[];
    /** The server said there is a page after the last one read. */
    hasMore: boolean;
    /** A follow-on page is in flight. */
    loadingMore: boolean;
    /** The follow-on read failed; the rows read so far stay. */
    moreError: string | null;
    /** Reads the next page and appends it. A no-op while one is in flight or when there is none. */
    loadMore: () => void;
    /** Drops every follow-on page and refetches the first — after a mutation moved the rows. */
    reload: () => void;
}

/**
 * A cursor/limit read that grows — Q-C item 6.
 *
 * The bounded queues (`/supply/attempts`, `/supply/compliance/cases`) answer
 * one page and a cursor; the console read the largest page and printed
 * "showing the first N" with no way to the rest. This keeps the first page
 * as an ordinary `useApiResource` (so `ResourceBoundary` renders its three
 * states unchanged) and appends follow-on pages behind `loadMore`.
 *
 * `key` names the read the way it does for `useApiResource`; `fetchPage`
 * takes the cursor to read from (null for the first page). The follow-on
 * pages are keyed to the first page object they were read after, so a
 * reload of the first page drops them without an effect: rows from before
 * a mutation never sit under rows from after it.
 */
export function useCursorPages<T>(key: string, fetchPage: (cursor: string | null) => Promise<CursorPageOf<T>>): CursorPages<T> {
    const resource = useApiResource<CursorPageOf<T>>(key, () => fetchPage(null));
    const [extra, setExtra] = React.useState<{ after: CursorPageOf<T>; rows: T[]; nextCursor: string | null } | null>(null);
    const [loadingMore, setLoadingMore] = React.useState(false);
    const [moreError, setMoreError] = React.useState<string | null>(null);

    // Kept in a ref so loadMore reads the latest closure without depending on
    // it — callers pass an inline arrow, a new function every render.
    const fetchRef = React.useRef(fetchPage);
    React.useEffect(() => {
        fetchRef.current = fetchPage;
    });

    const first = resource.data;
    // Follow-on pages count only while they belong to the first page on screen.
    const tail = extra && first !== null && extra.after === first ? extra : null;
    const nextCursor = tail ? tail.nextCursor : (first?.nextCursor ?? null);
    const rows = React.useMemo(() => (first ? (tail ? [...first.rows, ...tail.rows] : first.rows) : []), [first, tail]);

    const loadMore = React.useCallback(() => {
        if (first === null || nextCursor === null || loadingMore) return;
        setLoadingMore(true);
        setMoreError(null);
        void (async () => {
            try {
                const page = await fetchRef.current(nextCursor);
                setExtra((current) => {
                    const previous = current && current.after === first ? current.rows : [];
                    return { after: first, rows: [...previous, ...page.rows], nextCursor: page.nextCursor };
                });
            } catch (cause) {
                setMoreError(cause instanceof ApiError ? cause.message : "Could not load more. Check your connection and try again.");
            } finally {
                setLoadingMore(false);
            }
        })();
    }, [first, nextCursor, loadingMore]);

    const reloadFirst = resource.reload;
    const reload = React.useCallback(() => {
        setExtra(null);
        setMoreError(null);
        reloadFirst();
    }, [reloadFirst]);

    return { resource, rows, hasMore: nextCursor !== null, loadingMore, moreError, loadMore, reload };
}
