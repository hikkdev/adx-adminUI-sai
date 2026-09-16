import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The command palette's fan-out.
 *
 * What is pinned: two characters is the floor, six routes are asked at
 * once, a group is at most five rows, a source that fails drops its group
 * without emptying the palette, and the publishers are searched on the
 * server like the rest (E10-1: `GET /publishers?q=&page=1&pageSize=5`, the
 * list contract) — nothing is cached and nothing is cut here.
 */

const { calls, answers } = vi.hoisted(() => ({
    calls: [] as string[],
    answers: new Map<string, unknown>(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: async (path: string) => {
                calls.push(path);
                const key = [...answers.keys()].find((prefix) => path.startsWith(prefix));
                const answer = key ? answers.get(key) : undefined;
                if (answer instanceof Error) throw answer;
                return answer ?? { items: [], rows: [], total: 0, page: 1, pageSize: 5, counts: {} };
            },
            post: async () => ({}),
            patch: async () => ({}),
            put: async () => ({}),
            delete: async () => ({}),
        },
    };
});
vi.mock("@/lib/api-config", () => ({
    isLive: () => true,
    apiConfig: { live: true, baseUrl: "" },
}));

import {
    SEARCH_LIMIT,
    campaignHit,
    foldSearch,
    groupOf,
    orderHit,
    publisherHit,
    searchService,
    type SearchGroup,
} from "./search";
import type { RosterPublisher } from "./supply";

const publisher = (over: Partial<RosterPublisher> = {}): RosterPublisher => ({
    id: "pub_cuid",
    displayId: "PUB-1001-2601",
    userId: null,
    name: "Sharma Hoardings",
    mobile: "9845022187",
    city: "Bengaluru",
    type: "BUSINESS",
    kycStatus: "VERIFIED",
    onboardingStatus: null,
    listingCount: 2,
    onboardedByAgent: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    suspensionScopes: [],
    suspensionReason: null,
    suspendedAt: null,
    ...over,
});

const hits = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id_${i}`, title: `Row ${i}`, subtitle: null, href: `/x/id_${i}` }));

describe("shaping", () => {
    it("names a publisher by name with the id, city and mobile beneath, opening the page", () => {
        expect(publisherHit(publisher())).toEqual({
            id: "pub_cuid",
            title: "Sharma Hoardings",
            subtitle: "PUB-1001-2601 · Bengaluru · 9845022187",
            href: "/publishers/pub_cuid",
        });
    });

    it("names an order by its campaign, falling back to the site", () => {
        const base = {
            id: "ord_1",
            status: "SLOT_CONFIRMED" as const,
            listing: "Hebbal Flyover",
            listingId: "lst_1",
            city: "Bengaluru",
            campaignName: null,
            agent: null,
            agentId: null,
            budget: null,
            startDate: null,
            endDate: null,
            slotTime: null,
            createdAt: "2026-09-01T00:00:00.000Z",
        };
        expect(orderHit(base).title).toBe("Hebbal Flyover");
        expect(orderHit({ ...base, campaignName: "Diwali push" }).title).toBe("Diwali push");
        expect(orderHit(base).href).toBe("/orders/ord_1");
    });

    it("quotes a campaign's reference, the one thing a person reads out on the phone", () => {
        const hit = campaignHit({
            id: "cmp_1",
            reference: "ADX-CMP-2026-482913",
            name: "Diwali Season Push",
            status: "LIVE",
            goal: null,
            brandName: "Anita's Coffee",
            area: null,
            budget: null,
            committed: null,
            startDate: null,
            endDate: null,
            spotCount: 1,
            createdAt: "",
            updatedAt: "",
        });
        expect(hit.subtitle).toBe("ADX-CMP-2026-482913 · Anita's Coffee · Live");
    });
});

describe("groupOf and foldSearch", () => {
    it("caps a group at five rows", () => {
        expect(groupOf("orders", hits(9)).hits).toHaveLength(SEARCH_LIMIT);
        expect(groupOf("orders", hits(2)).hits).toHaveLength(2);
    });

    it("keeps the groups with hits in order, drops empty ones and failed sources", () => {
        const folded = foldSearch([
            { status: "fulfilled", value: groupOf("publishers", hits(1)) },
            { status: "fulfilled", value: groupOf("advertisers", []) },
            { status: "rejected", reason: new Error("down") },
            { status: "fulfilled", value: groupOf("orders", hits(3)) },
        ] as PromiseSettledResult<SearchGroup>[]);
        expect(folded.map((group) => group.domain)).toEqual(["publishers", "orders"]);
        expect(folded[1].heading).toBe("Orders");
    });
});

describe("searchService.records", () => {
    beforeEach(() => {
        calls.length = 0;
        answers.clear();
    });

    it("asks nothing below two characters", async () => {
        expect(await searchService.records("a")).toEqual([]);
        expect(calls).toEqual([]);
    });

    it("fans out to the six routes with the query, five rows each", async () => {
        answers.set("/publishers", { items: [publisher()], total: 1, page: 1, pageSize: 5, counts: {} });
        await searchService.records("sharma");
        expect(calls).toContain("/publishers?q=sharma&page=1&pageSize=5");
        expect(calls).toContain("/advertisers?q=sharma&limit=5");
        expect(calls).toContain("/agents?search=sharma&limit=5");
        expect(calls.find((path) => path.startsWith("/orders?"))).toContain("q=sharma");
        expect(calls.find((path) => path.startsWith("/orders?"))).toContain("pageSize=5");
        expect(calls.find((path) => path.startsWith("/listings?"))).toContain("q=sharma");
        expect(calls.find((path) => path.startsWith("/campaigns?"))).toContain("q=sharma");
        expect(calls).toHaveLength(6);
    });

    it("searches the publishers on the server per query, taking the page as it comes, and never cuts it here", async () => {
        answers.set("/publishers", {
            items: [publisher({ id: "pub_2", name: "Metro Walls", displayId: null }), publisher()],
            total: 2,
            page: 1,
            pageSize: 5,
            counts: {},
        });
        const first = await searchService.records("metro");
        expect(first.find((group) => group.domain === "publishers")?.hits.map((hit) => hit.id)).toEqual(["pub_2", "pub_cuid"]);
        await searchService.records("sharma");
        expect(calls.filter((path) => path.startsWith("/publishers?"))).toEqual([
            "/publishers?q=metro&page=1&pageSize=5",
            "/publishers?q=sharma&page=1&pageSize=5",
        ]);
    });

    it("encodes the query and trims it before it goes on the wire", async () => {
        answers.set("/publishers", { items: [], total: 0, page: 1, pageSize: 5, counts: {} });
        await searchService.records("  metro walls ");
        expect(calls).toContain("/publishers?q=metro+walls&page=1&pageSize=5");
    });

    it("drops a source that fails without emptying the palette", async () => {
        answers.set("/publishers", new Error("roster down"));
        answers.set("/advertisers", {
            rows: [
                {
                    id: "adv_1",
                    name: "Amit Nayak",
                    displayId: "ADV-1909-2601",
                    contact: "9000000000",
                    email: null,
                    type: "COMPANY",
                    companyName: "Zomato",
                    gstin: null,
                    city: "Bengaluru",
                    state: null,
                    kycStatus: "VERIFIED",
                    activatedAt: "2026-01-08T00:00:00.000Z",
                    createdAt: "2026-01-08T00:00:00.000Z",
                },
            ],
        });
        const groups = await searchService.records("zomato");
        expect(groups.map((group) => group.domain)).toEqual(["advertisers"]);
        expect(groups[0].hits[0]).toMatchObject({ title: "Zomato", href: "/advertisers/adv_1" });
    });
});
