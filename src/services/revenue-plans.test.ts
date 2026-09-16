import { describe, expect, it, vi } from "vitest";

/**
 * The publisher plans and the order book — Lot J-C over Lot J-B1.
 *
 * What this pins: the console asks for the retired plans too and prints the
 * wire's fraction as a percentage; the editor's PATCH goes to the tier's
 * own route with the body it was given and nothing more; the orders facet
 * path sends only what was asked for; a subscription's state follows its
 * dates; a row from before the source column shapes as a grant.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const plan = (over: Record<string, unknown>) => ({
        id: "plan_1",
        tier: "STANDARD",
        name: "Standard",
        pricePerMonth: "999.00",
        ratePct: "0.1400",
        description: null,
        isPopular: false,
        entitlements: { liveChat: false, prioritySupport: false, featuredListings: 0, analytics: "BASIC", bookingReportPdf: true },
        enforced: false,
        enforcedKeys: ["liveChat"],
        isActive: true,
        sortOrder: 1,
        ...over,
    });
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        if (method === "GET" && path.startsWith("/revenue/plans")) {
            return [
                plan({ id: "plan_3", tier: "PRO", name: "Pro", pricePerMonth: "4999.00", ratePct: "0.1000", isActive: false, sortOrder: 3 }),
                plan({}),
                plan({ id: "plan_2", tier: "PLUS", name: "Plus", pricePerMonth: "2499.00", ratePct: "0.1250", isPopular: true, sortOrder: 2 }),
            ];
        }
        if (method === "GET" && path.startsWith("/revenue/subscription-orders")) {
            return { items: [], total: 0, page: 1, pageSize: 25, counts: { PAID: 3 } };
        }
        if (method === "GET" && path.startsWith("/revenue/subscriptions")) {
            return {
                items: [
                    {
                        id: "sub_1",
                        publisher: { id: "pub_1", name: "Metro Hoardings", displayId: "PUB-0001" },
                        tier: "PLUS",
                        planName: "Plus",
                        ratePct: "0.1250",
                        pricePerMonth: "2499.00",
                        startsAt: "2026-09-01T00:00:00.000Z",
                        endsAt: null,
                        source: "SELF_SERVICE",
                        autoRenew: true,
                        state: "RUNNING",
                    },
                ],
                total: 1,
                page: 1,
                pageSize: 25,
                counts: { RUNNING: 1 },
            };
        }
        return plan({ pricePerMonth: "1299.00" });
    };
    return { ...actual, api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import {
    fractionToPct,
    graceUntil,
    pctToFraction,
    revenueService,
    shapeSubscription,
    subscriptionOrdersPath,
    subscriptionPublisherLabel,
    subscriptionState,
    subscriptionsPath,
} from "./revenue";

describe("the plans", () => {
    it("asks for the retired rows, prints the rate as a percentage, and orders the cards", async () => {
        calls.length = 0;
        const plans = await revenueService.plans();
        expect(calls).toEqual([{ method: "GET", path: "/revenue/plans?includeInactive=true", body: undefined }]);
        expect(plans.map((plan) => [plan.tier, plan.commissionPct, plan.active])).toEqual([
            ["STANDARD", "14", true],
            ["PLUS", "12.5", true],
            ["PRO", "10", false],
        ]);
        expect(plans[0].enforcedKeys).toEqual(["liveChat"]);
        expect(plans[0].entitlements).toEqual({ liveChat: false, prioritySupport: false, featuredListings: 0, analytics: "BASIC", bookingReportPdf: true });
    });

    it("PATCHes the tier's own route with the diff it was given and nothing else", async () => {
        calls.length = 0;
        const plan = await revenueService.updatePlan("STANDARD", { pricePerMonth: "1299" });
        expect(calls).toEqual([{ method: "PATCH", path: "/revenue/plans/STANDARD", body: { pricePerMonth: "1299" } }]);
        expect(plan.pricePerMonth).toBe("1299.00");
    });

    it("converts between the wire's fraction and the card's percentage without drift", () => {
        expect(fractionToPct("0.1250")).toBe("12.5");
        expect(fractionToPct("0.14")).toBe("14");
        expect(fractionToPct("0.1")).toBe("10");
        expect(fractionToPct("0.0525")).toBe("5.25");
        expect(pctToFraction("12.5")).toBe("0.1250");
        expect(pctToFraction("14")).toBe("0.1400");
        expect(pctToFraction("5.25")).toBe("0.0525");
        expect(pctToFraction("101")).toBeNull();
        expect(pctToFraction("12.345")).toBeNull();
        expect(pctToFraction("abc")).toBeNull();
    });
});

describe("the order book", () => {
    it("sends only the facets that were asked for, the page only past the first", () => {
        expect(subscriptionOrdersPath()).toBe("/revenue/subscription-orders?pageSize=25");
        expect(subscriptionOrdersPath({ status: ["PAID"], page: 1, pageSize: 25 })).toBe("/revenue/subscription-orders?status=PAID&pageSize=25");
        expect(subscriptionOrdersPath({ q: "SUB-2026", status: ["PENDING_PAYMENT", "EXPIRED"], publisherId: "pub_1", page: 3, pageSize: 10 })).toBe(
            "/revenue/subscription-orders?q=SUB-2026&status=PENDING_PAYMENT%2CEXPIRED&publisherId=pub_1&page=3&pageSize=10",
        );
    });

    it("fills every status count, so a chip the server did not mention says zero", async () => {
        calls.length = 0;
        const page = await revenueService.subscriptionOrders({ status: ["PAID"] });
        expect(calls[0].path).toBe("/revenue/subscription-orders?status=PAID&pageSize=25");
        expect(page.counts).toEqual({ PENDING_PAYMENT: 0, PAID: 3, CANCELLED: 0, EXPIRED: 0 });
    });
});

describe("a subscription", () => {
    const now = new Date("2026-09-14T10:00:00.000Z");

    it("is upcoming before it starts, running while it does, ended once it has", () => {
        expect(subscriptionState({ startsAt: "2026-10-01T00:00:00.000Z", endsAt: null }, now)).toBe("UPCOMING");
        expect(subscriptionState({ startsAt: "2026-09-01T00:00:00.000Z", endsAt: null }, now)).toBe("RUNNING");
        expect(subscriptionState({ startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-10-01T00:00:00.000Z" }, now)).toBe("RUNNING");
        expect(subscriptionState({ startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" }, now)).toBe("ENDED");
    });

    it("shapes a row from before the source column as the console's own grant, its state from the dates", () => {
        const row = shapeSubscription({ id: "sub_1", publisherId: "pub_1", tier: "PLUS", ratePct: "0.125", pricePerMonth: "2499", startsAt: "2026-09-01T00:00:00.000Z", endsAt: null });
        expect(row.source).toBe("ADMIN_GRANT");
        expect(row.planName).toBeNull();
        expect(row.autoRenew).toBe(false);
        expect(row.state).toBe("RUNNING");
        expect(row.publisherName).toBeNull();
        expect(subscriptionPublisherLabel(row)).toBe("pub_1");
        expect(shapeSubscription({ ...row, source: "SELF_SERVICE", planName: "Plus" }).source).toBe("SELF_SERVICE");
    });

    /* Lot J2 (d): the list contract. */
    it("reads the book as a page: the facets sent only when asked, the publisher named from the row, every count filled", async () => {
        expect(subscriptionsPath()).toBe("/revenue/subscriptions?pageSize=25");
        expect(subscriptionsPath({ state: "ENDED", q: "metro", publisherId: "pub_1", page: 2, pageSize: 25 })).toBe(
            "/revenue/subscriptions?state=ENDED&q=metro&publisherId=pub_1&page=2&pageSize=25",
        );
        calls.length = 0;
        const page = await revenueService.subscriptionsPage({ state: "RUNNING" });
        expect(calls[0].path).toBe("/revenue/subscriptions?state=RUNNING&pageSize=25");
        expect(page.counts).toEqual({ RUNNING: 1, UPCOMING: 0, ENDED: 0 });
        const row = page.items[0];
        expect(row.publisherId).toBe("pub_1");
        expect(subscriptionPublisherLabel(row)).toBe("Metro Hoardings · PUB-0001");
        expect(row.autoRenew).toBe(true);
        expect(row.state).toBe("RUNNING");
    });

    it("reads one publisher's whole set through the same page, at the server's largest size", async () => {
        calls.length = 0;
        const rows = await revenueService.subscriptions("pub_1");
        expect(calls[0].path).toBe("/revenue/subscriptions?publisherId=pub_1&pageSize=100");
        expect(rows).toHaveLength(1);
    });

    it("is in grace only once ended, inside the policy's days, and with a grace at all", () => {
        const ended = { startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-09-10T00:00:00.000Z" };
        expect(graceUntil(ended, 7, now)?.toISOString()).toBe("2026-09-17T00:00:00.000Z");
        expect(graceUntil(ended, 3, now)).toBeNull();
        expect(graceUntil(ended, 0, now)).toBeNull();
        expect(graceUntil({ startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-10-01T00:00:00.000Z" }, 7, now)).toBeNull();
    });
});
