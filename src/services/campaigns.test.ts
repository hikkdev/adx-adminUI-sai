import { describe, expect, it } from "vitest";

import {
    CAMPAIGN_STATUS_TONE,
    campaignStatusLabel,
    flightLabel,
    shapeCampaign,
    spendShare,
    type WireCampaign,
} from "./campaigns";

/**
 * DR 10's campaign worklist (`5102:26294`), live.
 *
 * The console drew these from fixtures while `src/lib/api-config.ts` asserted
 * `campaignsAndInvoicesExist = false` — "Campaign and Invoice are not tables".
 * Campaign is a seventeen-step model with five satellite tables and fifteen
 * routes, and both mobile apps have been reading it for a while. Only Invoice
 * is still absent.
 */

const wire = (over: Partial<WireCampaign> = {}): WireCampaign =>
    ({
        id: "cmp_1",
        reference: "ADX-CMP-2026-482913",
        name: "Diwali Season Push",
        status: "LIVE",
        goal: "AWARENESS",
        brandName: "Anita's Coffee",
        city: "MG Road",
        budget: "50000.00",
        total: "18400.00",
        startDate: "2026-10-01T00:00:00.000Z",
        endDate: "2026-10-30T00:00:00.000Z",
        spotCount: 3,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-20T00:00:00.000Z",
        ...over,
    }) as WireCampaign;

describe("shapeCampaign", () => {
    it("keeps money as the decimal strings the API sent", () => {
        const row = shapeCampaign(wire());
        expect(row.budget).toBe("50000.00");
        expect(row.committed).toBe("18400.00");
    });

    it("carries the reference, which is what a person quotes on the phone", () => {
        expect(shapeCampaign(wire()).reference).toBe("ADX-CMP-2026-482913");
    });

    it("keeps a draft's missing dates missing rather than inventing them", () => {
        const draft = shapeCampaign(wire({ status: "DRAFT", startDate: null, endDate: null, budget: null }));
        expect(draft.startDate).toBeNull();
        expect(draft.budget).toBeNull();
    });

    it("reads targetLocation as what it is — free text from the wizard, not a city", () => {
        // The repository maps `targetLocation` onto `city`, and it may hold a
        // mall name or a pin label. Naming it `area` stops a city filter being
        // built on free text.
        expect(shapeCampaign(wire({ city: "Phoenix Mall" })).area).toBe("Phoenix Mall");
    });
});

describe("labels", () => {
    it("gives all seven statuses a sentence and a tone", () => {
        for (const status of [
            "DRAFT",
            "PENDING_PAYMENT",
            "SCHEDULED",
            "LIVE",
            "PAUSED",
            "COMPLETED",
            "CANCELLED",
        ] as const) {
            expect(campaignStatusLabel(status)).toMatch(/\S/);
            expect(CAMPAIGN_STATUS_TONE[status]).toBeDefined();
        }
    });

    it("reads a flight off both dates, and says so when a draft has neither", () => {
        expect(flightLabel(shapeCampaign(wire()))).toMatch(/2026-10-01/);
        expect(flightLabel(shapeCampaign(wire({ startDate: null, endDate: null })))).toBe("Not scheduled");
    });
});

describe("spendShare", () => {
    it("is the share of the budget committed, as the frame's bar draws it", () => {
        // "37% of ₹50,000" on the DR 06 card.
        expect(spendShare({ budget: "50000.00", committed: "18500.00" })).toBe(37);
    });

    it("is null when there is no budget to be a share of", () => {
        expect(spendShare({ budget: null, committed: "18400.00" })).toBeNull();
        expect(spendShare({ budget: "0", committed: "0" })).toBeNull();
    });

    it("does not run past the end of the bar when a campaign overspends", () => {
        expect(spendShare({ budget: "1000", committed: "2500" })).toBe(100);
    });
});
