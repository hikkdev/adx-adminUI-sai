import { describe, expect, it, vi } from "vitest";

/**
 * The catalogue editor's reads and writes (E7-3).
 *
 * What this pins: the console asks for the retired rows too, a retired row
 * shapes as inactive with its sort order, reactivating is one PATCH with
 * `isActive: true` on the row's own route, and the rows come back in the
 * order the apps draw them.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        if (method === "GET") {
            return {
                packages: [
                    { id: "pkg_pro", tier: "PRO", name: "Pro", pricePerMonth: "49999.00", description: null, isPopular: false, entitlements: {}, isActive: false, sortOrder: 3 },
                    { id: "pkg_starter", tier: "STARTER", name: "Starter", pricePerMonth: "9999.00", description: null, isPopular: false, entitlements: {}, isActive: true, sortOrder: 1 },
                ],
                addOns: [
                    { id: "ao_2", code: "RUSH_PRINT", name: "Rush print", pricePerMonth: "1500.00", description: null, isActive: false, sortOrder: 2 },
                    { id: "ao_1", code: "PREMIUM_ANALYTICS", name: "Premium analytics", pricePerMonth: "2500.00", description: null, isActive: true, sortOrder: 1 },
                ],
            };
        }
        return { id: "ao_2", code: "RUSH_PRINT", name: "Rush print", pricePerMonth: "1500.00", description: null, isActive: true, sortOrder: 2 };
    };
    return { ...actual, api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import { bySortOrder, catalogueService, LIVE_CHAT_ENTITLEMENT, parseSortOrder, planHasLiveChat } from "./packages";

describe("the catalogue with its retired rows", () => {
    it("asks for the inactive rows, marks them inactive, and orders everything by sortOrder", async () => {
        calls.length = 0;
        const catalogue = await catalogueService.catalogue();
        expect(calls).toEqual([{ method: "GET", path: "/packages/catalogue?includeInactive=true", body: undefined }]);

        expect(catalogue.plans.map((plan) => [plan.tier, plan.active, plan.sortOrder])).toEqual([
            ["STARTER", true, 1],
            ["PRO", false, 3],
            // No row at all: the placeholder, so the tier can still be switched on.
            ["GROWTH", false, null],
        ]);
        expect(catalogue.addOns.map((addOn) => [addOn.code, addOn.active, addOn.sortOrder])).toEqual([
            ["PREMIUM_ANALYTICS", true, 1],
            ["RUSH_PRINT", false, 2],
        ]);
    });

    it("reactivates a retired add-on with one PATCH of isActive: true, and moves its sort order the same way", async () => {
        calls.length = 0;
        const reactivated = await catalogueService.updateAddOn("RUSH_PRINT", { isActive: true });
        expect(calls).toEqual([{ method: "PATCH", path: "/packages/catalogue/add-ons/RUSH_PRINT", body: { isActive: true } }]);
        expect(reactivated.active).toBe(true);

        calls.length = 0;
        await catalogueService.updatePlan("PRO", { isActive: true });
        await catalogueService.updatePlan("PRO", { sortOrder: 2 });
        expect(calls.map((call) => call.body)).toEqual([{ isActive: true }, { sortOrder: 2 }]);
        expect(calls.every((call) => call.method === "PATCH" && call.path === "/packages/catalogue/plans/PRO")).toBe(true);
    });

    it("keeps the API's order among rows without a sort order, and takes only a whole number in bounds", () => {
        const rows = [
            { code: "A", sortOrder: null },
            { code: "B", sortOrder: 5 },
            { code: "C", sortOrder: null },
            { code: "D", sortOrder: 0 },
        ];
        expect(bySortOrder(rows).map((row) => row.code)).toEqual(["D", "B", "A", "C"]);
        expect(parseSortOrder("7")).toBe(7);
        expect(parseSortOrder(" 100 ")).toBe(100);
        expect(parseSortOrder("101")).toBeNull();
        expect(parseSortOrder("-1")).toBeNull();
        expect(parseSortOrder("1.5")).toBeNull();
        expect(parseSortOrder("")).toBeNull();
    });
});

/**
 * Lot I: the one entitlement that is read rather than printed.
 *
 * Every other key on a plan is copy. `liveChat` decides whether an advertiser
 * on an active sale of that plan can open a live chat, so the default matters:
 * a plan that has never been edited must be entitled, and only an explicit
 * `false` takes it away.
 */
describe("the live-chat entitlement", () => {
    it("treats a plan that says nothing as entitled", () => {
        expect(planHasLiveChat({})).toBe(true);
        expect(planHasLiveChat({ campaignsPerMonth: 10 })).toBe(true);
    });

    it("is taken away only by an explicit false", () => {
        expect(planHasLiveChat({ [LIVE_CHAT_ENTITLEMENT]: false })).toBe(false);
        expect(planHasLiveChat({ [LIVE_CHAT_ENTITLEMENT]: true })).toBe(true);
    });

    it("writes the whole entitlements object, so switching it does not drop the other promises", async () => {
        calls.length = 0;
        await catalogueService.updatePlan("PRO", { entitlements: { campaignsPerMonth: 10, [LIVE_CHAT_ENTITLEMENT]: false } });
        expect(calls).toEqual([
            { method: "PATCH", path: "/packages/catalogue/plans/PRO", body: { entitlements: { campaignsPerMonth: 10, liveChat: false } } },
        ]);
    });
});
