import type { SortingState } from "@tanstack/react-table";

/**
 * The directory's server-side sort — Lot G (Q113): `GET /employees?sort=&dir=`.
 *
 * `NAME` sorts on the person, `ROLE` on the designation (nulls last),
 * `JOINED` on `createdAt`, and — G13-B — `REGION` on the region (A to Z,
 * blanks last). `dir` defaults `asc` for the words and `desc` for the
 * date, so the table draws newest first until a header is clicked — which
 * is what it always drew.
 *
 * The table's sorting state is TanStack's `{ id, desc }[]`; the column ids
 * below are the ones the directory's column definitions carry, and a column
 * the server cannot sort on (contact, status) has no entry and is not
 * sortable. Only the first sort is sent: the API takes one.
 */

export type EmployeesSort = "NAME" | "ROLE" | "JOINED" | "REGION";
export type SortDir = "asc" | "desc";

/** The four sortable columns, by the id the table gives them. */
export const DIRECTORY_SORT_COLUMNS: Record<string, EmployeesSort> = {
    employee: "NAME",
    role: "ROLE",
    joined: "JOINED",
    region: "REGION",
};

/** The page sizes the frame offers. */
export const DIRECTORY_PAGE_SIZES = [10, 25, 50, 100] as const;
export type DirectoryPageSize = (typeof DIRECTORY_PAGE_SIZES)[number];

/** The server's default direction for each sort — what the table draws before a second click flips it. */
export const DEFAULT_DIR: Record<EmployeesSort, SortDir> = { NAME: "asc", ROLE: "asc", JOINED: "desc", REGION: "asc" };

/** `?sort=&dir=` from the table's sorting state; nothing when the table is unsorted. */
export function sortParamsOf(sorting: SortingState): { sort: EmployeesSort; dir: SortDir } | null {
    const first = sorting[0];
    if (!first) return null;
    const sort = DIRECTORY_SORT_COLUMNS[first.id];
    if (!sort) return null;
    return { sort, dir: first.desc ? "desc" : "asc" };
}

/**
 * The state a header click asks for: the server's default direction on a
 * fresh column, the other way on a second click. Kept here rather than
 * left to TanStack's own toggle, whose first click is always ascending —
 * which on Joined would flip the table to oldest first the moment anybody
 * touched it.
 */
export function toggleSort(current: SortingState, columnId: string): SortingState {
    const sort = DIRECTORY_SORT_COLUMNS[columnId];
    if (!sort) return current;
    const first = current[0];
    if (first?.id === columnId) return [{ id: columnId, desc: !first.desc }];
    return [{ id: columnId, desc: DEFAULT_DIR[sort] === "desc" }];
}

/** The sort the table is drawn in before anybody clicks: newest first, the way the API defaults. */
export const INITIAL_DIRECTORY_SORT: SortingState = [{ id: "joined", desc: true }];
