import { describe, expect, it } from "vitest";
import { AGENT_KYC_SLOTS, documentsBody, shapeAgentKyc, type WireAgentKyc } from "./agent-kyc";

/**
 * The shaping the console does to an agent's KYC record.
 *
 * What is pinned: the case is named for the agent (by name, falling back to
 * the number), the seven slots are counted, what was recorded comes back
 * ready for the form, and only fields that hold a value go on the wire.
 */

const wire = (over: Partial<WireAgentKyc> = {}): WireAgentKyc => ({
    id: "akyc_1",
    agentId: "agt_1",
    govIdType: "AADHAAR",
    govIdFrontUrl: "https://cdn.adx.in/agent-kyc/1.jpg",
    govIdBackUrl: null,
    panNumber: "ABCDE1234F",
    panFrontUrl: "https://cdn.adx.in/agent-kyc/2.jpg",
    panSignatureUrl: null,
    addressProofType: null,
    addressProofUrl: null,
    selfieUrl: "https://cdn.adx.in/agent-kyc/3.jpg",
    bankProofUrl: null,
    status: "PENDING",
    rejectionReason: null,
    recordedById: "usr_admin",
    submittedAt: "2026-09-10T08:00:00.000Z",
    reviewedAt: null,
    reviewedById: null,
    agent: { id: "agt_1", displayId: "AGT-1009-2601", city: "Bengaluru", user: { name: "Rahul Kumar", mobile: "+919876543210" } },
    ...over,
});

describe("shapeAgentKyc", () => {
    it("names the agent and counts the slots that hold a document", () => {
        const kycCase = shapeAgentKyc(wire());
        expect(kycCase.agentName).toBe("Rahul Kumar");
        expect(kycCase.displayId).toBe("AGT-1009-2601");
        expect(kycCase.documents).toBe(3);
        expect(AGENT_KYC_SLOTS).toHaveLength(7);
    });

    it("falls back to the number for an agent with no name", () => {
        expect(shapeAgentKyc(wire({ agent: { ...wire().agent, user: { name: null, mobile: "+919876543210" } } })).agentName).toBe("+919876543210");
    });

    it("hands what was recorded back for the form, without nulls", () => {
        const kycCase = shapeAgentKyc(wire());
        expect(kycCase.recorded).toEqual({
            govIdType: "AADHAAR",
            govIdFrontUrl: "https://cdn.adx.in/agent-kyc/1.jpg",
            govIdBackUrl: undefined,
            panNumber: "ABCDE1234F",
            panFrontUrl: "https://cdn.adx.in/agent-kyc/2.jpg",
            panSignatureUrl: undefined,
            addressProofType: undefined,
            addressProofUrl: undefined,
            selfieUrl: "https://cdn.adx.in/agent-kyc/3.jpg",
            bankProofUrl: undefined,
        });
    });
});

describe("documentsBody", () => {
    it("sends only the fields that hold a value", () => {
        expect(documentsBody({ govIdType: "PASSPORT", panNumber: "", govIdFrontUrl: undefined, selfieUrl: "https://x/y.jpg" })).toEqual({
            govIdType: "PASSPORT",
            selfieUrl: "https://x/y.jpg",
        });
    });
});
