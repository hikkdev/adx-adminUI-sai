import { describe, expect, it } from "vitest";
import { kycStateFilter, KYC_STATE_CHIPS } from "./kyc-state";
import {
    autoEscalationHours,
    buildKycQueueQuery,
    dealCases,
    documentDecisionBody,
    escalationChip,
    escalationOf,
    kycRequestBody,
    personLabel,
    flaggedFields,
    recordedLine,
    recordedOf,
    requestLine,
    requestOf,
    requestOutcome,
    reviewBody,
    shapeKycCase,
    slaHoursLeftOf,
    type WireKycRow,
} from "./kyc";

/**
 * The shaping the console does to a publisher's KYC row for the queue and the
 * workbench.
 *
 * The API sends the row as the database holds it — a column per document —
 * and the console draws documents as a list, a status in its own vocabulary,
 * the review SLA the server measured, and who brought the publisher in (or
 * the fact that nobody did). These pin each translation, and the two that
 * matter most to ops: a self-onboarded publisher is named as such, and the
 * typed PAN shows up as a check rather than as a picture. Lot D adds the
 * per-document decision bodies and the round-robin behind "Assign reviewers".
 */

const SLA = 48;

const wire = (over: Partial<WireKycRow> = {}): WireKycRow => ({
    id: "pub_1",
    displayId: "PUB-1009-2601",
    name: "Asha Rao",
    mobile: "+919876543210",
    email: null,
    type: "INDIVIDUAL",
    contactName: null,
    city: "Bengaluru",
    state: "Karnataka",
    gstin: null,
    userId: "usr_1",
    kycStatus: "PENDING",
    onboardingStatus: "ONBOARDING_COMPLETE",
    createdAt: "2026-09-09T10:00:00.000Z",
    agent: null,
    ageHours: 2,
    slaBreached: false,
    kyc: {
        id: "kyc_1",
        status: "PENDING",
        method: "MANUAL",
        submittedAt: "2026-09-10T08:00:00.000Z",
        reviewedAt: null,
        rejectionReason: null,
        govIdType: "PASSPORT",
        govIdFrontUrl: "https://cdn.adx.in/kyc/1.jpg",
        govIdBackUrl: "https://cdn.adx.in/kyc/2.jpg",
        panNumber: "ABCDE1234F",
        panFrontUrl: "https://cdn.adx.in/kyc/3.jpg",
        panSignatureUrl: null,
        addressProofType: "RENT_AGREEMENT",
        addressProofUrl: "https://cdn.adx.in/kyc/4.jpg",
        selfieUrl: "https://cdn.adx.in/kyc/5.jpg",
        aadhaarFrontUrl: null,
        aadhaarBackUrl: null,
        panBackUrl: null,
        gstUrl: null,
        bankStatement: null,
        digioStatus: null,
        digioVerifiedAt: null,
    },
    ...over,
});

describe("shapeKycCase", () => {
    it("lists each document the row holds, named for what it is", () => {
        const kycCase = shapeKycCase(wire(), SLA);
        expect(kycCase.documents.map((doc) => doc.type)).toEqual([
            "Government ID · front (Passport)",
            "Government ID · back",
            "PAN card",
            "Address proof (Rent agreement)",
            "Live selfie",
        ]);
        expect(kycCase.documents[0]?.url).toBe("https://cdn.adx.in/kyc/1.jpg");
        expect(kycCase.documents[0]?.field).toBe("govIdFrontUrl");
    });

    it("maps NEEDS_INFO into the queue's own chip, and carries the desk's stamps", () => {
        const kycCase = shapeKycCase(
            wire({
                kyc: { ...wire().kyc!, status: "NEEDS_INFO", reviewNote: "Blurry PAN", reviewedById: "adm_1", assignedToId: "adm_2", imagesPurgedAt: null },
                documentReviews: [
                    { id: "r1", field: "panFrontUrl", decision: "FLAGGED", note: "Blurry", reviewedById: "adm_1", reviewedAt: "2026-09-10T09:00:00.000Z" },
                ],
                liveness: { id: "uk1", status: "PENDING", submittedAt: "2026-09-10T08:30:00.000Z", reviewedAt: null, rejectionReason: null, fileId: "f1", recordedById: "usr_1" },
            }),
            SLA
        );
        expect(kycCase.status).toBe("NEEDS_INFO");
        expect(kycCase.kycStatus).toBe("NEEDS_INFO");
        expect(kycCase).toMatchObject({ reviewNote: "Blurry PAN", reviewedById: "adm_1", assignedToId: "adm_2", userId: "usr_1" });
        expect(flaggedFields(kycCase.documentReviews)).toEqual([{ field: "panFrontUrl", note: "Blurry" }]);
        expect(kycCase.liveness?.fileId).toBe("f1");
    });

    it("reads the SLA the server measured rather than counting its own", () => {
        expect(shapeKycCase(wire(), SLA)).toMatchObject({ ageHours: 2, slaBreached: false, slaHoursLeft: 46 });
        expect(shapeKycCase(wire({ ageHours: 50, slaBreached: true }), SLA)).toMatchObject({ slaBreached: true, slaHoursLeft: -2 });
    });

    it("shows the typed PAN as a check, not a picture", () => {
        const kycCase = shapeKycCase(wire(), SLA);
        expect(kycCase.checks).toContainEqual({ label: "PAN number", detail: "ABCDE1234F", result: "manual" });
    });

    it("carries the row's status in the backend's own word (R-C: no lowercase case vocabulary)", () => {
        expect(shapeKycCase(wire(), SLA).status).toBe("PENDING");
        expect(shapeKycCase(wire({ kyc: { ...wire().kyc!, status: "VERIFIED" } }), SLA).status).toBe("VERIFIED");
        expect(shapeKycCase(wire({ kyc: { ...wire().kyc!, status: "REJECTED", rejectionReason: "Blurry" } }), SLA).status).toBe("REJECTED");
    });

    it("names a self-onboarded publisher as such, and an agent by name and id", () => {
        expect(shapeKycCase(wire(), SLA)).toMatchObject({ selfOnboarded: true, agent: null });
        const brought = shapeKycCase(wire({ agent: { id: "agt_1", displayId: "AGT-1009-2601", user: { name: "Rahul Kumar" } } }), SLA);
        expect(brought).toMatchObject({ selfOnboarded: false, agent: { name: "Rahul Kumar", displayId: "AGT-1009-2601" } });
    });

    it("keys the case on the publisher, for the review call", () => {
        expect(shapeKycCase(wire(), SLA).publisherId).toBe("pub_1");
        expect(shapeKycCase(wire(), SLA).id).toBe("pub_1");
    });

    it("says Individual for a person and Company for the rest", () => {
        expect(shapeKycCase(wire(), SLA).businessType).toBe("Individual");
        expect(shapeKycCase(wire({ type: "NGO" }), SLA).businessType).toBe("Company");
    });

    it("notes a Digio verification as a check", () => {
        const digio = shapeKycCase(wire({ kyc: { ...wire().kyc!, method: "DIGIO", digioStatus: "approved" } }), SLA);
        expect(digio.checks).toContainEqual({ label: "Digio", detail: "approved", result: "pass" });
    });

    it("carries the Digio session for the desk, and none for a case that never had one", () => {
        const rejected = shapeKycCase(wire({
                kyc: {
                    ...wire().kyc!,
                    method: "DIGIO",
                    digioRequestId: "KID260910",
                    digioStatus: "rejected",
                    digioVerifiedAt: "2026-09-10T09:00:00.000Z",
                    digioPayload: { message: "Aadhaar name does not match PAN" },
                },
            }), SLA);
        expect(rejected.digio).toEqual({
            requestId: "KID260910",
            referenceId: null,
            status: "rejected",
            verifiedAt: "2026-09-10T09:00:00.000Z",
            message: "Aadhaar name does not match PAN",
        });
        expect(shapeKycCase(wire(), SLA).digio).toBeNull();
    });
});

describe("slaHoursLeftOf", () => {
    it("is what is left of the SLA, negative once breached, 0 with nothing submitted", () => {
        expect(slaHoursLeftOf(2, 48)).toBe(46);
        expect(slaHoursLeftOf(49.5, 48)).toBe(-2);
        expect(slaHoursLeftOf(null, 48)).toBe(0);
    });
});

describe("the desk's bodies", () => {
    it("sends a flag only with a note, and an approval with or without", () => {
        expect(documentDecisionBody("APPROVED")).toEqual({ decision: "APPROVED" });
        expect(documentDecisionBody("FLAGGED", " Blurry ")).toEqual({ decision: "FLAGGED", note: "Blurry" });
        expect(() => documentDecisionBody("FLAGGED", "  ")).toThrow(/Say what is wrong/);
    });

    it("keeps the reviewer's note on either decision and the reason on a rejection", () => {
        expect(reviewBody("VERIFIED")).toEqual({ status: "VERIFIED" });
        expect(reviewBody("VERIFIED", "Matches the PAN")).toEqual({ status: "VERIFIED", reviewNote: "Matches the PAN" });
        expect(reviewBody("REJECTED", "Name mismatch")).toEqual({ status: "REJECTED", rejectionReason: "Name mismatch", reviewNote: "Name mismatch" });
        expect(() => reviewBody("REJECTED", "")).toThrow(/reviewer note/);
    });
});

describe("dealCases", () => {
    it("deals the cases across the reviewers in turn, one bulk call each", () => {
        expect(dealCases(["c1", "c2", "c3", "c4", "c5"], ["a", "b"])).toEqual([
            { adminUserId: "a", ids: ["c1", "c3", "c5"] },
            { adminUserId: "b", ids: ["c2", "c4"] },
        ]);
        expect(dealCases(["c1"], [])).toEqual([]);
        expect(dealCases([], ["a"])).toEqual([]);
    });
});

/* Lot G (Q127/142): the escalation flag, its pill on a row, and the sweep's threshold. */
describe("the escalation", () => {
    const escalatedKyc = () => ({
        ...wire().kyc!,
        escalatedAt: "2026-09-13T02:00:00.000Z",
        escalationSource: "FRAUD_LINK" as const,
        escalationReason: "Fraud case FRD-2609-0007 opened against the publisher",
        escalatedToUserId: "usr_compliance",
        escalatedById: null,
    });

    it("is null until the row is stamped, and the five columns as one object once it is — the people from the id columns alone", () => {
        expect(escalationOf(wire().kyc)).toBeNull();
        expect(escalationOf(null)).toBeNull();
        // A row written before the names were served: `{ id, name: null }` from the id columns.
        expect(escalationOf(escalatedKyc())).toEqual({
            at: "2026-09-13T02:00:00.000Z",
            source: "FRAUD_LINK",
            reason: "Fraud case FRD-2609-0007 opened against the publisher",
            to: { id: "usr_compliance", name: null },
            by: null,
        });
        expect(shapeKycCase(wire({ kyc: escalatedKyc() }), SLA).escalation?.source).toBe("FRAUD_LINK");
        expect(shapeKycCase(wire(), SLA).escalation).toBeNull();
    });

    it("G11-1: names the two people from the read's own escalatedTo / escalatedBy, on the queue row and the case", () => {
        const people = { escalatedTo: { id: "usr_compliance", name: "Priya Nair" }, escalatedBy: { id: "usr_reviewer", name: "Arjun Mehta" } };
        expect(escalationOf({ ...escalatedKyc(), escalatedById: "usr_reviewer" }, people)).toMatchObject({
            to: { id: "usr_compliance", name: "Priya Nair" },
            by: { id: "usr_reviewer", name: "Arjun Mehta" },
        });
        // The publisher row carries the columns under `kyc` and the names beside it; the shaping joins the two.
        const shaped = shapeKycCase(wire({ kyc: { ...escalatedKyc(), escalatedById: "usr_reviewer" }, ...people }), SLA);
        expect(shaped.escalation).toMatchObject({ to: { id: "usr_compliance", name: "Priya Nair" }, by: { id: "usr_reviewer", name: "Arjun Mehta" } });
        // A lookup that found no name leaves `{ id, name: null }`; the id is what the desk prints then.
        expect(escalationOf(escalatedKyc(), { escalatedTo: { id: "usr_compliance", name: null } })?.to).toEqual({ id: "usr_compliance", name: null });
        expect(personLabel({ id: "usr_compliance", name: null })).toBe("usr_compliance");
        expect(personLabel({ id: "usr_compliance", name: "  " })).toBe("usr_compliance");
        expect(personLabel({ id: "usr_compliance", name: "Priya Nair" })).toBe("Priya Nair");
        expect(personLabel(null)).toBeNull();
    });

    it("draws the pill with the source, and who it went to by the read's name", () => {
        const escalation = escalationOf(escalatedKyc(), { escalatedTo: { id: "usr_compliance", name: "Priya Nair" } })!;
        expect(escalationChip(null)).toBeNull();
        expect(escalationChip(escalation)).toEqual({ label: "Escalated · Fraud link → Priya Nair", tone: "danger" });
        // Without a name for the id, the id itself — never nothing.
        expect(escalationChip(escalationOf(escalatedKyc())!)).toEqual({ label: "Escalated · Fraud link → usr_compliance", tone: "danger" });
        // The sweep names a source but may find nobody in the pool.
        expect(escalationChip({ ...escalation, source: "AGE", to: null })).toEqual({ label: "Escalated · Age", tone: "danger" });
        expect(escalationChip({ ...escalation, source: "REVIEWER", to: { id: "usr_a", name: "Arjun" } })?.label).toBe("Escalated · Reviewer → Arjun");
    });

    it("sends the facet and reads the sweep's threshold off the multiplier", () => {
        expect(buildKycQueueQuery({ escalated: true })).toBe("escalated=true");
        expect(buildKycQueueQuery({ status: "PENDING", escalated: false })).toBe("status=PENDING&escalated=false");
        expect(buildKycQueueQuery({})).toBe("");
        expect(autoEscalationHours(48, 2)).toBe(96);
        expect(autoEscalationHours(48, 1.5)).toBe(72);
        // Not read (the settings call failed) or nonsense: the column says nothing rather than guessing.
        expect(autoEscalationHours(48, null)).toBeNull();
        expect(autoEscalationHours(48, 0.5)).toBeNull();
    });
});

describe("KYC from the desk — Lot N", () => {
    it("N3-C: every state chip sends `state=` (Escalated the flag, All nothing); the old `requested` facet still builds", () => {
        expect(kycStateFilter("REQUESTED")).toEqual({ state: "REQUESTED" });
        expect(buildKycQueueQuery(kycStateFilter("REQUESTED"))).toBe("state=REQUESTED");
        expect(buildKycQueueQuery(kycStateFilter("AWAITING_DOCUMENTS"))).toBe("state=AWAITING_DOCUMENTS");
        expect(buildKycQueueQuery(kycStateFilter("ESCALATED"))).toBe("escalated=true");
        expect(buildKycQueueQuery(kycStateFilter("all"))).toBe("");
        expect(KYC_STATE_CHIPS).toEqual(["all", "AWAITING_DOCUMENTS", "REQUESTED", "PENDING", "NEEDS_INFO", "REJECTED", "VERIFIED", "ESCALATED"]);
        expect(buildKycQueueQuery({ requested: false, status: "PENDING" })).toBe("status=PENDING&requested=false");
        expect(buildKycQueueQuery({ state: "PENDING", q: "  Sharma " })).toBe("state=PENDING&q=Sharma");
    });

    it("shapes the desk's ask and the recorder off the row, named by the read", () => {
        const kycCase = shapeKycCase(
            wire({
                requestedBy: { id: "adm_1", name: "Priya" },
                recordedBy: { id: "adm_1", name: "Priya" },
                kyc: { ...wire().kyc!, requestedAt: "2026-09-12T10:00:00.000Z", requestedById: "adm_1", requestedChannel: "DIGIO", recordedById: "adm_1", recordedVia: "DESK" },
            }),
            SLA
        );
        expect(kycCase.request).toEqual({ at: "2026-09-12T10:00:00.000Z", by: { id: "adm_1", name: "Priya" }, channel: "DIGIO", open: false });
        expect(kycCase.recorded).toEqual({ via: "DESK", by: { id: "adm_1", name: "Priya" } });
        expect(requestLine(kycCase.request, (iso) => iso)).toBe("KYC requested on 2026-09-12T10:00:00.000Z by Priya (Digio)");
        expect(recordedLine(kycCase.recorded)).toBe("The desk · Priya");
    });

    it("an ask with nothing submitted since is open; a self-submitted row names no desk", () => {
        expect(requestOf({ requestedAt: "2026-09-12T10:00:00.000Z", requestedById: "adm_1", requestedChannel: "MANUAL", submittedAt: null })).toEqual({
            at: "2026-09-12T10:00:00.000Z",
            by: { id: "adm_1", name: null },
            channel: "MANUAL",
            open: true,
        });
        expect(requestOf({ requestedAt: null })).toBeNull();
        expect(recordedOf({ recordedVia: "SELF", recordedById: "usr_1" })).toEqual({ via: "SELF", by: { id: "usr_1", name: null } });
        expect(recordedLine({ via: "SELF", by: { id: "usr_1", name: null } })).toBe("Themselves, on the phone");
        expect(recordedOf({ recordedVia: null, recordedById: null })).toBeNull();
        expect(shapeKycCase(wire(), SLA)).toMatchObject({ request: null, recorded: null });
    });

    it("the request body is the channel and, trimmed, the note when there is one", () => {
        expect(kycRequestBody("DIGIO")).toEqual({ channel: "DIGIO" });
        expect(kycRequestBody("MANUAL", "  bring the GST certificate  ")).toEqual({ channel: "MANUAL", note: "bring the GST certificate" });
        expect(kycRequestBody("MANUAL", "   ")).toEqual({ channel: "MANUAL" });
    });

    it("the confirm names what the party receives per channel, and says when nobody is told", () => {
        expect(requestOutcome("DIGIO", "Asha", true)).toMatch(/Digio identity check is opened on Asha's behalf/);
        expect(requestOutcome("MANUAL", "Asha", true)).toMatch(/upload their documents in the app/);
        expect(requestOutcome("MANUAL", "Asha", false)).toMatch(/no app account yet, so nobody is told/);
    });
});
