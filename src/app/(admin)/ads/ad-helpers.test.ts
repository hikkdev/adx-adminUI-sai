import { describe, expect, it } from "vitest";
import { artworkBox, citiesLabel, slotSize } from "./ad-parts";
import { fillLabel, revenueSplit, slotFill } from "./overview-numbers";
import { defaultWindow, isoDay, validRange } from "./performance-view";

/** LM-1: the ads desk's small pure helpers — the artwork's box, the cities line, the default window. */
describe("the artwork box", () => {
    it("draws the slot's own shape, scaled to fit", () => {
        expect(artworkBox({ width: 600, height: 750 }, 320)).toEqual({ width: 320, height: 400 });
        expect(artworkBox({ width: 1456, height: 180 }, 320)).toEqual({ width: 320, height: 40 });
        expect(artworkBox({ width: 200, height: 100 }, 320)).toEqual({ width: 200, height: 100 });
        expect(artworkBox(null, 320)).toEqual({ width: 320, height: 240 });
    });

    it("takes the slot's spec size first, the picture's own size after", () => {
        expect(slotSize({ specDetail: { key: "AD_SIDEBAR", label: "Ad — sidebar", width: 600, height: 750 } }, { url: "x", width: 10, height: 10, altText: null })).toEqual({ width: 600, height: 750 });
        expect(slotSize(undefined, { url: "x", width: 1600, height: 480, altText: null })).toEqual({ width: 1600, height: 480 });
        expect(slotSize(undefined, null)).toBeNull();
    });
});

describe("the cities line", () => {
    it("names the cities when it has them, counts them when not, and says everywhere for none", () => {
        expect(citiesLabel({ cityIds: [], cities: undefined })).toBe("Everywhere");
        expect(citiesLabel({ cityIds: ["a", "b"] })).toBe("2 cities");
        expect(citiesLabel({ cityIds: ["a"], cities: [{ id: "a", name: "Pune" }] })).toBe("Pune");
    });
});

describe("the performance window", () => {
    it("is the last thirty days, today included, in whole UTC days", () => {
        expect(defaultWindow(new Date("2026-09-27T20:00:00Z"))).toEqual({ from: "2026-08-29", to: "2026-09-27" });
        expect(isoDay(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
    });
});

describe("the window check", () => {
    it("wants two whole days, the end on or after the start", () => {
        expect(validRange({ from: "2026-09-01", to: "2026-09-27" })).toBe(true);
        expect(validRange({ from: "2026-09-27", to: "2026-09-27" })).toBe(true);
        expect(validRange({ from: "2026-09-28", to: "2026-09-27" })).toBe(false);
        expect(validRange({ from: "", to: "2026-09-27" })).toBe(false);
    });
});

/** AS-1: the Overview's own numbers. */
describe("how full a slot is", () => {
    const booked = [2, 3, 3, 0, 0, 0, 0, 3];
    const days = ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((date, index) => ({ date, booked: booked[index], left: 0 }));

    it("is today's holds of the slot's capacity, and the week's from today", () => {
        const fill = slotFill({ days, maxConcurrent: 3 }, "2026-09-27");
        expect(fill.today).toEqual({ booked: 2, capacity: 3, ratio: 2 / 3 });
        /* Seven days from today — the eighth is not this week. */
        expect(fill.week).toEqual({ booked: 8, capacity: 21, ratio: 8 / 21 });
    });

    it("skips days before today and reads the days in date order", () => {
        const fill = slotFill({ days: [...days].reverse(), maxConcurrent: 3 }, "2026-09-28");
        expect(fill.today.booked).toBe(3);
        expect(fill.week.capacity).toBe(21);
        expect(fill.week.booked).toBe(9);
    });

    it("has nothing to fill without capacity or days", () => {
        expect(slotFill({ days: [], maxConcurrent: 3 }, "2026-09-27").today).toEqual({ booked: 0, capacity: 0, ratio: null });
        expect(slotFill({ days, maxConcurrent: 0 }, "2026-09-27").week.ratio).toBeNull();
    });

    it("reads as booked of capacity and a percent", () => {
        expect(fillLabel({ booked: 2, capacity: 3, ratio: 2 / 3 })).toBe("2 of 3 · 67%");
        expect(fillLabel({ booked: 0, capacity: 0, ratio: null })).toBe("—");
    });
});

describe("the revenue split", () => {
    it("adds the slots' rows as ads and the placements' rows as sponsored, to the paisa", () => {
        const split = revenueSplit({
            bySlot: [
                { slotKey: "A", label: "A", bookings: 1, revenue: "1500.10", impressions: 0, clicks: 0, ctr: 0 },
                { slotKey: "B", label: "B", bookings: 1, revenue: "0.20", impressions: 0, clicks: 0, ctr: 0 },
            ],
            byPlacement: [{ placement: "SEARCH_TOP", bookings: 1, revenue: "250.00", impressions: 0, clicks: 0, ctr: 0 }],
        });
        expect(split).toEqual({ ads: "1500.30", sponsored: "250.00" });
        expect(revenueSplit({ bySlot: [], byPlacement: [] })).toEqual({ ads: "0.00", sponsored: "0.00" });
    });
});
