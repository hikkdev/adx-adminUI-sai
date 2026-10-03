import { describe, expect, it } from "vitest";
import {
    briefOf,
    briefOfRequest,
    designDueLabel,
    printReadinessOf,
    requestDueLabel,
    type CreativeReviewRow,
    type DesignRequestRow,
} from "./moderation";

/**
 * CR-1: the reading rules behind the three new tabs.
 *
 * The brief is a JSON column holding a different shape per creative path,
 * so it is read defensively; the due label runs off the flight start; and
 * print readiness is read off the spot's order and job. Each is pure.
 */

const campaign = (over: Partial<CreativeReviewRow["campaign"]> = {}): CreativeReviewRow["campaign"] => ({
    id: "cmp_1",
    reference: "ADX-CMP-2026-000001",
    name: "Diwali burst",
    status: "SCHEDULED",
    advertiserId: "adv_1",
    agentId: null,
    createdByUserId: "usr_1",
    trackingMethod: "QR_OR_DEEPLINK",
    contentCategoryId: null,
    advertiser: { id: "adv_1", name: "Anita", companyName: null },
    ...over,
});

const GOOD_BRIEF = { objective: "Footfall", keyMessage: "Two for one", style: "BOLD_AND_ENERGETIC" };

describe("the brief", () => {
    it("reads a well-formed brief off the ADX path", () => {
        expect(briefOf({ campaign: campaign({ creativePath: "ADX_DESIGN_AGENCY", creativeConfig: GOOD_BRIEF }) })).toEqual(GOOD_BRIEF);
    });

    it("answers null on any other path, even if the config looks like a brief", () => {
        expect(briefOf({ campaign: campaign({ creativePath: "STATIC_IMAGES", creativeConfig: GOOD_BRIEF }) })).toBeNull();
    });

    it("answers null when the config is missing or the wrong shape", () => {
        expect(briefOf({ campaign: campaign({ creativePath: "ADX_DESIGN_AGENCY", creativeConfig: null }) })).toBeNull();
        expect(briefOf({ campaign: campaign({ creativePath: "ADX_DESIGN_AGENCY", creativeConfig: { objective: 1 } }) })).toBeNull();
        expect(briefOf({ campaign: campaign({ creativePath: "ADX_DESIGN_AGENCY", creativeConfig: { ...GOOD_BRIEF, style: "LOUD" } }) })).toBeNull();
    });

    it("reads a request's brief the same way", () => {
        const request = { campaign: { creativeConfig: GOOD_BRIEF } } as Pick<DesignRequestRow, "campaign">;
        expect(briefOfRequest(request)).toEqual(GOOD_BRIEF);
    });
});

describe("when a design is due", () => {
    const now = new Date("2026-09-24T12:00:00Z");

    it("counts down to the flight start", () => {
        expect(designDueLabel({ campaign: campaign({ startDate: "2026-09-30T00:00:00Z" }) }, now)).toEqual({ label: "Due in 6 days", overdue: false });
    });

    it("is overdue once the flight has started", () => {
        const label = designDueLabel({ campaign: campaign({ startDate: "2026-09-20T00:00:00Z" }) }, now);
        expect(label.overdue).toBe(true);
        expect(label.label).toMatch(/started 4 days ago/);
    });

    it("says so when there is no flight date", () => {
        expect(designDueLabel({ campaign: campaign({ startDate: null }) }, now)).toEqual({ label: "No flight date yet", overdue: false });
    });

    it("reads a request the same way", () => {
        const request = { campaign: { startDate: "2026-09-25T00:00:00Z" } } as Pick<DesignRequestRow, "campaign">;
        expect(requestDueLabel(request, now).label).toBe("Due in 1 day");
    });
});

describe("where approved artwork stands on the way to print", () => {
    const listing = { id: "lst_1", title: "MG Road", city: "Bengaluru", widthFt: "20", heightFt: "10" };

    it("is campaign-wide when pinned to no spot", () => {
        expect(printReadinessOf({ spot: null })).toEqual({ state: "CAMPAIGN_WIDE" });
    });

    it("is not booked when the spot has no order", () => {
        expect(printReadinessOf({ spot: { id: "s", listingId: "lst_1", listing, order: null } })).toEqual({ state: "NOT_BOOKED" });
    });

    it("has no job when the order has none", () => {
        expect(printReadinessOf({ spot: { id: "s", listingId: "lst_1", listing, order: { id: "ord_1", status: "PENDING_PRINT", printJob: null } } })).toEqual({
            state: "NO_JOB",
            orderId: "ord_1",
        });
    });

    it("is with a shop once a job exists, naming the shop and its stage", () => {
        const order = { id: "ord_1", status: "PENDING_PRINT", printJob: { id: "job_1", status: "PRINTING" as const, printPartner: { id: "pp_1", name: "Sharma Printers" } } };
        expect(printReadinessOf({ spot: { id: "s", listingId: "lst_1", listing, order } })).toEqual({
            state: "AT_SHOP",
            orderId: "ord_1",
            jobStatus: "PRINTING",
            partner: "Sharma Printers",
        });
    });

    it("treats a row from an older backend, with no order field, as not booked", () => {
        expect(printReadinessOf({ spot: { id: "s", listingId: "lst_1", listing } })).toEqual({ state: "NOT_BOOKED" });
    });
});
