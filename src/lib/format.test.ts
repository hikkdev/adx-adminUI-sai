import { describe, expect, it } from "vitest";
import { formatIndianMobile } from "./format";

/**
 * 29 Sep 2026 — the party rosters, made uniform: one way to print an Indian
 * mobile on every roster, `+91 98765 43210`, whatever form the row stored.
 * The dev data has a publisher whose number is stored as the bare ten
 * digits; it reads the same as one stored canonically.
 */
describe("formatIndianMobile", () => {
    it("prints the canonical form, the bare ten digits and a 91 without the plus the same way", () => {
        expect(formatIndianMobile("+919876543210")).toBe("+91 98765 43210");
        expect(formatIndianMobile("9507842149")).toBe("+91 95078 42149");
        expect(formatIndianMobile("919876543210")).toBe("+91 98765 43210");
    });

    it("reads spaces, dashes, brackets and a trunk zero through", () => {
        expect(formatIndianMobile(" +91 98765-43210 ")).toBe("+91 98765 43210");
        expect(formatIndianMobile("(+91) 98765 43210")).toBe("+91 98765 43210");
        expect(formatIndianMobile("09876543210")).toBe("+91 98765 43210");
    });

    it("is idempotent — a printed number prints the same", () => {
        expect(formatIndianMobile(formatIndianMobile("9876543210"))).toBe("+91 98765 43210");
    });

    it("leaves anything that is not an Indian mobile exactly as stored", () => {
        // A landline, a foreign number and a short typo are not dressed up as +91 mobiles.
        expect(formatIndianMobile("011 2345 6789")).toBe("011 2345 6789");
        expect(formatIndianMobile("+14155550123")).toBe("+14155550123");
        expect(formatIndianMobile("98765")).toBe("98765");
    });

    it("answers empty for nothing, so the caller picks its own dash", () => {
        expect(formatIndianMobile(null)).toBe("");
        expect(formatIndianMobile(undefined)).toBe("");
        expect(formatIndianMobile("   ")).toBe("");
    });
});
