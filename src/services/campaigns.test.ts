import { describe, expect, it, vi } from "vitest";

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

import {
    CAMPAIGN_STATUS_TONE,
    campaignService,
    campaignStatusLabel,
    canQuoteDesign,
    designQuoteOf,
    designQuoteProblem,
    designQuoteStatusMeta,
    WAITING_ON_META,
    WAITING_ON_REASONS,
    campaignFlightLabel,
    campaignsCsvRows,
    campaignsListPath,
    daysSince,
    flightWithDaysLeft,
    fulfilmentLabel,
    launchQueuePath,
    performanceLine,
    reservationStatusMeta,
    shapeCampaign,
    spendShare,
    waitingOnLabel,
    waitingOnLine,
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

    it("reads a flight off both dates the way orders do, and says so when a draft has neither", () => {
        expect(campaignFlightLabel(shapeCampaign(wire()))).toBe("1 Oct – 30 Oct 2026");
        expect(campaignFlightLabel(shapeCampaign(wire({ startDate: null, endDate: null })))).toBe("Not scheduled");
    });

    it("adds the days left while live, and nothing otherwise", () => {
        expect(flightWithDaysLeft(shapeCampaign(wire({ daysLeft: 6 })))).toEqual({ flight: "1 Oct – 30 Oct 2026", left: "6 days left" });
        expect(flightWithDaysLeft(shapeCampaign(wire({ daysLeft: 1 }))).left).toBe("1 day left");
        expect(flightWithDaysLeft(shapeCampaign(wire({ daysLeft: 0 }))).left).toBe("Last day");
        expect(flightWithDaysLeft(shapeCampaign(wire({ status: "SCHEDULED", daysLeft: 6 }))).left).toBeNull();
    });

    it("leaves out the apps' narrow advertiser, which is not the party shape", () => {
        expect(shapeCampaign(wire({ advertiser: { id: "adv_1", displayId: "ADV-1", name: "Rao Sweets" } })).advertiser).toBeNull();
    });

    it("defaults the admin columns when an older read leaves them off", () => {
        const row = shapeCampaign(wire());
        expect(row).toMatchObject({ advertiser: null, waitingOn: [], spotsLive: null, spotsTotal: 3, performance: null, paid: null, daysLeft: null, landingPage: null });
    });

    it("carries the admin columns when the read sends them", () => {
        const advertiser = { userId: "usr_asha", name: "Asha Rao", displayId: "ADX-0210-2601", business: { id: "adv_rao", name: "Rao Sweets", displayId: "ADV-0210-2601" } };
        const row = shapeCampaign(
            wire({ advertiser, waitingOn: ["KYC"], spotsLive: 2, spotsTotal: 3, paidAmount: "18400.00", performance: { scans: 120, views: 80, ctaClicks: 9, enquiries: 4 } }),
        );
        expect(row.advertiser).toEqual(advertiser);
        expect(row.waitingOn).toEqual(["KYC"]);
        expect(row.spotsLive).toBe(2);
        expect(row.paid).toBe("18400.00");
        expect(performanceLine(row.performance)).toBe("120 scans · 80 views · 4 enquiries");
    });
});

describe("waiting on", () => {
    it("names each reason in plain words, and the server's own word for one added since", () => {
        expect(waitingOnLabel("KYC")).toBe("Advertiser KYC");
        expect(waitingOnLabel("RESERVATION_FEE")).toBe("Reservation fee");
        expect(waitingOnLabel("SITE_PERMIT")).toBe("Site permit");
        for (const reason of WAITING_ON_REASONS) expect(WAITING_ON_META[reason].description).toMatch(/\S/);
    });

    it("draws the pill line, or nothing when nothing blocks", () => {
        expect(waitingOnLine(["PAYMENT", "ARTWORK"])).toBe("Waiting on Payment · Artwork approval");
        expect(waitingOnLine([])).toBeNull();
        expect(waitingOnLine(undefined)).toBeNull();
    });
});

describe("the list's query", () => {
    it("sends only what was asked, the old shape unchanged", () => {
        expect(campaignsListPath({ advertiserId: "adv_1" })).toBe("/campaigns?advertiserId=adv_1&sort=NEWEST&pageSize=100");
        expect(campaignsListPath({ status: ["LIVE"], q: "rao", city: "bengaluru", from: "2026-10-01", to: "2026-10-31", waitingOn: ["KYC", "ARTWORK"], page: 2, pageSize: 25 })).toBe(
            "/campaigns?status=LIVE&q=rao&city=bengaluru&from=2026-10-01&to=2026-10-31&waitingOn=KYC%2CARTWORK&sort=NEWEST&pageSize=25&page=2",
        );
    });

    it("asks the launch queue oldest-first by reason", () => {
        expect(launchQueuePath({})).toBe("/campaigns/launch-queue?pageSize=25");
        expect(launchQueuePath({ reason: "KYC", q: "rao", page: 3 })).toBe("/campaigns/launch-queue?reason=KYC&q=rao&page=3&pageSize=25");
    });

    it("calls the new routes", async () => {
        calls.length = 0;
        await campaignService.remindPayment("cmp_1");
        await campaignService.cancelImpact("cmp_1");
        await campaignService.performance("cmp_1");
        expect(calls).toEqual([
            { method: "POST", path: "/campaigns/cmp_1/remind-payment", body: {} },
            { method: "GET", path: "/campaigns/cmp_1/cancel-impact", body: undefined },
            { method: "GET", path: "/campaigns/cmp_1/performance", body: undefined },
        ]);
    });

    it("writes the CSV with the advertiser, the gates and the counts", () => {
        const row = shapeCampaign(
            wire({
                advertiser: { userId: "u", name: "Asha Rao", displayId: "ADX-1", business: { id: "adv", name: "Rao Sweets", displayId: "ADV-1" } },
                waitingOn: ["KYC"],
                spotsLive: 2,
                paidAmount: "18400.00",
                performance: { scans: 1, views: 2, ctaClicks: 3, enquiries: 4 },
            }),
        );
        const [header, line] = campaignsCsvRows([row]);
        expect(header[0]).toBe("Reference");
        expect(line).toEqual(["ADX-CMP-2026-482913", "Diwali Season Push", "Rao Sweets", "ADV-1", "Anita's Coffee", "Live", "Advertiser KYC", 2, 3, "2026-10-01", "2026-10-30", "18400.00", "18400.00", 1, 2, 3, 4]);
    });

    it("counts the days a row has waited", () => {
        expect(daysSince("2026-09-28T10:00:00.000Z", new Date("2026-10-02T09:00:00.000Z"))).toBe(3);
        expect(daysSince(null)).toBeNull();
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

/* DQ-1: the desk's price for the artwork, and when it may be named. */
describe("the design quote (DQ-1)", () => {
    it("folds the detail's flat columns into the quote the design-requests read sends, and none where nothing was named", () => {
        expect(designQuoteOf({ designQuoteAmount: "5000.00", designQuoteStatus: "QUOTED", designQuoteNote: "Two rounds", designQuotedAt: "2026-09-22T00:00:00Z", designQuoteRespondedAt: null })).toEqual({
            amount: "5000.00",
            status: "QUOTED",
            note: "Two rounds",
            quotedAt: "2026-09-22T00:00:00Z",
            respondedAt: null,
        });
        expect(designQuoteOf({ designQuoteAmount: null, designQuoteStatus: null })).toBeNull();
        expect(designQuoteOf({})).toBeNull();
    });

    it("chips the four states, Awaiting quote while none was named", () => {
        expect(designQuoteStatusMeta(null).label).toBe("Awaiting quote");
        expect(designQuoteStatusMeta({ status: "QUOTED" }).label).toBe("Quoted");
        expect(designQuoteStatusMeta({ status: "ACCEPTED" }).tone).toBe("success");
        expect(designQuoteStatusMeta({ status: "DECLINED" }).label).toBe("Declined");
    });

    it("lets the desk quote on the ADX path before payment, again after a decline, never over an acceptance", () => {
        expect(canQuoteDesign({ creativePath: "ADX_DESIGN_AGENCY", status: "DRAFT" }, null)).toBe(true);
        expect(canQuoteDesign({ creativePath: "ADX_DESIGN_AGENCY", status: "PENDING_PAYMENT" }, { status: "DECLINED" })).toBe(true);
        expect(canQuoteDesign({ creativePath: "ADX_DESIGN_AGENCY", status: "PENDING_PAYMENT" }, { status: "QUOTED" })).toBe(true);
        expect(canQuoteDesign({ creativePath: "ADX_DESIGN_AGENCY", status: "DRAFT" }, { status: "ACCEPTED" })).toBe(false);
        expect(canQuoteDesign({ creativePath: "ADX_DESIGN_AGENCY", status: "SCHEDULED" }, null)).toBe(false);
        expect(canQuoteDesign({ creativePath: "STATIC_IMAGES", status: "DRAFT" }, null)).toBe(false);
        /* A design-requests row is on the ADX path by definition and may leave the path off. */
        expect(canQuoteDesign({ status: "DRAFT" }, null)).toBe(true);
    });

    it("refuses what the schema would: a malformed or zero amount, a note over 500", () => {
        expect(designQuoteProblem({ amount: "", note: "" })).toMatch(/rupees/);
        expect(designQuoteProblem({ amount: "12.345", note: "" })).toMatch(/rupees/);
        expect(designQuoteProblem({ amount: "0", note: "" })).toMatch(/more than zero/);
        expect(designQuoteProblem({ amount: "5000", note: "x".repeat(501) })).toMatch(/500/);
        expect(designQuoteProblem({ amount: "5000.50", note: "Two rounds" })).toBeNull();
    });

    it("posts the quote on the campaign's own route, the note left off when blank", async () => {
        calls.length = 0;
        await campaignService.quoteDesign("cmp_1", { amount: " 5000.00 ", note: "  " });
        await campaignService.quoteDesign("cmp_1", { amount: "6000", note: " Two rounds of changes " });
        expect(calls).toEqual([
            { method: "POST", path: "/campaigns/cmp_1/design-quote", body: { amount: "5000.00" } },
            { method: "POST", path: "/campaigns/cmp_1/design-quote", body: { amount: "6000", note: "Two rounds of changes" } },
        ]);
    });
});

/* RF-1 and PS-1: the reservation's states and who prints a line. */
describe("the reservation and the print choice", () => {
    it("names every reservation state, and spells out one it has not heard of", () => {
        expect(reservationStatusMeta("DUE").label).toBe("Fee due");
        expect(reservationStatusMeta("PAID").tone).toBe("success");
        expect(reservationStatusMeta("ADJUSTED").label).toBe("Folded into the checkout");
        expect(reservationStatusMeta("RETAINED").tone).toBe("danger");
        expect(reservationStatusMeta("LAPSED").label).toBe("Lapsed");
        expect(reservationStatusMeta("SOMETHING_NEW").label).toBe("something new");
    });

    it("reads the line's print choice, the campaign's when the line has none, nothing when neither said", () => {
        expect(fulfilmentLabel("ADVERTISER_SHIPS", "ADX_PRINTS")).toBe("Advertiser ships");
        expect(fulfilmentLabel(null, "ADX_PRINTS")).toBe("ADX prints");
        expect(fulfilmentLabel(null, null)).toBeNull();
    });
});
