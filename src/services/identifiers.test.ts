import { describe, expect, it } from "vitest";
import { ID_LABEL, backfillSummary, idLine } from "./identifiers";

/**
 * QR-4 / BK-1: one run of `POST /identifiers/backfill/publishers` issues
 * publisher, people and booking identifiers; the toast names each series
 * it touched, and says so plainly when nothing was owed.
 */
describe("backfillSummary", () => {
    it("names every series that was issued, and what is still to go", () => {
        expect(backfillSummary({ assigned: 12, remaining: 0, users: { assigned: 3, remaining: 0 }, orders: { assigned: 40, remaining: 5 } })).toBe(
            "Issued 12 publisher, 3 people, 40 booking identifiers, 5 booking still to go",
        );
        expect(backfillSummary({ assigned: 1, remaining: 0 })).toBe("Issued 1 publisher identifier");
    });

    it("says when nothing was owed, across every series the answer named", () => {
        expect(backfillSummary({ assigned: 0, remaining: 0, users: { assigned: 0, remaining: 0 }, orders: { assigned: 0, remaining: 0 } })).toBe(
            "Every publisher, person and booking already has an identifier",
        );
        expect(backfillSummary({ assigned: 0, remaining: 7 })).toBe("Nothing issued this run; 7 publisher still to go");
    });
});

/**
 * 29 Sep 2026: one person, one ADX ID; every party id named by its kind, so
 * a desk line never reads as a person holding several ids of their own.
 */
describe("idLine", () => {
    it("names the person's own id as the ADX ID and every party id by its kind", () => {
        expect(idLine("USER", "ADX-2909-2601")).toBe("ADX ID ADX-2909-2601");
        expect(idLine("ADVERTISER", "ADV-2909-2601")).toBe("Advertiser account ID ADV-2909-2601");
        expect(idLine("PUBLISHER", "PUB-2909-2601")).toBe("Publisher account ID PUB-2909-2601");
        expect(idLine("PARTNER", "PRT-2909-2601")).toBe("Print partner ID PRT-2909-2601");
        expect(idLine("AGENT", "AGT-2909-2601")).toBe("Agent ID AGT-2909-2601");
    });

    it("labels off the kind, not the prefix, so a reformatted series still reads right", () => {
        expect(idLine("ADVERTISER", "IN-ADV-005")).toBe("Advertiser account ID IN-ADV-005");
    });

    it("drops the line when no id is issued rather than printing a bare label", () => {
        expect(idLine("USER", null)).toBeNull();
        expect(idLine("AGENT", undefined)).toBeNull();
        expect(idLine("PUBLISHER", "  ")).toBeNull();
    });

    it("never says 'Your' — the desk is looking at somebody else", () => {
        expect(Object.values(ID_LABEL).some((label) => /\byour\b/i.test(label))).toBe(false);
    });
});
