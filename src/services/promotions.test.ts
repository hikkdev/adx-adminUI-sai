import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LM-1: the paid-placements desk — its labels and editor rules, and the
 * doors every action takes.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { ...actual.api, get: record("GET"), post: record("POST"), patch: record("PATCH") } };
});

import { beforeStart, boostListingLabel, buyerLabel, ctrLabel, pricingProblems, promotionsService, runLabel, withGst } from "./promotions";

beforeEach(() => {
    calls.length = 0;
});

describe("the labels", () => {
    it("prints a run, a click-through, a buyer and a listing", () => {
        expect(runLabel({ startDate: "2026-10-12T00:00:00.000Z", endDate: "2026-10-18T00:00:00.000Z", days: 7 })).toBe("12 Oct – 18 Oct 2026 · 7 days");
        expect(runLabel({ startDate: "2026-10-12T00:00:00.000Z", endDate: "2026-10-12T00:00:00.000Z" })).toMatch(/1 day$/);
        expect(ctrLabel(0, 0)).toBe("—");
        expect(ctrLabel(2000, 38)).toBe("1.9%");
        expect(buyerLabel({ advertiserId: "adv_1", advertiser: { id: "adv_1", name: "Acme", displayId: "ADV-1305-2601" } })).toBe("Acme · ADV-1305-2601");
        expect(buyerLabel({ advertiserId: "adv_1", advertiser: null })).toBe("adv_1");
        expect(boostListingLabel({ listingId: "l1", listing: { id: "l1", title: "MG Road hoarding", displayId: "LST-0101-2601" } })).toBe("MG Road hoarding · LST-0101-2601");
    });

    it("says whether a cancel still refunds — only before the first day", () => {
        const now = new Date("2026-10-12T10:00:00Z");
        expect(beforeStart({ startDate: "2026-10-13T00:00:00.000Z" }, now)).toBe(true);
        expect(beforeStart({ startDate: "2026-10-12T00:00:00.000Z" }, now)).toBe(false);
    });
});

describe("the pricing editors", () => {
    it("want a positive rate in rupees and whole numbers of at least one", () => {
        expect(pricingProblems({ ratePerDay: "1500", maxConcurrent: "3", minDays: "1" })).toEqual({});
        expect(pricingProblems({ ratePerDay: "15.555", maxConcurrent: "0", minDays: "x" })).toEqual({
            ratePerDay: expect.any(String),
            maxConcurrent: expect.any(String),
            minDays: expect.any(String),
        });
        expect(pricingProblems({ ratePerDay: "0", maxConcurrent: "1", minDays: "1" }).ratePerDay).toBe("More than zero.");
    });

    it("adds 18% GST to a day's rate", () => {
        expect(withGst("1500")).toBe("1770.00");
        expect(withGst("999.99")).toBe("1179.99");
        expect(withGst("abc")).toBeNull();
    });
});

describe("the routes", () => {
    it("takes each action to its own door", async () => {
        await promotionsService.slots();
        await promotionsService.createSlot({ key: "WEB_LISTING_SIDEBAR", label: "Listing sidebar", spec: "AD_SIDEBAR", ratePerDay: "1500" });
        await promotionsService.updateSlot("slot_1", { isActive: false });
        await promotionsService.placements();
        await promotionsService.updatePlacement("SEARCH_TOP", { ratePerDay: "900" });
        await promotionsService.ads({ status: "PENDING_REVIEW", slotKey: "WEB_LISTING_SIDEBAR", q: "acme" });
        await promotionsService.ad("adb_1");
        await promotionsService.approveAd("adb_1");
        await promotionsService.rejectAd("adb_1", "Artwork unreadable");
        await promotionsService.boosts({ status: "LIVE" });
        await promotionsService.cancelBoost("bst_1", "Listing withdrawn", true);
        await promotionsService.stats("2026-09-01", "2026-09-30");
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /promotions/admin/slots",
            "POST /promotions/admin/slots",
            "PATCH /promotions/admin/slots/slot_1",
            "GET /promotions/admin/placements",
            "PATCH /promotions/admin/placements/SEARCH_TOP",
            "GET /promotions/admin/ads?status=PENDING_REVIEW&slotKey=WEB_LISTING_SIDEBAR&q=acme",
            "GET /promotions/ads/adb_1",
            "POST /promotions/admin/ads/adb_1/approve",
            "POST /promotions/admin/ads/adb_1/reject",
            "GET /promotions/admin/boosts?status=LIVE",
            "POST /promotions/admin/boosts/bst_1/cancel",
            "GET /promotions/admin/stats?from=2026-09-01&to=2026-09-30",
        ]);
        expect(calls[8]!.body).toEqual({ reason: "Artwork unreadable" });
        expect(calls[10]!.body).toEqual({ reason: "Listing withdrawn", refund: true });
    });
});
