import { describe, expect, it } from "vitest";
import { KYC_STATE_CHIPS, kycStateFilter } from "./kyc-state";
import { buildPrintPartnerKycQuery, PRINT_PARTNER_KYC_FIELDS, shapePrintPartnerKyc, type WirePrintPartnerKyc } from "./print-partner-kyc";

/**
 * The print partner KYC desk — Lot N.
 *
 * What is pinned: every chip on the queue sends exactly one of
 * `printPartnerKycQueueQuerySchema`'s facets (status, requested, escalated,
 * assignedTo) and nothing typed here; and the row is shaped with the desk's
 * stamps — who asked (and whether it is still open), who recorded — beside
 * the ten tiles in the order the desk reads them.
 */

const wire = (over: Partial<WirePrintPartnerKyc> = {}): WirePrintPartnerKyc => ({
    id: "ppk_1",
    printPartnerId: "prt_1",
    panNumber: "ABCDE1234F",
    panFrontUrl: "https://api.adx.in/api/v1/files/f1",
    panSignatureUrl: null,
    gstUrl: "https://api.adx.in/api/v1/files/f2",
    businessRegCertUrl: null,
    businessAddressProofUrl: null,
    directorIdUrl: null,
    govIdType: "AADHAAR",
    govIdFrontUrl: null,
    govIdBackUrl: null,
    bankProofUrl: null,
    selfieUrl: null,
    digioRequestId: null,
    digioReferenceId: null,
    digioStatus: null,
    digioVerifiedAt: null,
    method: "MANUAL",
    status: "PENDING",
    rejectionReason: null,
    submittedAt: "2026-09-14T08:00:00.000Z",
    reviewedAt: null,
    reviewedById: null,
    reviewNote: null,
    assignedToId: null,
    assignedAt: null,
    imagesPurgedAt: null,
    requestedAt: "2026-09-13T10:00:00.000Z",
    requestedById: "usr_admin",
    requestedChannel: "MANUAL",
    recordedById: "usr_admin",
    recordedVia: "DESK",
    createdAt: "2026-09-13T10:00:00.000Z",
    printPartner: { id: "prt_1", displayId: "PRT-1409-2601", name: "Sharma Prints", mobile: "+919876543210", email: null, userId: "usr_partner", city: "Pune", isActive: true, kycStatus: "PENDING" },
    ageHours: 3,
    slaBreached: false,
    requestedBy: { id: "usr_admin", name: "Priya" },
    recordedBy: { id: "usr_admin", name: "Priya" },
    ...over,
});

describe("the partner queue's chips", () => {
    it("send exactly the server's facets, one per chip — N3-C: the six states and the Escalated flag", () => {
        const sent = Object.fromEntries(KYC_STATE_CHIPS.map((chip) => [chip, buildPrintPartnerKycQuery(kycStateFilter(chip))]));
        expect(sent).toEqual({
            all: "pageSize=100",
            AWAITING_DOCUMENTS: "pageSize=100&state=AWAITING_DOCUMENTS",
            REQUESTED: "pageSize=100&state=REQUESTED",
            PENDING: "pageSize=100&state=PENDING",
            NEEDS_INFO: "pageSize=100&state=NEEDS_INFO",
            REJECTED: "pageSize=100&state=REJECTED",
            VERIFIED: "pageSize=100&state=VERIFIED",
            ESCALATED: "pageSize=100&escalated=true",
        });
        // The legacy facets still build for the callers that hold them.
        expect(buildPrintPartnerKycQuery({ status: "PENDING" })).toBe("pageSize=100&status=PENDING");
        expect(buildPrintPartnerKycQuery({ requested: true })).toBe("pageSize=100&requested=true");
        expect(buildPrintPartnerKycQuery({ assignedTo: "me" })).toBe("pageSize=100&assignedTo=me");
    });

    it("carry the search and the sort beside a facet, trimmed", () => {
        expect(buildPrintPartnerKycQuery({ status: "PENDING", q: "  Sharma ", sort: "newest" })).toBe("pageSize=100&status=PENDING&q=Sharma&sort=newest");
        expect(buildPrintPartnerKycQuery({ requested: false })).toBe("pageSize=100&requested=false");
    });
});

describe("shapePrintPartnerKyc", () => {
    it("names the partner, lists the ten tiles in the desk's order and marks the two on file", () => {
        const kycCase = shapePrintPartnerKyc(wire(), 48);
        expect(kycCase.partnerName).toBe("Sharma Prints");
        expect(kycCase.userId).toBe("usr_partner");
        expect(kycCase.documents.map((item) => item.field)).toEqual(PRINT_PARTNER_KYC_FIELDS.map((item) => item.field));
        expect(kycCase.documents.filter((item) => item.url).map((item) => item.fileName)).toEqual(["f1", "f2"]);
        expect(kycCase.slaHoursLeft).toBe(45);
    });

    it("carries the desk's ask — closed once something was submitted — and who recorded", () => {
        const answered = shapePrintPartnerKyc(wire());
        expect(answered.request).toEqual({ at: "2026-09-13T10:00:00.000Z", by: { id: "usr_admin", name: "Priya" }, channel: "MANUAL", open: false });
        expect(answered.recorded).toEqual({ via: "DESK", by: { id: "usr_admin", name: "Priya" } });

        const waiting = shapePrintPartnerKyc(wire({ submittedAt: null, recordedById: null, recordedVia: null, recordedBy: null, requestedChannel: "DIGIO", method: "DIGIO", digioRequestId: "dg_1", digioStatus: "pending" }));
        expect(waiting.request?.open).toBe(true);
        expect(waiting.request?.channel).toBe("DIGIO");
        expect(waiting.recorded).toBeNull();
        expect(waiting.digio?.status).toBe("pending");
    });

    it("prints the id when the label lookup found no name, and nothing when nobody asked", () => {
        const unnamed = shapePrintPartnerKyc(wire({ requestedBy: null, recordedBy: null }));
        expect(unnamed.request?.by).toEqual({ id: "usr_admin", name: null });
        const nobody = shapePrintPartnerKyc(wire({ requestedAt: null, requestedById: null, requestedChannel: null, requestedBy: null }));
        expect(nobody.request).toBeNull();
    });
});
