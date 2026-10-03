import { describe, expect, it } from "vitest";
import { advertiserBody, advertiserStatus, lastActivityAt, shapeAdvertiser } from "./advertisers";

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

describe("the entity type (Phase D)", () => {
    const wire = { id: "adv_1", name: "Zomato", displayId: null, contact: "9876543210", email: null, type: "COMMERCIAL" as const, companyName: null, gstin: null, city: null, state: null, kycStatus: "PENDING" as const, activatedAt: null, createdAt: "2026-01-08T00:00:00.000Z" };

    it("carries the effective entity type and whether it is stored, off the by-id read and a roster row alike", () => {
        expect(shapeAdvertiser({ ...wire, entityType: "LLP_PARTNERSHIP", entityTypeStored: true })).toMatchObject({ entityType: "LLP_PARTNERSHIP", entityTypeStored: true });
        expect(shapeAdvertiser({ ...wire, type: "INDIVIDUAL", entityType: "INDIVIDUAL", entityTypeStored: false })).toMatchObject({ entityType: "INDIVIDUAL", entityTypeStored: false });
    });

    it("is null and not stored for a commercial account nobody has typed, and on a server older than the column", () => {
        expect(shapeAdvertiser({ ...wire, entityType: null, entityTypeStored: false })).toMatchObject({ entityType: null, entityTypeStored: false });
        expect(shapeAdvertiser(wire)).toMatchObject({ entityType: null, entityTypeStored: false });
    });

    it("rides the PATCH only when the desk names one", () => {
        expect(advertiserBody({ city: "Pune", entityType: "COMPANY" })).toEqual({ city: "Pune", entityType: "COMPANY" });
        expect(advertiserBody({ city: "Pune" })).not.toHaveProperty("entityType");
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

describe("the roster's contact and KYC (29 Sep 2026)", () => {
    const wire = { id: "adv_9", name: "Satyapal Raj", displayId: "ADV-2509-2603", mobile: "+919507842149", email: "satya@example.com", type: "INDIVIDUAL", companyName: null, gstin: null, city: null, state: null, kycStatus: "PENDING", activatedAt: null, createdAt: "2026-09-25T00:00:00.000Z" };

    it("reads the phone the backend sends (mobile) into the Contact column, with the email beside it", () => {
        const row = shapeAdvertiser(wire as never);
        expect(row.contact).toBe("+919507842149");
        expect(row.email).toBe("satya@example.com");
    });

    it("carries the KYC state the roster read sends", () => {
        expect(shapeAdvertiser({ ...wire, kyc: { state: "PENDING", kycId: "kyc_1", submittedAt: "2026-09-26T00:00:00.000Z" } } as never).kyc?.state).toBe("PENDING");
        expect(shapeAdvertiser({ ...wire, kyc: { state: "AWAITING_DOCUMENTS" } } as never).kyc?.state).toBe("AWAITING_DOCUMENTS");
    });
});
