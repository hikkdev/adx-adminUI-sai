import { describe, expect, it } from "vitest";
import {
    ageLabel,
    approvalBlockers,
    documentsLabel,
    floorGap,
    gateSentence,
    sizeLabel,
    type GateVerdict,
} from "./listing-review";

/**
 * The desk's arithmetic and sentences, kept pure so they can be pinned down
 * without a DOM. The one that matters most is `floorGap`: it is the only
 * subtraction of two rupee figures on the screen, and it must not be a float.
 */

const BELOW: GateVerdict = {
    state: "BELOW_FLOOR",
    cardId: "rc_1",
    cardRate: "2000.00",
    floor: "1600.00",
    rate: "1499.99",
};

describe("floorGap", () => {
    it("counts the shortfall in paise and answers a decimal string", () => {
        expect(floorGap(BELOW)).toBe("100.01");
    });

    it("is null when the rate is not under the floor", () => {
        expect(floorGap({ state: "OK", cardId: "rc_1", cardRate: "2000.00", floor: "1600.00" })).toBeNull();
        expect(floorGap({ state: "NOT_COVERED" })).toBeNull();
    });

    it("survives a figure the API sent without paise", () => {
        expect(floorGap({ ...BELOW, floor: "1600", rate: "1500" })).toBe("100.00");
    });
});

describe("gateSentence", () => {
    it("names the shortfall and the floor when the rate is under it", () => {
        expect(gateSentence(BELOW)).toContain("₹100.01 under the floor of ₹1,600.00");
    });

    it("says the gate passes where no card covers the spot", () => {
        expect(gateSentence({ state: "NOT_COVERED" })).toMatch(/gate passes/);
    });
});

describe("documentsLabel", () => {
    it("reads as a fraction, with rejections called out", () => {
        expect(documentsLabel({ total: 3, pending: 1, verified: 1, rejected: 1 })).toBe(
            "1 of 3 verified · 1 rejected"
        );
        expect(documentsLabel({ total: 2, pending: 0, verified: 2, rejected: 0 })).toBe("2 of 2 verified");
        expect(documentsLabel({ total: 0, pending: 0, verified: 0, rejected: 0 })).toBe("No documents");
    });
});

describe("ageLabel", () => {
    const now = new Date("2026-09-10T12:00:00Z").getTime();

    it("steps from minutes to hours to days", () => {
        expect(ageLabel("2026-09-10T11:48:00Z", now)).toBe("12m");
        expect(ageLabel("2026-09-10T09:00:00Z", now)).toBe("3h");
        expect(ageLabel("2026-09-07T12:00:00Z", now)).toBe("3d");
    });

    it("answers a dash for a listing that was never dated", () => {
        expect(ageLabel(null, now)).toBe("—");
    });
});

describe("sizeLabel", () => {
    it("trims measurement zeros but never invents an area", () => {
        expect(sizeLabel({ widthFt: "20.00", heightFt: "6.50", areaSqFt: "130.00" })).toBe(
            "20 × 6.5 ft · 130 sq ft"
        );
        expect(sizeLabel({ widthFt: "20.00", heightFt: "6.50", areaSqFt: null })).toBe("20 × 6.5 ft");
        expect(sizeLabel({ widthFt: null, heightFt: "6.50", areaSqFt: null })).toBeNull();
    });
});

describe("approvalBlockers", () => {
    it("treats the rate-card gate as hard and the paperwork as soft", () => {
        const blockers = approvalBlockers({
            gate: BELOW,
            documentSummary: { total: 3, pending: 1, verified: 1, rejected: 1 },
            photoCount: 0,
        });
        expect(blockers.hard).toHaveLength(1);
        expect(blockers.soft).toEqual([
            "1 document has not been checked.",
            "1 document was rejected and not replaced.",
            "No photographs were filed with this listing.",
        ]);
    });

    it("has nothing to say about a clean case", () => {
        expect(
            approvalBlockers({
                gate: { state: "NOT_COVERED" },
                documentSummary: { total: 2, pending: 0, verified: 2, rejected: 0 },
                photoCount: 3,
            })
        ).toEqual({ hard: [], soft: [] });
    });
});
