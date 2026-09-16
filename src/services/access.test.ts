import { describe, expect, it } from "vitest";
import { grantState, shapeGrant, shapeScan, type WireGrant, type WireScan } from "./access";

/**
 * The shaping the console does to the door-to-door authority for ops.
 *
 * What is pinned: a grant is named by the party it opened, its purpose and
 * scope are said in words, its window is the claim (or the open) to the
 * expiry, and whether ops can still withdraw it follows from its status;
 * a scan says what code it was on and whether it was refused.
 */

const grant = (over: Partial<WireGrant> = {}): WireGrant => ({
    id: "grant_1",
    publisherId: "pub_1",
    advertiserId: null,
    assignedAgentId: "agt_1",
    reason: "Update my address",
    scope: "PROFILE",
    listingIds: [],
    purpose: "ONBOARDING",
    status: "ACTIVE",
    durationMinutes: 2880,
    qrId: "qr_1",
    createdAt: "2026-09-10T08:00:00.000Z",
    claimedAt: "2026-09-10T08:45:00.000Z",
    expiresAt: "2026-09-12T08:45:00.000Z",
    revokedAt: null,
    revokedById: null,
    publisher: { id: "pub_1", name: "Asha Rao", userId: "usr_1" },
    assignedAgent: { id: "agt_1", userId: "usr_agent" },
    ...over,
});

describe("shapeGrant", () => {
    it("names the party and says the purpose and scope in words", () => {
        const view = shapeGrant(grant());
        expect(view.party).toBe("Asha Rao");
        expect(view.partyType).toBe("publisher");
        expect(view.purpose).toBe("Onboarding");
        expect(view.scope).toBe("Profile");
        expect(view.from).toBe("2026-09-10T08:45:00.000Z");
        expect(view.until).toBe("2026-09-12T08:45:00.000Z");
        expect(view.canRevoke).toBe(true);
    });

    it("falls back to the open time when nothing claimed it, and names an unnamed party by id", () => {
        const view = shapeGrant(grant({ claimedAt: null, publisher: null, publisherId: null, advertiserId: "adv_1" }));
        expect(view.from).toBe("2026-09-10T08:00:00.000Z");
        expect(view.party).toBe("Advertiser adv_1");
        expect(view.partyType).toBe("advertiser");
    });

    it("can no longer be withdrawn once it ended", () => {
        expect(shapeGrant(grant({ status: "EXPIRED" })).canRevoke).toBe(false);
        expect(shapeGrant(grant({ status: "REVOKED", revokedAt: "2026-09-11T00:00:00.000Z" })).canRevoke).toBe(false);
        expect(shapeGrant(grant({ status: "PENDING", claimedAt: null })).canRevoke).toBe(true);
    });

    it("says a narrowed grant's listing count", () => {
        expect(shapeGrant(grant({ scope: "LISTINGS", listingIds: ["l1", "l2"] })).scope).toBe("2 listings");
        expect(shapeGrant(grant({ scope: "LISTINGS", listingIds: [] })).scope).toBe("All listings");
    });
});

describe("grantState", () => {
    it("reads the status in the console's tones", () => {
        expect(grantState("ACTIVE").tone).toBe("success");
        expect(grantState("PENDING").tone).toBe("warning");
        expect(grantState("REVOKED").tone).toBe("danger");
        expect(grantState("EXPIRED").tone).toBe("neutral");
    });
});

describe("shapeScan", () => {
    it("says the code, the outcome and how far away", () => {
        const scan: WireScan = {
            id: "scan_1",
            qrId: "qr_1",
            scannedById: "usr_agent",
            role: "AGENT_PUBLISHER",
            outcome: "NOT_AN_AGENT",
            distanceM: 1200,
            decidedAt: null,
            createdAt: "2026-09-10T08:44:00.000Z",
            qr: { id: "qr_1", type: "PUBLISHER", refId: "pub_1" },
        };
        const view = shapeScan(scan);
        expect(view.code).toBe("Publisher code · pub_1");
        expect(view.outcome).toBe("Refused — not an ADX agent");
        expect(view.refused).toBe(true);
        expect(view.distance).toBe("1.2 km");
    });
});
