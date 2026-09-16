import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/lib/api-client", () => ({
    api: { get: (...args: unknown[]) => get(...args) },
}));
vi.mock("@/lib/api-config", () => ({
    isLive: () => true,
}));

import {
    countDelta,
    currentMonthIST,
    foldMonthSeries,
    moneyDelta,
    monthLabel,
    monthsEndingAt,
    overviewService,
    overviewTiles,
    pointDelta,
    shiftMonth,
    type MonthOverview,
} from "./overview";

/**
 * The console's month in numbers, as the dashboard and the analytics page
 * read it.
 *
 * What this file pins: money stays the decimal string the API sent all the
 * way to the tile, the six-month window is six Indian calendar months in
 * order, the fold leaves a gap where a month did not answer rather than
 * drawing zero, and a month is fetched once per minute however many screens
 * ask for it.
 */

const overview = (month: string, over: Partial<MonthOverview> = {}): MonthOverview => ({
    month,
    window: { start: `${month}-01T00:00:00.000Z`, end: `${month}-30T18:30:00.000Z` },
    bookingsAuthorised: "180000.00",
    gmvRecognised: "1842300.00",
    gmvSource: "CAMPAIGN_SPEND",
    platformRevenue: "232129.80",
    takeRatePct: "12.60",
    publisherEarnings: "1500000.00",
    activeCampaigns: 247,
    newPublishers: 64,
    newAdvertisers: 12,
    kycPending: 23,
    bookingsCount: 265,
    averageBookingValue: "68000.00",
    ...over,
});

describe("months", () => {
    it("names the month it is now in India, not in UTC", () => {
        // 30 Sep 2026 20:00 UTC is 1 Oct 01:30 IST.
        expect(currentMonthIST(new Date("2026-09-30T20:00:00.000Z"))).toBe("2026-10");
        expect(currentMonthIST(new Date("2026-09-30T18:00:00.000Z"))).toBe("2026-09");
    });

    it("walks backwards across a year boundary", () => {
        expect(shiftMonth("2026-01", -1)).toBe("2025-12");
        expect(shiftMonth("2026-12", 1)).toBe("2027-01");
        expect(shiftMonth("2026-09", -12)).toBe("2025-09");
    });

    it("answers six months ending at the anchor, oldest first", () => {
        expect(monthsEndingAt("2026-02", 6)).toEqual([
            "2025-09",
            "2025-10",
            "2025-11",
            "2025-12",
            "2026-01",
            "2026-02",
        ]);
        expect(monthsEndingAt("2026-09", 1)).toEqual(["2026-09"]);
    });

    it("labels a month for a person", () => {
        expect(monthLabel("2026-09")).toBe("Sep 2026");
        expect(monthLabel("garbage")).toBe("garbage");
    });
});

describe("deltas", () => {
    it("compares money in paise and prints one decimal", () => {
        expect(moneyDelta("1842300.00", "1505000.00")).toEqual({ text: "+22.4%", tone: "positive" });
        expect(moneyDelta("900.00", "1000.00")).toEqual({ text: "-10%", tone: "negative" });
        expect(moneyDelta("1000.00", "1000.00")).toEqual({ text: "0%", tone: "neutral" });
    });

    it("refuses a percentage of nothing", () => {
        expect(moneyDelta("1000.00", "0.00")).toBeNull();
        expect(moneyDelta("1000.00", "")).toBeNull();
    });

    it("prints a count's difference and a rate's points", () => {
        expect(countDelta(247, 229)).toEqual({ text: "+18", tone: "positive" });
        expect(countDelta(10, 10)).toEqual({ text: "0", tone: "neutral" });
        expect(pointDelta("12.60", "11.80")).toEqual({ text: "+0.8pt", tone: "positive" });
        expect(pointDelta("10.00", "12.10")).toEqual({ text: "-2.1pt", tone: "negative" });
    });
});

describe("the dashboard's tiles", () => {
    it("prints every money figure from the string the API sent, paise included", () => {
        const tiles = overviewTiles(overview("2026-09"), overview("2026-08", { gmvRecognised: "1505000.00" }));
        const byId = Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
        expect(byId.bookings.value).toBe("₹1,80,000.00");
        expect(byId.gmv.value).toBe("₹18,42,300.00");
        expect(byId.gmv.delta).toBe("+22.4%");
        expect(byId.take.value).toBe("12.6%");
        expect(byId.earnings.value).toBe("₹15,00,000.00");
        expect(byId.campaigns.value).toBe("247");
        expect(byId.kyc.value).toBe("23");
        expect(byId.kyc.delta).toBeUndefined();
    });

    it("says where the GMV came from when there is no spend leg yet", () => {
        const tiles = overviewTiles(overview("2026-09", { gmvSource: "ACCRUAL_GROSS" }), null);
        const gmv = tiles.find((tile) => tile.id === "gmv");
        expect(gmv?.hint).toMatch(/accrual/);
        expect(gmv?.delta).toBeUndefined();
    });
});

describe("foldMonthSeries", () => {
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

    it("keeps the months in the order asked, whatever order the API answered", () => {
        const series = foldMonthSeries(months, [
            overview("2026-09"),
            overview("2026-04"),
            overview("2026-07"),
            overview("2026-05"),
            overview("2026-06"),
            overview("2026-08"),
        ]);
        expect(series.map((point) => point.month)).toEqual(months);
        expect(series.map((point) => point.label)).toEqual(["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    });

    it("leaves a gap for a month that did not answer rather than drawing zero", () => {
        const series = foldMonthSeries(months, [
            overview("2026-04"),
            null,
            overview("2026-06"),
            overview("2026-07"),
            overview("2026-08"),
            overview("2026-09"),
        ]);
        expect(series).toHaveLength(5);
        expect(series.map((point) => point.month)).not.toContain("2026-05");
    });

    it("carries the strings for printing and builds numbers only for the axis", () => {
        const [point] = foldMonthSeries(["2026-09"], [overview("2026-09")]);
        expect(point.gmvRecognised).toBe("1842300.00");
        expect(point.bookingsAuthorised).toBe("180000.00");
        expect(point.takeRatePct).toBe("12.60");
        expect(point.gmv).toBe(1842300);
        expect(point.bookings).toBe(180000);
        expect(point.takeRate).toBe(12.6);
    });

    it("carries E6's bookings count and average for the dashboard's line, and nothing invented for a month without them", () => {
        const [point] = foldMonthSeries(["2026-09"], [overview("2026-09")]);
        expect(point.bookingsCount).toBe(265);
        expect(point.averageBookingValue).toBe("68000.00");
        const legacy = { ...overview("2026-08") } as Partial<MonthOverview>;
        delete legacy.bookingsCount;
        delete legacy.averageBookingValue;
        const [older] = foldMonthSeries(["2026-08"], [legacy as MonthOverview]);
        expect(older.bookingsCount).toBe(0);
        expect(older.averageBookingValue).toBe("0.00");
    });
});

describe("overviewService", () => {
    beforeEach(() => {
        get.mockReset();
        overviewService.invalidate();
    });
    afterEach(() => {
        overviewService.invalidate();
    });

    it("asks for the month on the wire as YYYY-MM", async () => {
        get.mockResolvedValueOnce(overview("2026-09"));
        await overviewService.month("2026-09");
        expect(get).toHaveBeenCalledWith("/admin/overview?month=2026-09");
    });

    it("fetches a month once per minute however many screens ask", async () => {
        get.mockResolvedValue(overview("2026-09"));
        await overviewService.month("2026-09", 1_000);
        await overviewService.month("2026-09", 30_000);
        expect(get).toHaveBeenCalledTimes(1);
        await overviewService.month("2026-09", 70_000);
        expect(get).toHaveBeenCalledTimes(2);
    });

    it("forgets a month whose request failed so the next caller asks again", async () => {
        get.mockRejectedValueOnce(new Error("down"));
        await expect(overviewService.month("2026-09")).rejects.toThrow("down");
        get.mockResolvedValueOnce(overview("2026-09"));
        await expect(overviewService.month("2026-09")).resolves.toMatchObject({ month: "2026-09" });
        expect(get).toHaveBeenCalledTimes(2);
    });

    it("asks E6's series with from and to, and drops each month it answered into the per-month cache", async () => {
        const months = monthsEndingAt("2026-09", 12);
        get.mockResolvedValueOnce({ from: months[0], to: "2026-09", months: months.map((month) => overview(month)) });
        const series = await overviewService.series(months[0], "2026-09", 5_000);
        expect(get).toHaveBeenCalledWith("/admin/overview?from=2025-10&to=2026-09");
        expect(series.months.map((month) => month.month)).toEqual(months);
        // The picker stepping to a month the series already drew asks nothing.
        await overviewService.month("2026-06", 10_000);
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("answers six months in order, with null where one failed, without failing the set", async () => {
        get.mockImplementation((path: string) => {
            const month = path.slice(-7);
            return month === "2026-06"
                ? Promise.reject(new Error("recalculating"))
                : Promise.resolve(overview(month));
        });
        const months = monthsEndingAt("2026-09", 6);
        const answered = await overviewService.months(months);
        expect(answered.map((item) => item?.month ?? null)).toEqual([
            "2026-04",
            "2026-05",
            null,
            "2026-07",
            "2026-08",
            "2026-09",
        ]);
        expect(get).toHaveBeenCalledTimes(6);
    });
});
