import { describe, expect, it } from "vitest";
import {
    acceptanceAnchor,
    acceptanceQuery,
    acceptanceScope,
    kindCoverage,
    liveVersion,
    partyOf,
    versionsOf,
    type AgreementTemplate,
} from "./agreements";

/**
 * The reading the Agreements screens do before they draw anything.
 *
 * The one that matters is `kindCoverage`: it decides whether the screen says
 * "Publishers cannot get past their agreement gate" — which is the stall D9
 * exists to end — and getting it wrong in the quiet direction hides the stall
 * behind a screen that looks fine.
 */

const template = (over: Partial<AgreementTemplate>): AgreementTemplate => ({
    id: `tpl_${over.kind ?? "PLATFORM"}_${over.version ?? 1}`,
    kind: "PLATFORM",
    version: 1,
    title: "Terms",
    body: "# Terms",
    isActive: false,
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    activatedAt: null,
    retiredAt: null,
    createdByUserId: null,
    changeNote: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    acceptanceCount: 0,
    state: "DRAFT",
    requiresReacceptance: false,
    ...over,
});

describe("what each kind has", () => {
    it("calls an empty platform kind stalled, because every party of that type is stuck on it", () => {
        const coverage = kindCoverage([]);
        expect(coverage.PLATFORM.stalled).toBe(true);
        expect(coverage.ADVERTISER_PLATFORM.stalled).toBe(true);
    });

    /** A missing listing agreement stalls a batch, not a publisher. */
    it("does not call an empty per-deal kind stalled", () => {
        const coverage = kindCoverage([]);
        expect(coverage.LISTING.stalled).toBe(false);
        expect(coverage.INSERTION_ORDER.stalled).toBe(false);
    });

    it("is not satisfied by a draft — only a live version ends the stall", () => {
        const coverage = kindCoverage([template({ kind: "PLATFORM", version: 1, state: "DRAFT" })]);
        expect(coverage.PLATFORM).toMatchObject({ live: null, drafts: 1, total: 1, stalled: true });
    });

    it("finds the live version and counts the rest", () => {
        const live = template({ kind: "PLATFORM", version: 2, state: "ACTIVE", isActive: true });
        const coverage = kindCoverage([
            template({ kind: "PLATFORM", version: 1, state: "SUPERSEDED" }),
            live,
            template({ kind: "PLATFORM", version: 3, state: "DRAFT" }),
        ]);
        expect(coverage.PLATFORM).toMatchObject({ live, drafts: 1, total: 3, stalled: false });
        /* Publisher terms being live says nothing about the advertiser side. */
        expect(coverage.ADVERTISER_PLATFORM.stalled).toBe(true);
    });
});

describe("versions", () => {
    it("lists a kind newest first and leaves the other kinds out", () => {
        const versions = versionsOf(
            [
                template({ kind: "LISTING", version: 1 }),
                template({ kind: "PLATFORM", version: 1 }),
                template({ kind: "PLATFORM", version: 3 }),
                template({ kind: "PLATFORM", version: 2 }),
            ],
            "PLATFORM"
        );
        expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    });

    it("answers null for the live version when nothing is live", () => {
        expect(liveVersion([template({ kind: "PLATFORM", state: "SUPERSEDED" })], "PLATFORM")).toBeNull();
    });
});

describe("reading an acceptance", () => {
    const base = { publisher: null, advertiser: null, publisherId: null, advertiserId: null };

    it("names the side that is set, with the joined party when the API sent it", () => {
        expect(
            partyOf({ ...base, publisher: { id: "pub_1", displayId: "PUB-1909-2601", name: "Sharma Hoardings" }, publisherId: "pub_1" })
        ).toEqual({ type: "publisher", id: "pub_1", displayId: "PUB-1909-2601", name: "Sharma Hoardings" });
        expect(
            partyOf({ ...base, advertiser: { id: "adv_1", displayId: null, name: "Zomato" }, advertiserId: "adv_1" })
        ).toEqual({ type: "advertiser", id: "adv_1", displayId: null, name: "Zomato" });
    });

    it("still names the side from the bare id when the join came back thin", () => {
        expect(partyOf({ ...base, advertiserId: "adv_1" })).toMatchObject({ type: "advertiser", id: "adv_1" });
        expect(partyOf(base)).toBeNull();
    });

    it("says what a per-deal acceptance covers, and calls the platform kinds what they are", () => {
        expect(acceptanceScope({ templateKind: "LISTING", attemptId: "cmz000000att041", campaignId: null })).toBe("Attempt ATT041");
        expect(acceptanceScope({ templateKind: "INSERTION_ORDER", attemptId: null, campaignId: "cmz000000cmp007" })).toBe("Campaign CMP007");
        expect(acceptanceScope({ templateKind: "PLATFORM", attemptId: null, campaignId: null })).toBe("Platform terms");
        expect(acceptanceScope({ templateKind: "ADVERTISER_PLATFORM", attemptId: null, campaignId: null })).toBe("Platform terms");
    });

    /** Lot D (Q123/Q55): the two transaction kinds that landed with the sale and the job. */
    it("anchors a package sale on the sale and job terms on the order, each with the console page that opens it", () => {
        expect(acceptanceAnchor({ templateKind: "PACKAGE_SALE", attemptId: null, campaignId: null, packageSaleId: "cmz000000sal012" })).toEqual({
            kind: "PACKAGE_SALE",
            label: "Package sale SAL012",
            href: "/packages",
        });
        expect(acceptanceAnchor({ templateKind: "JOB_TERMS", attemptId: null, campaignId: null, orderId: "cmz000000ord099" })).toEqual({
            kind: "ORDER",
            label: "Order ORD099",
            href: "/orders/cmz000000ord099",
        });
        expect(acceptanceAnchor({ templateKind: "INSERTION_ORDER", attemptId: null, campaignId: "cmz000000cmp007" }).href).toBe(
            "/campaigns/cmz000000cmp007",
        );
    });

    it("names an agent's own acceptance as the agent's", () => {
        expect(partyOf({ ...base, agentId: "agt_1" })).toMatchObject({ type: "agent", id: "agt_1" });
    });
});

describe("the acceptance query string", () => {
    it("writes only what is set", () => {
        expect(acceptanceQuery({})).toBe("");
        expect(acceptanceQuery({ publisherId: "pub_1", limit: 50 })).toBe("?publisherId=pub_1&limit=50");
        expect(acceptanceQuery({ kind: "LISTING", cursor: undefined })).toBe("?kind=LISTING");
    });
});
