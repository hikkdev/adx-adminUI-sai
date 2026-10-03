import { describe, expect, it } from "vitest";
import { INCENTIVE_EVENTS, INCENTIVE_EVENT_LABEL, incentiveEventLabel, incentiveTierLabel, incentiveTierOptions } from "./finance";

/**
 * D12 — the incentive queue's vocabulary.
 *
 * `GET /finance/incentives` rows carry every value of the backend's
 * `IncentiveEvent` enum, and DR 05 added two: the milestone claim and the
 * tier promotion. A label map missing a key renders "undefined" in the
 * "What for" column, which is the failure this file exists to catch.
 */
describe("what an incentive was for", () => {
    it("names every event the backend can record, the two DR 05 ones included", () => {
        expect(INCENTIVE_EVENTS).toContain("MILESTONE_BONUS");
        expect(INCENTIVE_EVENTS).toContain("TIER_BONUS");
        for (const event of INCENTIVE_EVENTS) {
            expect(INCENTIVE_EVENT_LABEL[event], event).toMatch(/\S/);
        }
        expect(INCENTIVE_EVENT_LABEL.MILESTONE_BONUS).toBe("Milestone bonus");
        expect(INCENTIVE_EVENT_LABEL.TIER_BONUS).toBe("Tier bonus");
    });

    it("never prints undefined for an event it has not heard of", () => {
        expect(incentiveEventLabel("TIER_BONUS")).toBe("Tier bonus");
        expect(incentiveEventLabel("SOMETHING_NEW")).toBe("Something new");
        expect(incentiveEventLabel("")).toBe("—");
    });

    it("LH8 (D1): words a side-qualified tier — the advertiser figure of LEAD_ACTIVATED sits at `*:ADVERTISER`", () => {
        expect(INCENTIVE_EVENT_LABEL.LEAD_CONVERTED).toBe("Lead converted");
        expect(INCENTIVE_EVENT_LABEL.LEAD_ACTIVATED).toBe("Lead activated");
        expect(INCENTIVE_EVENT_LABEL.LEAD_RETAINED).toBe("Lead retained");
        expect(incentiveTierLabel("*")).toBe("Every tier");
        expect(incentiveTierLabel("*:ADVERTISER")).toBe("Every tier · advertiser side");
        expect(incentiveTierLabel("GOLD:PUBLISHER")).toBe("Gold · publisher side");
        expect(incentiveTierLabel("GOLD")).toBe("Gold");
    });
});

describe("the tier keys the rate form offers", () => {
    it("are exactly the keys the backend resolves: every tier, the four tiers, and the sides for lead events only", () => {
        expect(incentiveTierOptions("PUBLISHER_ONBOARDED").map((option) => option.value)).toEqual(["*", "BRONZE", "SILVER", "GOLD", "PLATINUM"]);
        expect(incentiveTierOptions("LEAD_RETAINED")).toEqual([
            { value: "*", label: "Every tier" },
            { value: "BRONZE", label: "Bronze" },
            { value: "SILVER", label: "Silver" },
            { value: "GOLD", label: "Gold" },
            { value: "PLATINUM", label: "Platinum" },
            { value: "*:ADVERTISER", label: "Every tier · advertiser side" },
            { value: "*:PUBLISHER", label: "Every tier · publisher side" },
        ]);
    });

    it("keeps a row's own key when the list does not hold it, so changing that row keeps it", () => {
        const values = incentiveTierOptions("LEAD_ACTIVATED", "GOLD:ADVERTISER").map((option) => option.value);
        expect(values.at(-1)).toBe("GOLD:ADVERTISER");
        expect(incentiveTierOptions("LEAD_ACTIVATED", "*").filter((option) => option.value === "*")).toHaveLength(1);
    });
});
