import { describe, expect, it } from "vitest";
import { shapePublisher, shapePublisherDetail, type WirePublisherDetail } from "./supply";

/**
 * `GET /publishers/:id` to the page row.
 *
 * The rule is the roster one: what the API does not carry is null, never a
 * plausible stand-in. A publisher opened from the desk a moment ago has a
 * KYC row with nothing typed in, no listings and no account yet, and every
 * one of those reads as exactly that.
 */

const fresh: WirePublisherDetail = {
    id: "pub_new",
    displayId: "PUB-1409-2601",
    name: "Sharma Hoardings",
    mobile: "+919845012345",
    email: null,
    city: null,
    type: "INDIVIDUAL",
    kycStatus: "PENDING",
    onboardingStatus: "PENDING_ONBOARDING",
    agentId: null,
    createdAt: "2026-09-14T15:00:00.000Z",
    kyc: { panNumber: null },
    listings: [],
    user: null,
    openOrders: 0,
};

describe("shapePublisherDetail", () => {
    it("shapes the row a fresh POST /publishers leaves behind without inventing anything", () => {
        expect(shapePublisherDetail(fresh)).toEqual({
            id: "pub_new",
            displayId: "PUB-1409-2601",
            userId: null,
            user: null,
            openOrders: 0,
            name: "Sharma Hoardings",
            mobile: "+919845012345",
            email: null,
            city: null,
            type: "INDIVIDUAL",
            kycStatus: "PENDING",
            contactName: null,
            contactMobile: null,
            contactEmail: null,
            gstin: null,
            pan: null,
            sites: 0,
            agentId: null,
            onboardingStatus: "PENDING_ONBOARDING",
            createdAt: "2026-09-14T15:00:00.000Z",
            activatedAt: null,
            suspensionScopes: [],
            suspensionReason: null,
            suspendedAt: null,
            // QR-13: the address, its pin and the person — null on a row the desk opened without them.
            address: null,
            state: null,
            latitude: null,
            longitude: null,
            person: null,
            // QR-14: no stamp on a fresh desk row from an older server.
            onboarding: null,
            // N3-B: a row with nothing submitted is awaiting documents — derived from the mirror when the read predates `state`.
            kyc: { state: "AWAITING_DOCUMENTS", kycId: null, submittedAt: null, requestedAt: null, requestedChannel: null, method: null },
        });
    });

    it("N3-B: reads the party's KYC state off the read, and derives it from the mirror on a read that predates it", () => {
        expect(shapePublisherDetail({ ...fresh, kyc: { state: "REQUESTED", kycId: "pkyc_1", status: "PENDING", submittedAt: null, requestedAt: "2026-09-14T16:00:00.000Z", requestedChannel: "DIGIO", method: "DIGIO", panNumber: null } }).kyc).toEqual({
            state: "REQUESTED",
            kycId: "pkyc_1",
            submittedAt: null,
            requestedAt: "2026-09-14T16:00:00.000Z",
            requestedChannel: "DIGIO",
            method: "DIGIO",
        });
        expect(shapePublisherDetail({ ...fresh, kycStatus: "VERIFIED", kyc: null }).kyc.state).toBe("VERIFIED");
        expect(shapePublisherDetail({ ...fresh, kyc: { status: "PENDING", submittedAt: "2026-09-14T16:00:00.000Z", kycId: "pkyc_2" } }).kyc.state).toBe("PENDING");
    });

    it("reads the PAN off the KYC row, counts the listings, and keeps the relations E6 joins", () => {
        const shaped = shapePublisherDetail({
            ...fresh,
            userId: "usr_1",
            gstin: "27ABCDE1234F1Z5",
            contactName: "Priya Sharma",
            kyc: { panNumber: "ABCDE1234F" },
            listings: [{ id: "lst_1" }, { id: "lst_2" }],
            user: { closedAt: null, closeReason: null },
            openOrders: 2,
            agentId: "agt_1",
            suspensionScopes: ["BLOCK_NEW"],
        });
        expect(shaped).toMatchObject({
            userId: "usr_1",
            gstin: "27ABCDE1234F1Z5",
            contactName: "Priya Sharma",
            pan: "ABCDE1234F",
            sites: 2,
            user: { closedAt: null, closeReason: null },
            openOrders: 2,
            agentId: "agt_1",
            suspensionScopes: ["BLOCK_NEW"],
        });
    });

    it("tolerates a row older than the optional columns", () => {
        const { kyc: _kyc, listings: _listings, user: _user, openOrders: _open, ...bare } = fresh;
        expect(shapePublisherDetail(bare)).toMatchObject({ pan: null, sites: 0, user: null, openOrders: 0 });
    });
});

describe("shapePublisher (N2-B)", () => {
    it("carries the roster row's userId so the desk records under the account, and null until somebody registers", () => {
        expect(shapePublisher({ ...fresh, userId: "usr_pub" }).userId).toBe("usr_pub");
        expect(shapePublisher({ ...fresh, userId: null }).userId).toBeNull();
        expect(shapePublisher(fresh).userId).toBeNull();
    });
});
