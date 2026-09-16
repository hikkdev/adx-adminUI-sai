import { describe, expect, it } from "vitest";
import { shapeAdvertiserKyc, type WireAdvertiserKyc } from "./advertiser-kyc";

/**
 * The advertiser KYC row as the console reads it.
 *
 * What is pinned: the type's required documents are drawn whether or not they
 * were uploaded, a DR 08 self-service capture stands in for the legacy column
 * asking for the same paper, the extra DR 08 captures are listed, the case is
 * named for the account, and the SLA counts only while a review is pending.
 */

const wire = (over: Partial<WireAdvertiserKyc> = {}): WireAdvertiserKyc => ({
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
    govIdType: "AADHAAR",
    govIdFrontUrl: "https://cdn.adx.in/kyc/front.jpg",
    govIdBackUrl: "https://cdn.adx.in/kyc/back.jpg",
    panNumber: "ABCDE1234F",
    panSignatureUrl: "https://cdn.adx.in/kyc/pan.jpg",
    addressProofType: "UTILITY_BILL",
    addressProofUrl: null,
    selfieUrl: "https://cdn.adx.in/kyc/selfie.jpg",
    status: "PENDING",
    rejectionReason: null,
    submittedAt: "2026-09-10T08:00:00.000Z",
    reviewedAt: null,
    createdAt: "2026-09-10T07:00:00.000Z",
    advertiser: { id: "usr_adv", name: "Meera Iyer", mobile: "+919876500000", email: "meera@example.in" },
    ...over,
});

describe("shapeAdvertiserKyc", () => {
    it("draws the type's required documents, letting a DR 08 capture stand in for the same paper", () => {
        const kycCase = shapeAdvertiserKyc(wire(), 48, new Date("2026-09-10T10:00:00.000Z"));
        const byField = Object.fromEntries(kycCase.documents.map((doc) => [doc.field, doc]));
        expect(byField.nationalIdUrl.fileName).toBe("front.jpg");
        expect(byField.panCardUrl.fileName).toBe("pan.jpg");
        expect(byField.utilityBillUrl.fileName).toBeNull();
        expect(byField.drivingLicenseUrl.fileName).toBeNull();
        expect(byField.govIdBackUrl.label).toBe("Government ID · back");
        expect(byField.selfieUrl.url).toBe("https://cdn.adx.in/kyc/selfie.jpg");
    });

    it("names the case for the account and counts the SLA only while pending", () => {
        const pending = shapeAdvertiserKyc(wire(), 48, new Date("2026-09-10T10:00:00.000Z"));
        expect(pending.advertiser).toBe("Meera Iyer");
        expect(pending.contact).toBe("+919876500000");
        expect(pending.slaHoursLeft).toBeGreaterThan(0);
        const verified = shapeAdvertiserKyc(wire({ status: "VERIFIED", reviewedAt: "2026-09-10T09:00:00.000Z" }));
        expect(verified.slaHoursLeft).toBe(0);
        expect(verified.ageHours).toBeNull();
        const measured = shapeAdvertiserKyc(wire({ ageHours: 50, slaBreached: true }), 48);
        expect(measured).toMatchObject({ ageHours: 50, slaBreached: true, slaHoursLeft: -2 });
        expect(shapeAdvertiserKyc(wire({ advertiser: null })).advertiser).toBe("usr_adv");
    });

    it("carries the Digio session on a live row, and none when the advertiser only uploaded", () => {
        const digio = shapeAdvertiserKyc(
            wire({ method: "DIGIO", digioRequestId: "KID1", digioStatus: "pending", digioVerifiedAt: null, digioPayload: null })
        );
        expect(digio.method).toBe("DIGIO");
        expect(digio.digio).toEqual({ requestId: "KID1", referenceId: null, status: "pending", verifiedAt: null, message: null });
        const manual = shapeAdvertiserKyc(wire());
        expect(manual.method).toBe("MANUAL");
        expect(manual.digio).toBeNull();
    });

    it("falls back to an individual for a type it does not know", () => {
        expect(shapeAdvertiserKyc(wire({ kycType: "TRUST" })).kycType).toBe("INDIVIDUAL");
    });
});
