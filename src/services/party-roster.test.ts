import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29 Sep 2026 — the party rosters, made uniform: the five filters every
 * desk takes, end to end on the console side. What is pinned: the bar's
 * state becomes a query with blanks and "every" dropped; each desk's read
 * sends the five to its own list route (the agent route names the text
 * `search`), at the largest page the route allows; and each read says when
 * there is another page — by page number, by cursor or by offset, as the
 * route pages.
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        calls: [] as string[],
        answer: null as unknown,
        reset() {
            this.calls = [];
            this.answer = null;
        },
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const get = async (path: string) => {
        backend.calls.push(path);
        return backend.answer;
    };
    return { ...actual, api: { ...actual.api, get, getEnvelope: get } };
});

import { EMPTY_ROSTER_FILTERS, ROSTER_ANY, rosterFiltersActive, rosterParams, rosterQueryKey, rosterQueryOf } from "./party-roster";
import { supplyService } from "./supply";
import { advertiserService } from "./advertisers";
import { agentService } from "./agents";
import { PRINT_PARTNER_STATUS_OPTIONS, printPartnerService, printPartnerStatusCounts, printPartnerStatusFacet } from "./print-partners";

const everything = { q: "98765 43210", onboardedVia: "DESK", kycState: "PENDING" as const, type: "BUSINESS", city: "bengaluru" };

const query = (path: string) => Object.fromEntries(new URLSearchParams(path.split("?")[1] ?? ""));

beforeEach(() => backend.reset());

describe("the filters as a query", () => {
    it("drops blanks and every-selects, trims the text and sends a picked city's slug", () => {
        expect(rosterQueryOf(EMPTY_ROSTER_FILTERS)).toEqual({});
        expect(
            rosterQueryOf({ q: "  suraj ", door: "DESK", kycState: "PENDING", type: ROSTER_ANY, city: { text: "Bengaluru", slug: "bengaluru" } }),
        ).toEqual({ q: "suraj", onboardedVia: "DESK", kycState: "PENDING", city: "bengaluru" });
        // A typed town the catalogue lacks goes as typed.
        expect(rosterQueryOf({ ...EMPTY_ROSTER_FILTERS, city: { text: " Nowhere ", slug: null } })).toEqual({ city: "Nowhere" });
        // A KYC value the six states do not have is not sent.
        expect(rosterQueryOf({ ...EMPTY_ROSTER_FILTERS, kycState: "LOST" })).toEqual({});
    });

    it("sends the five in one order, the text as `search` where the route names it so, and keys the read on them", () => {
        expect(rosterParams(everything).toString()).toBe("q=98765+43210&onboardedVia=DESK&kycState=PENDING&type=BUSINESS&city=bengaluru");
        expect(rosterParams(everything, "search").get("search")).toBe("98765 43210");
        expect(rosterQueryKey({ city: "pune", q: "a" })).toBe(rosterQueryKey({ q: "a", city: "pune" }));
    });

    it("says when any filter is on", () => {
        expect(rosterFiltersActive(EMPTY_ROSTER_FILTERS)).toBe(false);
        expect(rosterFiltersActive({ ...EMPTY_ROSTER_FILTERS, type: "NGO" })).toBe(true);
        expect(rosterFiltersActive({ ...EMPTY_ROSTER_FILTERS, q: "   " })).toBe(false);
    });
});

describe("each desk's read", () => {
    it("publishers: the list contract, a hundred a page, the next page while the total is not reached", async () => {
        backend.answer = { items: [{ id: "pub_1", name: "A", mobile: "9507842149", kycStatus: "PENDING", agentId: null, displayId: null, city: null, type: null, createdAt: "2026-09-01" }], total: 101, page: 1, pageSize: 100, counts: {} };
        const page = await supplyService.rosterPage(everything, null);
        expect(backend.calls[0]!.startsWith("/publishers?")).toBe(true);
        expect(query(backend.calls[0]!)).toEqual({ q: "98765 43210", onboardedVia: "DESK", kycState: "PENDING", type: "BUSINESS", city: "bengaluru", page: "1", pageSize: "100" });
        expect(page.total).toBe(101);
        expect(page.nextCursor).toBe("2");
        expect(page.rows[0]).toMatchObject({ id: "pub_1", kyc: { state: "AWAITING_DOCUMENTS" }, listingCount: 0 });

        backend.answer = { items: [{ id: "pub_101", name: "B", mobile: "+919000000000", kycStatus: "VERIFIED", agentId: null, displayId: "PUB-1", city: null, type: null, createdAt: "2026-09-01", listingCount: 4, kyc: { state: "VERIFIED" } }], total: 101, page: 2, pageSize: 100, counts: {} };
        const second = await supplyService.rosterPage({}, "2");
        expect(query(backend.calls[1]!)).toEqual({ page: "2", pageSize: "100" });
        expect(second.nextCursor).toBeNull();
        expect(second.rows[0]).toMatchObject({ listingCount: 4, kyc: { state: "VERIFIED" } });
    });

    it("advertisers: the cursor read, two hundred a page, with the total beside it", async () => {
        backend.answer = { rows: [{ id: "adv_1", name: "Swiggy", mobile: "+919812340001", type: "COMMERCIAL", kycStatus: "PENDING", createdAt: "2026-09-14", campaignCount: 2 }], nextCursor: "adv_1", total: 250 };
        const page = await advertiserService.rosterPage(everything, "adv_0");
        expect(query(backend.calls[0]!)).toEqual({ q: "98765 43210", onboardedVia: "DESK", kycState: "PENDING", type: "BUSINESS", city: "bengaluru", limit: "200", cursor: "adv_0" });
        expect(page).toMatchObject({ nextCursor: "adv_1", total: 250 });
        expect(page.rows[0]).toMatchObject({ contact: "+919812340001", campaignCount: 2 });
    });

    it("agents: the text as `search`, two hundred a page, the next offset from the meta's total", async () => {
        backend.answer = { data: [{ id: "agt_1", userId: "usr_1", city: "Pune", tier: "BRONZE", createdAt: "2026-09-07", side: "ADVERTISER", sourceKind: "FLEET", onboardedCount: 6, kyc: { state: "PENDING" }, user: { name: "Ravi", mobile: "+919000000001", isActive: true } }], meta: { total: 201, limit: 200, offset: 0 } };
        const page = await agentService.rosterPage({ ...everything, type: "ADVERTISER", onboardedVia: "FLEET" }, null);
        expect(query(backend.calls[0]!)).toEqual({ search: "98765 43210", onboardedVia: "FLEET", kycState: "PENDING", type: "ADVERTISER", city: "bengaluru", limit: "200" });
        expect(page).toMatchObject({ total: 201, nextCursor: "1" });
        expect(page.rows[0]).toMatchObject({ side: "ADVERTISER", sourceKind: "FLEET", onboardedCount: 6, kyc: { state: "PENDING" } });

        await agentService.rosterPage({}, "200");
        expect(query(backend.calls[1]!)).toEqual({ limit: "200", offset: "200" });
    });

    it("print partners: the door and the KYC state, the Status as the route's `status=`, and no type — a shop has none", async () => {
        backend.answer = {
            items: [{ id: "prt_1", accountState: "ACTIVE" }],
            total: 1,
            page: 1,
            pageSize: 100,
            counts: { ACTIVE: 1, INACTIVE: 0 },
            statusCounts: { ACTIVE: 1, DEACTIVATED: 0, CLOSED: 0 },
        };
        const page = await printPartnerService.rosterPage({ ...everything, status: "ACTIVE" }, null);
        expect(query(backend.calls[0]!)).toEqual({ q: "98765 43210", city: "bengaluru", status: "ACTIVE", onboardedVia: "DESK", kycState: "PENDING", pageSize: "100" });
        expect(page).toMatchObject({ total: 1, nextCursor: null, counts: { ACTIVE: 1, INACTIVE: 0 } });
        expect(page.rows[0]?.accountState).toBe("ACTIVE");
    });

    /* 2 Oct 2026: the shared Status select on the print partners — Active, Deactivated, Closed, Everyone. */
    it("print partners: Deactivated and Closed go as `status=`, Everyone as ALL, and the counts become the select's", async () => {
        backend.answer = {
            items: [{ id: "prt_9", accountState: "CLOSED" }, { id: "prt_8", accountState: "LOST" }],
            total: 2,
            page: 1,
            pageSize: 100,
            counts: { ACTIVE: 12, INACTIVE: 5 },
            statusCounts: { ACTIVE: 12, DEACTIVATED: 3, CLOSED: 2 },
        };
        const off = await printPartnerService.rosterPage({ status: "DEACTIVATED" }, null);
        expect(query(backend.calls[0]!)).toEqual({ status: "DEACTIVATED", pageSize: "100" });
        expect(off.statusCounts).toEqual({ ACTIVE: 12, DEACTIVATED: 3, CLOSED: 2, ALL: 17 });

        const closed = await printPartnerService.rosterPage({ status: "CLOSED" }, null);
        expect(query(backend.calls[1]!)).toEqual({ status: "CLOSED", pageSize: "100" });
        // The row's state is read off the wire; a word the console does not know reads as none.
        expect(closed.rows.map((row) => row.accountState)).toEqual(["CLOSED", null]);

        await printPartnerService.rosterPage({ status: "ALL" }, null);
        expect(query(backend.calls[2]!)).toEqual({ status: "ALL", pageSize: "100" });

        // Never the older `active=` from the directory.
        expect(backend.calls.some((call) => query(call)["active"] !== undefined)).toBe(false);

        // A state the route cannot cut is refused, never read as everyone.
        await expect(printPartnerService.rosterPage({ status: "SUSPENDED" }, null)).rejects.toThrow(/no "SUSPENDED" facet/);
        await expect(printPartnerService.rosterPage({ status: "EXITED" }, null)).rejects.toThrow(/no "EXITED" facet/);
        expect(printPartnerStatusFacet("SUSPENDED")).toBeNull();
        expect(printPartnerStatusFacet(undefined)).toBeUndefined();
        expect(PRINT_PARTNER_STATUS_OPTIONS.map((option) => option.label)).toEqual(["Active", "Deactivated", "Closed", "Everyone"]);
    });

    it("print partners: a server one release behind — its ACTIVE / INACTIVE counts read as Active and Deactivated", () => {
        expect(printPartnerStatusCounts({ counts: { ACTIVE: 12, INACTIVE: 3 } })).toEqual({ ACTIVE: 12, DEACTIVATED: 3, ALL: 15 });
        expect(printPartnerStatusCounts({ counts: {} })).toEqual({});
    });
});

/**
 * 2 Oct 2026 (the account lifecycle): the Status select on the publisher,
 * advertiser and agent rosters — `?status=`, Active by default and not
 * counted as a filter; each desk's read carries the counts per state and
 * each row its `accountState`; the pickers and name lookups ask for everyone.
 */
describe("the Status facet", () => {
    it("goes on the wire as `status`, and Active (the default) is not a filter the bar can clear", () => {
        expect(rosterQueryOf({ ...EMPTY_ROSTER_FILTERS, status: "CLOSED" })).toEqual({ status: "CLOSED" });
        expect(rosterQueryOf({ ...EMPTY_ROSTER_FILTERS, status: "nonsense" })).toEqual({});
        expect(rosterParams({ q: "a", status: "ALL" }).toString()).toBe("q=a&status=ALL");
        expect(rosterFiltersActive({ ...EMPTY_ROSTER_FILTERS, status: "ACTIVE" })).toBe(false);
        expect(rosterFiltersActive({ ...EMPTY_ROSTER_FILTERS, status: "SUSPENDED" })).toBe(true);
        expect(rosterFiltersActive({ ...EMPTY_ROSTER_FILTERS, status: "ALL" })).toBe(true);
    });

    it("publishers: the counts per state and each row's state come back with the page", async () => {
        backend.answer = {
            items: [{ id: "pub_1", name: "A", mobile: "9507842149", kycStatus: "PENDING", agentId: null, displayId: null, city: null, type: null, createdAt: "2026-09-01", accountState: "SUSPENDED" }],
            total: 1,
            page: 1,
            pageSize: 100,
            counts: { PENDING: 1 },
            statusCounts: { ACTIVE: 40, SUSPENDED: 1, DEACTIVATED: 0, CLOSED: 2, ALL: 43 },
        };
        const page = await supplyService.rosterPage({ status: "SUSPENDED" }, null);
        expect(query(backend.calls[0]!)).toMatchObject({ status: "SUSPENDED" });
        expect(page.statusCounts).toEqual({ ACTIVE: 40, SUSPENDED: 1, DEACTIVATED: 0, CLOSED: 2, ALL: 43 });
        expect(page.rows[0]!.accountState).toBe("SUSPENDED");
    });

    it("advertisers and agents: the same, from the page and from the meta", async () => {
        backend.answer = { rows: [{ id: "adv_1", name: "Swiggy", mobile: "+919812340001", type: "COMMERCIAL", kycStatus: "PENDING", createdAt: "2026-09-14", accountState: "CLOSED" }], nextCursor: null, total: 1, statusCounts: { CLOSED: 1 } };
        const advertisers = await advertiserService.rosterPage({ status: "CLOSED" }, null);
        expect(query(backend.calls[0]!)).toMatchObject({ status: "CLOSED" });
        expect(advertisers.statusCounts).toEqual({ CLOSED: 1 });
        expect(advertisers.rows[0]!.accountState).toBe("CLOSED");

        backend.answer = {
            data: [{ id: "agt_1", userId: "usr_1", city: "Pune", tier: "BRONZE", createdAt: "2026-09-07", accountState: "EXITED", user: { name: "Ravi", mobile: "+919000000001", isActive: true } }],
            meta: { total: 1, statusCounts: { EXITED: 1, ALL: 9 } },
        };
        const agents = await agentService.rosterPage({ status: "EXITED" }, null);
        expect(query(backend.calls[1]!)).toMatchObject({ status: "EXITED" });
        expect(agents.statusCounts).toEqual({ EXITED: 1, ALL: 9 });
        expect(agents.rows[0]!.accountState).toBe("EXITED");
    });

    it("a server one release behind sends no state: the row reads as working and no counts are drawn", async () => {
        backend.answer = { rows: [{ id: "adv_1", name: "Swiggy", mobile: "+919812340001", type: "COMMERCIAL", kycStatus: "PENDING", createdAt: "2026-09-14" }], nextCursor: null, total: 1 };
        const page = await advertiserService.rosterPage({}, null);
        expect(page.statusCounts).toEqual({});
        expect(page.rows[0]!.accountState).toBeNull();
    });

    it("the pickers and name lookups ask for everyone", async () => {
        backend.answer = [];
        await supplyService.roster();
        await agentService.list();
        await agentService.directory();
        backend.answer = { rows: [], nextCursor: null };
        await advertiserService.list();
        await advertiserService.search("swi");
        backend.answer = { items: [], total: 0, page: 1, pageSize: 5, counts: {} };
        await supplyService.search("metro", 5);
        for (const call of backend.calls) expect(query(call).status).toBe("ALL");
    });
});
