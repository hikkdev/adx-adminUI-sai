import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * N2-C — the advertiser KYC desk follows the N2-B contract.
 *
 * 1. The party page reads the one advertiser's row through
 *    `GET /advertiser-kyc?advertiserId=` — not by scanning the queue — and
 *    answers null when the filter finds nothing.
 * 2. The desk's PUT goes over whichever id the page holds: the row id when
 *    there is one, the advertiser's user id when there is not (the server
 *    creates the row).
 *
 * N3-B / N3-C: the record belongs to the PROFILE — the queue lists every
 * profile (a party-only row shaped from the profile slice), the party page
 * reads by the profile id, and the desk's PUT and the one-click Digio
 * request go over it (the last describe).
 */

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: undefined as unknown,
        reset() {
            this.calls = [];
            this.answer = undefined;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { advertiserKycService, shapeAdvertiserKyc, type WireAdvertiserKyc } from "./advertiser-kyc";

const row = (over: Partial<WireAdvertiserKyc> = {}): WireAdvertiserKyc => ({
    id: "akyc_1",
    advertiserId: "usr_adv",
    kycType: "INDIVIDUAL",
    nationalIdUrl: null,
    panCardUrl: null,
    utilityBillUrl: null,
    drivingLicenseUrl: null,
    commercialIncCertUrl: null,
    commercialAssociationArticleUrl: null,
    commercialPanIdUrl: null,
    commercialGstCertUrl: null,
    ngoRegCertUrl: null,
    ngo80gCertUrl: null,
    ngoFcraRegUrl: null,
    agencyAuthLetterUrl: null,
    agencyGovtIdUrl: null,
    govIdType: null,
    govIdFrontUrl: null,
    govIdBackUrl: null,
    panNumber: null,
    panSignatureUrl: null,
    addressProofType: null,
    addressProofUrl: null,
    selfieUrl: null,
    status: "PENDING",
    rejectionReason: null,
    submittedAt: "2026-09-10T08:00:00.000Z",
    reviewedAt: null,
    createdAt: "2026-09-10T07:00:00.000Z",
    ...over,
});

beforeEach(() => backend.reset());

describe("advertiserKycService.findForUser", () => {
    it("reads the advertiser's row through the advertiserId filter, not the queue", async () => {
        backend.answer = { items: [row()], total: 1, page: 1, pageSize: 1, counts: {}, breached: 0, slaHours: 48 };
        const found = await advertiserKycService.findForUser("usr_adv");
        expect(backend.calls).toEqual([{ method: "GET", path: "/advertiser-kyc?advertiserId=usr_adv&pageSize=1", body: undefined }]);
        expect(found?.id).toBe("akyc_1");
        expect(found?.advertiserId).toBe("usr_adv");
    });

    it("answers null when the filter finds no row", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 1, counts: {}, breached: 0, slaHours: 48 };
        expect(await advertiserKycService.findForUser("usr_nobody")).toBeNull();
    });
});

describe("advertiserKycService.recordAtDesk", () => {
    it("PUTs over the row id when there is one and over the user id when there is not", async () => {
        backend.answer = row();
        await advertiserKycService.recordAtDesk("akyc_1", { panCardUrl: "https://cdn.adx.in/kyc/pan.jpg" });
        await advertiserKycService.recordAtDesk("usr_adv", { panCardUrl: "https://cdn.adx.in/kyc/pan.jpg", kycType: "INDIVIDUAL" });
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["PUT /advertiser-kyc/akyc_1", "PUT /advertiser-kyc/usr_adv"]);
        expect(backend.calls[1]?.body).toMatchObject({ kycType: "INDIVIDUAL" });
    });
});

/* ------------------------------------------------------------------ */
/* N3-B / N3-C — the record belongs to the PROFILE                     */
/* ------------------------------------------------------------------ */

/** A queue row for a console-created advertiser with no user and no record — the party alone, as N3-B sends it. */
const profile = { id: "adv_swiggy", displayId: "ADV-1409-2601", name: "Swiggy", companyName: "Bundl Technologies", email: "ops@swiggy.in", mobile: "+919800000000", city: "Bengaluru", userId: null, kycStatus: "PENDING", type: "COMMERCIAL", createdAt: "2026-09-14T20:00:00.000Z" };
const partyOnly = (): WireAdvertiserKyc => ({
    ...row({ id: "adv_swiggy", advertiserId: null, kycType: null, status: null, submittedAt: null, createdAt: null }),
    kycId: null,
    state: "AWAITING_DOCUMENTS",
    party: profile,
    advertiser: profile,
});

describe("the advertiser record over the profile id (N3-B / N3-C)", () => {
    it("shapes a party-only row from the profile: the profile id is the key, no record, no user, the state the server's", () => {
        const shaped = shapeAdvertiserKyc(partyOnly(), 48, new Date("2026-09-15T00:00:00.000Z"));
        expect(shaped).toMatchObject({
            id: "adv_swiggy",
            profileId: "adv_swiggy",
            advertiserId: null,
            userId: null,
            kycId: null,
            state: "AWAITING_DOCUMENTS",
            displayId: "ADV-1409-2601",
            city: "Bengaluru",
            createdAt: "2026-09-14T20:00:00.000Z",
            advertiser: "Bundl Technologies",
            contact: "+919800000000",
            kycType: "COMMERCIAL",
            // The mirror stands in for the record's status; nothing submitted, so no clock runs.
            status: "PENDING",
            ageHours: null,
            request: null,
        });
        // A row with a record keeps the record's id and the profile beside it.
        const withRecord = shapeAdvertiserKyc({ ...partyOnly(), id: "akyc_9", kycId: "akyc_9", state: "PENDING", status: "PENDING", submittedAt: "2026-09-14T21:00:00.000Z", advertiserProfileId: "adv_swiggy" });
        expect(withRecord).toMatchObject({ id: "akyc_9", kycId: "akyc_9", profileId: "adv_swiggy", state: "PENDING" });
    });

    it("the party page reads the row by the PROFILE id, and the desk's PUT and the one click go over it", async () => {
        backend.answer = { items: [partyOnly()], total: 1, page: 1, pageSize: 1, counts: {}, breached: 0, slaHours: 48 };
        const found = await advertiserKycService.findForAdvertiser("adv_swiggy");
        expect(backend.calls).toEqual([{ method: "GET", path: "/advertiser-kyc?advertiserId=adv_swiggy&pageSize=1", body: undefined }]);
        expect(found?.profileId).toBe("adv_swiggy");
        expect(found?.kycId).toBeNull();

        backend.reset();
        backend.answer = row();
        await advertiserKycService.recordAtDesk("adv_swiggy", { panCardUrl: "https://cdn.adx.in/kyc/pan.jpg", kycType: "COMMERCIAL" });
        backend.answer = { kyc: row(), digio: null, notified: false };
        const asked = await advertiserKycService.requestDigio("adv_swiggy");
        expect(backend.calls).toEqual([
            { method: "PUT", path: "/advertiser-kyc/adv_swiggy", body: { panCardUrl: "https://cdn.adx.in/kyc/pan.jpg", kycType: "COMMERCIAL" } },
            // The one click: no body at all — the server defaults the channel to DIGIO.
            { method: "POST", path: "/advertiser-kyc/adv_swiggy/request", body: undefined },
        ]);
        // No app account: the Digio link went to the profile's contact and nobody was told.
        expect(asked.notified).toBe(false);
    });

    it("the state chip sends `state=` on the advertiser queue, and the search box `q=`", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 100, counts: { AWAITING_DOCUMENTS: 2, awaitingDocuments: 2, REQUESTED: 0, PENDING: 0, NEEDS_INFO: 0, REJECTED: 0, VERIFIED: 0, escalated: 0, requested: 0 }, breached: 0, slaHours: 48 };
        const queue = await advertiserKycService.queue({ state: "AWAITING_DOCUMENTS", q: "Swiggy" });
        expect(backend.calls[0]?.path).toBe("/advertiser-kyc?pageSize=100&state=AWAITING_DOCUMENTS&q=Swiggy");
        expect(queue.counts.AWAITING_DOCUMENTS).toBe(2);
    });
});
