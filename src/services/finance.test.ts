import { describe, expect, it } from "vitest";
import { INCENTIVE_EVENTS, INCENTIVE_EVENT_LABEL, incentiveEventLabel } from "./finance";

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
});
