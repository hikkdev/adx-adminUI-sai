import { describe, expect, it } from "vitest";
import { advertiserStatus, lastActivityAt, shapeAdvertiser } from "./advertisers";

/**
 * Whether an advertiser can spend, and how the console says so.
 *
 * `status` is the console's own word for two facts the backend keeps apart, and
 * it is the field an operator reads to decide whether to chase somebody. Getting
 * it wrong in the safe direction — calling a half-onboarded account active —
 * sends a campaign at an account that cannot pay for it.
 */

describe("deriving an account's status", () => {
    /** Both gates or neither: `activatedAt` is only set once KYC is verified
     *  *and* the platform agreement has been accepted. */
    it("is active only once the account has actually been activated", () => {
        expect(advertiserStatus({ kycStatus: "VERIFIED", activatedAt: "2026-01-10" })).toBe(
            "active"
        );
    });

    it("is not active on verified KYC alone", () => {
        expect(advertiserStatus({ kycStatus: "VERIFIED", activatedAt: null })).toBe("pending");
    });

    it("is pending while KYC is still pending", () => {
        expect(advertiserStatus({ kycStatus: "PENDING", activatedAt: null })).toBe("pending");
    });

    /** The one state somebody has to act on rather than wait for. */
    it("calls out a rejected KYC separately", () => {
        expect(advertiserStatus({ kycStatus: "REJECTED", activatedAt: null })).toBe("rejected");
    });
});

describe("shaping the row", () => {
    const wire = {
        id: "cmzAdv001",
        name: "Zomato",
        displayId: "ADV-1909-2601",
        contact: "+919812340001",
        email: "amit@zomato.com",
        type: "COMMERCIAL" as const,
        companyName: "Zomato Limited",
        gstin: "27ZMTOI1234A1Z5",
        city: "Mumbai",
        state: "Maharashtra",
        kycStatus: "VERIFIED" as const,
        activatedAt: "2026-01-10",
        createdAt: "2026-01-08",
    };

    /** The API calls it `createdAt`; the console has always shown "Joined". */
    it("renames createdAt to the thing the page calls it", () => {
        expect(shapeAdvertiser(wire).joinedAt).toBe("2026-01-08");
    });

    it("computes the status rather than expecting one on the wire", () => {
        expect(shapeAdvertiser(wire).status).toBe("active");
        expect(shapeAdvertiser({ ...wire, activatedAt: null }).status).toBe("pending");
    });

    /** An account with no display id yet must not render "undefined". */
    it("normalises the optional fields to null", () => {
        const thin = shapeAdvertiser({
            ...wire,
            displayId: null,
            email: null,
            companyName: null,
            gstin: null,
            city: null,
            state: null,
        });
        expect(thin.displayId).toBeNull();
        expect(thin.gstin).toBeNull();
        expect(thin.city).toBeNull();
    });
});

describe("the last activity — Lot G (CG3)", () => {
    it("is the newest `at` on the summary's feed, whatever order the server merged it in", () => {
        expect(
            lastActivityAt({
                activity: [
                    { kind: "CHECK_IN", at: "2026-09-10T09:00:00.000Z", title: "Checked in", detail: null },
                    { kind: "CAMPAIGN_LIVE", at: "2026-09-13T11:30:00.000Z", title: "Went live", detail: null },
                    { kind: "PACKAGE_PAID", at: "2026-09-12T08:00:00.000Z", title: "Paid", detail: null },
                ],
            }),
        ).toBe("2026-09-13T11:30:00.000Z");
    });

    it("is null while the feed is empty or the summary could not be read — the tile then says nothing", () => {
        expect(lastActivityAt({ activity: [] })).toBeNull();
        expect(lastActivityAt({})).toBeNull();
        expect(lastActivityAt(null)).toBeNull();
        expect(lastActivityAt({ activity: [{ kind: "X", at: "not a date", title: "", detail: null }] })).toBeNull();
    });

    it("carries the industry off the row, null when the server did not send one", () => {
        const base = { id: "adv_1", name: "Zomato", displayId: null, contact: "9876543210", email: null, type: "COMMERCIAL" as const, companyName: null, gstin: null, city: null, state: null, kycStatus: "VERIFIED" as const, activatedAt: null, createdAt: "2026-01-08T00:00:00.000Z" };
        expect(shapeAdvertiser({ ...base, industry: "Food & beverage" }).industry).toBe("Food & beverage");
        expect(shapeAdvertiser(base).industry).toBeNull();
    });
});
