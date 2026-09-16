import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCursorPages } from "./use-cursor-pages";

/**
 * Q-C item 6 — a cursor read that grows behind "Load more".
 *
 * What is pinned: the first page is the resource (loading, then loaded);
 * `loadMore` reads from the cursor the last page named and appends; the
 * server saying `nextCursor: null` ends it; a failed follow-on keeps the
 * rows read so far and says so; and a reload drops the follow-on pages with
 * the first, so rows from before a mutation never sit under rows from after.
 */

type Row = { id: string };

function backend(pages: Record<string, { rows: Row[]; nextCursor: string | null }>) {
    const calls: (string | null)[] = [];
    const fetchPage = async (cursor: string | null) => {
        calls.push(cursor);
        const page = pages[cursor ?? "first"];
        if (!page) throw new Error(`no page after ${cursor}`);
        return page;
    };
    return { calls, fetchPage };
}

describe("useCursorPages", () => {
    it("reads the first page as the resource and appends the next behind loadMore until the cursor runs out", async () => {
        const { calls, fetchPage } = backend({
            first: { rows: [{ id: "a" }, { id: "b" }], nextCursor: "b" },
            b: { rows: [{ id: "c" }], nextCursor: "c" },
            c: { rows: [{ id: "d" }], nextCursor: null },
        });
        const { result } = renderHook(() => useCursorPages<Row>("k", fetchPage));
        expect(result.current.resource.loading).toBe(true);
        await waitFor(() => expect(result.current.resource.loading).toBe(false));
        expect(result.current.rows.map((r) => r.id)).toEqual(["a", "b"]);
        expect(result.current.hasMore).toBe(true);

        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.rows).toHaveLength(3));
        expect(result.current.hasMore).toBe(true);

        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.rows).toHaveLength(4));
        expect(result.current.rows.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
        expect(result.current.hasMore).toBe(false);
        expect(calls).toEqual([null, "b", "c"]);

        // Nothing more to read: a click is a no-op.
        act(() => result.current.loadMore());
        expect(calls).toEqual([null, "b", "c"]);
    });

    it("keeps the rows read so far when a follow-on page fails, and says so", async () => {
        const { fetchPage } = backend({ first: { rows: [{ id: "a" }], nextCursor: "a" } });
        const { result } = renderHook(() => useCursorPages<Row>("k", fetchPage));
        await waitFor(() => expect(result.current.resource.loading).toBe(false));
        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.moreError).not.toBeNull());
        expect(result.current.rows).toHaveLength(1);
        expect(result.current.hasMore).toBe(true);
        expect(result.current.loadingMore).toBe(false);
    });

    it("reload drops the follow-on pages with the first page", async () => {
        const { calls, fetchPage } = backend({
            first: { rows: [{ id: "a" }], nextCursor: "a" },
            a: { rows: [{ id: "b" }], nextCursor: null },
        });
        const { result } = renderHook(() => useCursorPages<Row>("k", fetchPage));
        await waitFor(() => expect(result.current.resource.loading).toBe(false));
        act(() => result.current.loadMore());
        await waitFor(() => expect(result.current.rows).toHaveLength(2));

        act(() => result.current.reload());
        await waitFor(() => expect(calls).toEqual([null, "a", null]));
        await waitFor(() => expect(result.current.resource.loading).toBe(false));
        expect(result.current.rows.map((r) => r.id)).toEqual(["a"]);
        expect(result.current.hasMore).toBe(true);
    });
});
