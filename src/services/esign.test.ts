import { describe, expect, it } from "vitest";
import { SIGNABLE_KINDS_FOR, SIGNING_STATUS_META, signingOpen, signingPartyHref, signingQuery } from "./agreements";
import { signingLine } from "./print-partners";
import { fromDraft } from "@/app/(admin)/settings/esign/esign-view";

/**
 * DS-1 (Digio eSign): the pure helpers the Signatures desk, the party pages
 * and Settings › E-signing lean on.
 */

const formatDate = (iso: string) => `d(${iso.slice(0, 10)})`;

describe("the signing line on a party page", () => {
    it("says nothing while the policy asks for nothing, and reads the standing otherwise", () => {
        expect(signingLine(undefined, formatDate)).toBeNull();
        expect(signingLine({ required: false, satisfied: true, status: null, requestId: null, signingUrl: null, mock: false, expiresAt: null, completedAt: null, signedFileId: null }, formatDate)).toBeNull();
        expect(signingLine({ required: true, satisfied: true, status: "COMPLETED", requestId: "s1", signingUrl: null, mock: false, expiresAt: null, completedAt: "2026-09-22T10:00:00Z", signedFileId: "f2" }, formatDate)).toBe("Signed d(2026-09-22)");
        expect(signingLine({ required: true, satisfied: false, status: "REQUESTED", requestId: "s1", signingUrl: "u", mock: false, expiresAt: "2026-10-07T00:00:00Z", completedAt: null, signedFileId: null }, formatDate)).toBe("Awaiting signature — link good until d(2026-10-07)");
        expect(signingLine({ required: true, satisfied: false, status: "EXPIRED", requestId: "s1", signingUrl: null, mock: false, expiresAt: null, completedAt: null, signedFileId: null }, formatDate)).toMatch(/expired/);
        expect(signingLine({ required: true, satisfied: false, status: null, requestId: null, signingUrl: null, mock: false, expiresAt: null, completedAt: null, signedFileId: null }, formatDate)).toMatch(/Not sent yet/);
    });
});

describe("the Signatures desk's helpers", () => {
    it("knows which requests are still open, where each party lives, and builds the query", () => {
        expect(signingOpen({ status: "REQUESTED" })).toBe(true);
        expect(signingOpen({ status: "PARTIALLY_SIGNED" })).toBe(true);
        expect(signingOpen({ status: "COMPLETED" })).toBe(false);
        expect(signingPartyHref({ partyType: "PUBLISHER", partyId: "pub_1", campaignId: null })).toBe("/publishers/pub_1");
        expect(signingPartyHref({ partyType: "ADVERTISER", partyId: "adv_1", campaignId: "cmp_1" })).toBe("/campaigns/cmp_1");
        expect(signingPartyHref({ partyType: "ADVERTISER", partyId: "adv_1", campaignId: null })).toBe("/advertisers/adv_1");
        expect(signingPartyHref({ partyType: "EMPLOYEE", partyId: "emp_1", campaignId: null })).toBeNull();
        expect(signingQuery({ status: "REQUESTED", partyType: "AGENT", q: "", limit: 50 })).toBe("?status=REQUESTED&partyType=AGENT&limit=50");
        expect(signingQuery({})).toBe("");
        expect(SIGNABLE_KINDS_FOR.AGENT).toEqual(["AGENT_PUBLISHER_PLATFORM", "AGENT_ADVERTISER_PLATFORM"]);
        expect(SIGNING_STATUS_META.CANCELLED.label).toBe("Voided");
    });
});

describe("Settings › E-signing", () => {
    const draft = {
        enabled: true,
        signMethod: "AADHAAR" as const,
        expireInDays: "15",
        countersign: false,
        notifyThroughDigio: true,
        documents: { AGENT_ENGAGEMENT: true, EMPLOYEE_APPOINTMENT: true, PRINT_PARTNER_SERVICE: false, PUBLISHER_LICENCE: true, INSERTION_ORDER: true },
        valueThreshold: "100000",
        bands: ["LARGE_AGENCY" as const],
        publisherLicenceAt: "FIRST_APPROVED_LISTING" as const,
        resignOnNewVersion: false,
        stampDuty: [{ document: "PUBLISHER_LICENCE" as const, state: "ka", amount: "100", article: " " }],
    };

    it("turns the draft into the policy, upper-casing the state and dropping a blank article", () => {
        expect(fromDraft(draft)).toEqual({
            enabled: true,
            signMethod: "AADHAAR",
            expireInDays: 15,
            countersign: false,
            notifyThroughDigio: true,
            documents: draft.documents,
            insertionOrder: { valueThreshold: 100000, bands: ["LARGE_AGENCY"] },
            publisherLicenceAt: "FIRST_APPROVED_LISTING",
            resignOnNewVersion: false,
            stampDuty: [{ document: "PUBLISHER_LICENCE", state: "KA", amount: 100 }],
        });
    });

    it("refuses what the schema would: a life outside 1–90 days, a threshold that is not a number, a state that is not a code, a stamp with no amount", () => {
        expect(fromDraft({ ...draft, expireInDays: "0" })).toBeNull();
        expect(fromDraft({ ...draft, expireInDays: "91" })).toBeNull();
        expect(fromDraft({ ...draft, valueThreshold: "1,00,000" })).toBeNull();
        expect(fromDraft({ ...draft, stampDuty: [{ document: "INSERTION_ORDER", state: "Karnataka", amount: "100", article: "" }] })).toBeNull();
        expect(fromDraft({ ...draft, stampDuty: [{ document: "INSERTION_ORDER", state: "KA", amount: "", article: "" }] })).toBeNull();
    });
});
