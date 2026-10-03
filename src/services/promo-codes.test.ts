import { describe, expect, it } from "vitest";
import { EMPTY_PROMO_FORM, discountLabel, draftProblems, isLiveNow, toInput, usageLabel, windowLabel } from "./promo-codes";

/**
 * PC-1 — the promo-code desk's pure half: what the dialog refuses, what it
 * sends, and how a code is printed on the table.
 */
describe("draftProblems", () => {
    it("wants a code, a positive value, a percent no more than 100, and dates in order", () => {
        expect(draftProblems({ ...EMPTY_PROMO_FORM })).toMatchObject({ code: expect.any(String), value: expect.any(String) });
        expect(draftProblems({ ...EMPTY_PROMO_FORM, code: "festive 20", value: "20" })).toEqual({});
        expect(draftProblems({ ...EMPTY_PROMO_FORM, code: "BIG", value: "150" }).value).toMatch(/100%/);
        expect(draftProblems({ ...EMPTY_PROMO_FORM, code: "FLAT", kind: "FLAT", value: "150" })).toEqual({});
        expect(draftProblems({ ...EMPTY_PROMO_FORM, code: "X!", value: "5" }).code).toMatch(/Letters/);
        expect(draftProblems({ ...EMPTY_PROMO_FORM, code: "LATE", value: "5", startsAt: "2026-11-01T00:00", endsAt: "2026-10-01T00:00" }).endsAt).toMatch(/before it starts/);
        expect(draftProblems({ ...EMPTY_PROMO_FORM, code: "CAP", value: "5", maxDiscount: "abc", usageLimit: "0" })).toMatchObject({ maxDiscount: expect.any(String), usageLimit: expect.any(String) });
    });
});

describe("toInput", () => {
    it("sends every field, empties as null, numbers as numbers, money as typed", () => {
        expect(toInput({ ...EMPTY_PROMO_FORM, code: " festive 20 ", value: "20", maxDiscount: "5000", usageLimit: "100" })).toEqual({
            code: "festive 20",
            description: null,
            kind: "PERCENT",
            value: "20",
            maxDiscount: "5000",
            minSpend: null,
            startsAt: null,
            endsAt: null,
            usageLimit: 100,
            perAdvertiserLimit: null,
            isActive: true,
        });
    });
});

describe("the labels", () => {
    it("print the discount, the window and the usage the way the table reads them", () => {
        expect(discountLabel({ kind: "PERCENT", value: "20.00", maxDiscount: "5000.00" })).toBe("20% off, up to ₹5,000.00");
        expect(discountLabel({ kind: "PERCENT", value: "12.50", maxDiscount: null })).toBe("12.5% off");
        expect(discountLabel({ kind: "FLAT", value: "500.00", maxDiscount: null })).toBe("₹500.00 off");
        expect(windowLabel({ startsAt: null, endsAt: null })).toBe("Always");
        expect(windowLabel({ startsAt: null, endsAt: "2026-11-01T00:00:00.000Z" })).toMatch(/^Until /);
        expect(usageLabel({ redemptions: 3, usageLimit: 100, perAdvertiserLimit: 1 })).toBe("3 of 100 · 1 per advertiser");
        expect(usageLabel({ redemptions: 3, usageLimit: null, perAdvertiserLimit: null })).toBe("3");
        expect(isLiveNow({ isActive: true, startsAt: null, endsAt: "2026-11-01T00:00:00.000Z" }, new Date("2026-10-12T00:00:00Z"))).toBe(true);
        expect(isLiveNow({ isActive: true, startsAt: null, endsAt: "2026-10-01T00:00:00.000Z" }, new Date("2026-10-12T00:00:00Z"))).toBe(false);
        expect(isLiveNow({ isActive: false, startsAt: null, endsAt: null })).toBe(false);
    });
});
