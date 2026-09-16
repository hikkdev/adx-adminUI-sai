import { describe, expect, it } from "vitest";

import { changedKeys, countLeaves, flattenSettings, parseBounded, type PlatformSettings } from "./settings";

/**
 * Platform settings — the `AppConfig` row keyed `platform`.
 *
 * `PUT /settings/platform` is a deep patch that refuses unknown keys, and
 * the reason Save sends only the leaves that moved is that two admins
 * editing different sections in the same minute must not overwrite each
 * other's numbers. `changedKeys` is that guarantee.
 */

const defaults: PlatformSettings = {
    kyc: { reviewSlaHours: 48, escalationSlaMultiplier: 2 },
    listings: { autoPublishOnVerification: true },
    marketplace: { minBookingDays: 1, maxMarketsPerCampaign: 3 },
    publisher: { spotInsightsVisible: false },
    retention: { financialYears: 8, kycYears: 8 },
    support: {
        sla: {
            URGENT: { firstResponseHours: 1, resolutionHours: 4 },
            HIGH: { firstResponseHours: 4, resolutionHours: 24 },
            NORMAL: { firstResponseHours: 8, resolutionHours: 72 },
            LOW: { firstResponseHours: 24, resolutionHours: 168 },
        },
    },
    auth: { adminPasswordLoginEnabled: true },
    installation: { commissionMode: "FLAT" },
    finance: { primaryRail: "MANUAL_NEFT", railFallbackOrder: ["RAZORPAY_X", "CASHFREE", "MANUAL_NEFT"], payoutEtaHours: 48, clearingDays: 7 },
};

const doc = (settings: PlatformSettings) => settings as unknown as Record<string, unknown>;

describe("changedKeys", () => {
    it("is empty when nothing moved", () => {
        expect(changedKeys(doc(defaults), doc(structuredClone(defaults)))).toEqual({});
    });

    it("names one leaf in its section and nothing beside it", () => {
        const after = structuredClone(defaults);
        after.kyc.reviewSlaHours = 24;
        expect(changedKeys(doc(defaults), doc(after))).toEqual({ kyc: { reviewSlaHours: 24 } });
    });

    it("reaches three levels down for one SLA number and leaves the other seven alone", () => {
        const after = structuredClone(defaults);
        after.support.sla.HIGH.resolutionHours = 12;
        expect(changedKeys(doc(defaults), doc(after))).toEqual({ support: { sla: { HIGH: { resolutionHours: 12 } } } });
    });

    it("carries several sections at once, each trimmed to what moved", () => {
        const after = structuredClone(defaults);
        after.listings.autoPublishOnVerification = false;
        after.marketplace.maxMarketsPerCampaign = 5;
        after.installation.commissionMode = "PER_ORDER";
        expect(changedKeys(doc(defaults), doc(after))).toEqual({
            listings: { autoPublishOnVerification: false },
            marketplace: { maxMarketsPerCampaign: 5 },
            installation: { commissionMode: "PER_ORDER" },
        });
    });

    it("treats a boolean flipped and flipped back as unchanged", () => {
        const after = structuredClone(defaults);
        after.auth.adminPasswordLoginEnabled = false;
        after.auth.adminPasswordLoginEnabled = true;
        expect(changedKeys(doc(defaults), doc(after))).toEqual({});
    });
});

describe("countLeaves", () => {
    it("counts the numbers a patch names, however deep", () => {
        expect(countLeaves({})).toBe(0);
        expect(countLeaves({ kyc: { reviewSlaHours: 24 } })).toBe(1);
        expect(countLeaves({ support: { sla: { HIGH: { firstResponseHours: 2, resolutionHours: 12 } } }, auth: { adminPasswordLoginEnabled: false } })).toBe(3);
    });
});

describe("changedKeys on the rail order", () => {
    it("compares the fallback order by value and sends it whole when it moved", () => {
        const after = structuredClone(defaults);
        after.finance.railFallbackOrder = ["CASHFREE", "RAZORPAY_X", "MANUAL_NEFT"];
        expect(changedKeys(doc(defaults), doc(after))).toEqual({
            finance: { railFallbackOrder: ["CASHFREE", "RAZORPAY_X", "MANUAL_NEFT"] },
        });
    });
});

describe("flattenSettings", () => {
    it("names leaves the way the audit diff does", () => {
        const flat = flattenSettings(doc(defaults));
        expect(flat["kyc.reviewSlaHours"]).toBe(48);
        // Lot G: the sweep's multiplier is one more leaf under kyc.
        expect(flat["kyc.escalationSlaMultiplier"]).toBe(2);
        expect(flat["support.sla.LOW.resolutionHours"]).toBe(168);
        expect(flat["finance.primaryRail"]).toBe("MANUAL_NEFT");
        // The array is one leaf: the PUT replaces it whole.
        expect(flat["finance.railFallbackOrder"]).toEqual(["RAZORPAY_X", "CASHFREE", "MANUAL_NEFT"]);
        expect(Object.keys(flat)).toHaveLength(22);
    });
});

describe("parseBounded", () => {
    it("takes a whole number inside the bounds and nothing else", () => {
        expect(parseBounded("48", { min: 1, max: 720 })).toBe(48);
        expect(parseBounded(" 720 ", { min: 1, max: 720 })).toBe(720);
        expect(parseBounded("0", { min: 1, max: 720 })).toBeNull();
        expect(parseBounded("721", { min: 1, max: 720 })).toBeNull();
        expect(parseBounded("", { min: 1, max: 720 })).toBeNull();
        expect(parseBounded("4.5", { min: 1, max: 720 })).toBeNull();
    });
});
