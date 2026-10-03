import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true, baseUrl: "https://api.adx.in/api/v1" }, isLive: () => true };
});

import { landingAdvertiser, landingPagesPath, landingTitle, previewUrl, unpublishReason } from "./landing-pages";

/**
 * Landing pages (2 Oct 2026): the list's query with the search, the
 * page's title off the hero, the advertiser in the shared party shape
 * whichever read carried it, and where the public render lives.
 */

describe("the list's query", () => {
    it("sends the status, the search and the page only when asked", () => {
        expect(landingPagesPath()).toBe("/campaigns/landing-pages?pageSize=50");
        expect(landingPagesPath({ status: "PUBLISHED", q: "  rao ", page: 2, pageSize: 25 })).toBe("/campaigns/landing-pages?status=PUBLISHED&q=rao&page=2&pageSize=25");
        expect(landingPagesPath({ q: "   " })).toBe("/campaigns/landing-pages?pageSize=50");
    });
});

describe("a page's title", () => {
    it("is the server's hero title, else the hero block's headline, else the address", () => {
        expect(landingTitle({ heroTitle: "Diwali sweets", blocks: [], slug: "x" })).toBe("Diwali sweets");
        expect(landingTitle({ heroTitle: null, blocks: [{ type: "cta", label: "Call" }, { type: "hero", headline: "Rain, coffee" }], slug: "x" })).toBe("Rain, coffee");
        expect(landingTitle({ blocks: [], slug: "monsoon" })).toBe("/p/monsoon");
    });
});

describe("the advertiser", () => {
    it("is the row's own party when sent, else the narrow campaign join", () => {
        const asha = { userId: "u", name: "Asha", displayId: "ADX-1", business: { id: "adv", name: "Rao Sweets", displayId: "ADV-1" } };
        expect(landingAdvertiser({ advertiser: asha, campaign: null })).toBe(asha);
        expect(landingAdvertiser({ advertiser: null, campaign: null })).toBeNull();
        expect(
            landingAdvertiser({
                campaign: { id: "c", reference: "r", name: "n", status: "LIVE", advertiserId: "adv", advertiser: { id: "adv", name: "Asha", companyName: null } },
            }),
        ).toEqual({ userId: "", name: "Asha", displayId: null, business: { id: "adv", name: "Asha", displayId: null } });
    });
});

describe("the public render", () => {
    it("lives at the API origin's root, and a reason is three to five hundred characters", () => {
        expect(previewUrl("diwali rao")).toBe("https://api.adx.in/p/diwali%20rao");
        expect(unpublishReason(" no ")).toBeNull();
        expect(unpublishReason("x".repeat(600))).toHaveLength(500);
    });
});
