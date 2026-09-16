import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ api: {} }));
vi.mock("@/lib/api-config", () => ({ isLive: () => true }));
vi.mock("@/services/users", () => ({ usersService: {} }));

import { buildEmployeesQuery } from "@/services/employees";
import { DIRECTORY_PAGE_SIZES, INITIAL_DIRECTORY_SORT, sortParamsOf, toggleSort } from "./directory-sort";

/**
 * Lot G (Q113), package CG1 — the directory's server-side sort and page size.
 *
 * What this pins: a header click becomes the `?sort=&dir=` the API takes,
 * Joined opens newest first and flips on the second click while the two
 * words open ascending, a column the server cannot sort on sends nothing,
 * and the query builder emits the pair beside the page size the Rows per
 * page control chose.
 */

describe("the sort params", () => {
    it("names the API's sort for each sortable column, and nothing for the rest", () => {
        expect(sortParamsOf([{ id: "employee", desc: false }])).toEqual({ sort: "NAME", dir: "asc" });
        expect(sortParamsOf([{ id: "role", desc: true }])).toEqual({ sort: "ROLE", dir: "desc" });
        expect(sortParamsOf([{ id: "joined", desc: true }])).toEqual({ sort: "JOINED", dir: "desc" });
        // G13-B: Region sorts server-side too, A to Z first.
        expect(sortParamsOf([{ id: "region", desc: false }])).toEqual({ sort: "REGION", dir: "asc" });
        expect(toggleSort([], "region")).toEqual([{ id: "region", desc: false }]);
        expect(sortParamsOf([{ id: "contact", desc: false }])).toBeNull();
        expect(sortParamsOf([])).toBeNull();
    });

    it("opens newest first on Joined and ascending on a word, then flips", () => {
        expect(INITIAL_DIRECTORY_SORT).toEqual([{ id: "joined", desc: true }]);
        expect(toggleSort([], "joined")).toEqual([{ id: "joined", desc: true }]);
        expect(toggleSort([{ id: "joined", desc: true }], "joined")).toEqual([{ id: "joined", desc: false }]);
        expect(toggleSort([{ id: "joined", desc: true }], "employee")).toEqual([{ id: "employee", desc: false }]);
        expect(toggleSort([{ id: "employee", desc: false }], "employee")).toEqual([{ id: "employee", desc: true }]);
        expect(toggleSort([{ id: "employee", desc: false }], "status")).toEqual([{ id: "employee", desc: false }]);
    });
});

describe("the query", () => {
    it("emits sort and dir beside the page size", () => {
        expect(buildEmployeesQuery({ sort: "JOINED", dir: "desc", page: 2, pageSize: 50 })).toBe("sort=JOINED&dir=desc&page=2&pageSize=50");
        expect(buildEmployeesQuery({ q: "priya", active: true, sort: "NAME", dir: "asc", pageSize: 10 })).toBe(
            "q=priya&active=true&sort=NAME&dir=asc&page=1&pageSize=10"
        );
    });

    it("sends no dir without a sort, and no sort at all when the table is unsorted", () => {
        expect(buildEmployeesQuery({ dir: "desc", pageSize: 25 })).toBe("page=1&pageSize=25");
        expect(buildEmployeesQuery({ pageSize: 100 })).toBe("page=1&pageSize=100");
    });

    it("offers the frame's four page sizes", () => {
        expect([...DIRECTORY_PAGE_SIZES]).toEqual([10, 25, 50, 100]);
    });
});
