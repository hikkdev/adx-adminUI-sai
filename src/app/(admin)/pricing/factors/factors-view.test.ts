import { describe, expect, it } from "vitest";
import { validValue } from "./factors-view";

/**
 * What the form will let an operator save.
 *
 * This is pinned because the form was stricter than the server and nobody could
 * tell. A base adjustment of -200 — "this stretch of road is worth two hundred
 * less a day" — left the Save button disabled with no message beside it, so the
 * operator could only conclude the number was wrong. The server had accepted
 * negatives all along.
 *
 * A disabled button explains nothing, which is what made it worth a test: the
 * failure had no symptom to search for.
 */

describe("a multiplier", () => {
    it("accepts a discount, which is what a multiplier below 1 means", () => {
        expect(validValue("MULTIPLIER", "0.85")).toBe(true);
    });

    it("accepts a premium", () => {
        expect(validValue("MULTIPLIER", "1.4")).toBe(true);
    });

    /** Zero prices the listing at nothing; a negative inverts it. */
    it("refuses zero and below", () => {
        expect(validValue("MULTIPLIER", "0")).toBe(false);
        expect(validValue("MULTIPLIER", "-1.2")).toBe(false);
    });
});

describe("a base adjustment", () => {
    it("accepts a negative rupee amount", () => {
        expect(validValue("BASE_ADJUST", "-200")).toBe(true);
    });

    it("accepts a positive one", () => {
        expect(validValue("BASE_ADJUST", "350.50")).toBe(true);
    });

    /** Adjusting by nothing is not an adjustment. */
    it("refuses zero", () => {
        expect(validValue("BASE_ADJUST", "0")).toBe(false);
    });
});

describe("what neither kind accepts", () => {
    it("refuses an empty box rather than reading it as zero", () => {
        expect(validValue("MULTIPLIER", "")).toBe(false);
        expect(validValue("BASE_ADJUST", "   ")).toBe(false);
    });

    it("refuses anything that is not a number", () => {
        expect(validValue("BASE_ADJUST", "two hundred")).toBe(false);
        expect(validValue("BASE_ADJUST", "1,200")).toBe(false);
    });
});
