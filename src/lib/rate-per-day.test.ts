import { describe, expect, it } from "vitest";
import { areaSqFtFrom, ratePerDayFrom } from "./rate-per-day";

/**
 * The arithmetic the server also does.
 *
 * This module exists because the form shows a publisher what their price works
 * out to per day, and feeds that same figure to the market indicator. If it
 * disagrees with the server by a rupee, a publisher decides against a rate their
 * listing will not have.
 *
 * The cases below are the ones where a float implementation drifted, and they
 * are pinned identically in the backend's own suite
 * (`ADX-backendv1/src/modules/listings/__tests__/listing-pricing.test.ts`).
 * If one side changes, both should — a diff on either block is the warning.
 */

describe("what the server also computes", () => {
    it("rounds the area once, before a per-square-foot rate multiplies it", () => {
        // 3.33 x 3.33 = 11.0889, rounded to 11.09 and *then* multiplied.
        // Rounding at the end instead gives 110889.00 — eleven rupees adrift.
        const area = areaSqFtFrom("3.33", "3.33");
        expect(area).toBe("11.09");
        expect(ratePerDayFrom({ unit: "PER_SQFT_PER_DAY", basePrice: "10000", areaSqFt: area })).toEqual(
            { rate: "110900.00" }
        );
    });

    it("rounds a division on the exact value, not on a binary double", () => {
        // 100.05 / 30 is exactly 3.335 and rounds up. As a double it is
        // 3.3349999999999995 and rounds down.
        expect(ratePerDayFrom({ unit: "PER_MONTH", basePrice: "100.05" })).toEqual({ rate: "3.34" });
    });

    it("converts the units a publisher actually quotes in", () => {
        expect(ratePerDayFrom({ unit: "PER_DAY", basePrice: "2500" })).toEqual({ rate: "2500.00" });
        expect(ratePerDayFrom({ unit: "PER_WEEK", basePrice: "7000" })).toEqual({ rate: "1000.00" });
        expect(ratePerDayFrom({ unit: "PER_MONTH", basePrice: "36000" })).toEqual({ rate: "1200.00" });
        expect(
            ratePerDayFrom({ unit: "PER_SQFT_PER_MONTH", basePrice: "150", areaSqFt: "24.00" })
        ).toEqual({ rate: "120.00" });
    });
});

describe("what it refuses", () => {
    it("will not price per square foot without an area", () => {
        expect(ratePerDayFrom({ unit: "PER_SQFT_PER_DAY", basePrice: "100" })).toEqual({
            rate: null,
            problem: "NEEDS_AREA",
        });
    });

    /** A per-month price under thirty paise is nothing a day. */
    it("reports a price that rounds away to nothing", () => {
        expect(ratePerDayFrom({ unit: "PER_MONTH", basePrice: "0.01" })).toEqual({
            rate: null,
            problem: "ROUNDS_TO_ZERO",
        });
    });

    /** Two individually reasonable numbers can exceed Decimal(14,2). */
    it("reports a figure larger than the column can hold", () => {
        expect(
            ratePerDayFrom({
                unit: "PER_SQFT_PER_DAY",
                basePrice: "999999999999",
                areaSqFt: "1000",
            })
        ).toEqual({ rate: null, problem: "TOO_LARGE" });
    });

    it("refuses an area larger than the column can hold", () => {
        expect(areaSqFtFrom("9999.99", "9999.99")).not.toBeNull();
        expect(areaSqFtFrom("99999", "99999")).toBeNull();
    });

    it("treats a malformed amount as no answer rather than zero", () => {
        expect(ratePerDayFrom({ unit: "PER_DAY", basePrice: "" }).rate).toBeNull();
        expect(ratePerDayFrom({ unit: "PER_DAY", basePrice: "1,200" }).rate).toBeNull();
        expect(ratePerDayFrom({ unit: "PER_DAY", basePrice: "-5" }).rate).toBeNull();
    });
});
