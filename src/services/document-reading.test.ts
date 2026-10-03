import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DR-1: the document reader as the console uses it — which kind a tile is
 * read as (and which are never read), what a typed fact is checked
 * against, how a mismatch is found, and what the queue's batch does.
 */

const { calls, answers } = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    answers: new Map<string, unknown>(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        const answer = answers.get(`${method} ${path}`);
        if (answer instanceof Error) throw answer;
        return answer ?? null;
    };
    return { ...actual, api: { ...actual.api, get: record("GET"), post: record("POST") } };
});

import {
    DOCUMENT_KINDS,
    documentReadingService,
    expectedFor,
    fileIdOf,
    kindForDocument,
    readPendingDocuments,
    readingMismatches,
} from "./document-reading";

beforeEach(() => {
    calls.length = 0;
    answers.clear();
});

describe("which kind a tile is read as", () => {
    it("never reads an Aadhaar, a selfie, a signature or a résumé", () => {
        expect(DOCUMENT_KINDS).not.toContain("AADHAAR");
        expect(kindForDocument("aadhaarFrontUrl")).toBeNull();
        expect(kindForDocument("AADHAAR_BACK")).toBeNull();
        expect(kindForDocument("govIdFrontUrl", { govIdType: "AADHAAR" })).toBeNull();
        expect(kindForDocument("govIdFrontUrl", { label: "Government ID · front (Aadhaar)" })).toBeNull();
        expect(kindForDocument("selfieUrl")).toBeNull();
        expect(kindForDocument("SELFIE")).toBeNull();
        expect(kindForDocument("panSignatureUrl")).toBeNull();
        expect(kindForDocument("RESUME")).toBeNull();
    });

    it("names the kind from the column, and from the party's choice where the column is generic", () => {
        expect(kindForDocument("panFrontUrl")).toBe("PAN");
        expect(kindForDocument("PAN")).toBe("PAN");
        expect(kindForDocument("govIdFrontUrl", { govIdType: "PASSPORT" })).toBe("PASSPORT");
        expect(kindForDocument("govIdBackUrl", { label: "Government ID · back (Driving licence)" })).toBe("DRIVING_LICENCE");
        expect(kindForDocument("directorIdUrl")).toBe("OTHER");
        expect(kindForDocument("DRIVING_LICENCE_FRONT")).toBe("DRIVING_LICENCE");
        expect(kindForDocument("gstUrl")).toBe("GST_CERTIFICATE");
        expect(kindForDocument("bankProofUrl")).toBe("BANK_STATEMENT");
        expect(kindForDocument("BANK_PROOF")).toBe("BANK_STATEMENT");
        expect(kindForDocument("businessRegCertUrl")).toBe("INCORPORATION_CERTIFICATE");
        expect(kindForDocument("adAuthLetterUrl")).toBe("AUTHORISATION_LETTER");
        expect(kindForDocument("OWNER_NOC")).toBe("AUTHORISATION_LETTER");
        expect(kindForDocument("addressProofUrl", { addressProofType: "RENT_AGREEMENT" })).toBe("AGREEMENT");
        expect(kindForDocument("addressProofUrl", { label: "Address proof (Bank statement)" })).toBe("BANK_STATEMENT");
        expect(kindForDocument("addressProofUrl")).toBe("UTILITY_BILL");
        expect(kindForDocument("ADDRESS_PROOF")).toBe("UTILITY_BILL");
        expect(kindForDocument("VEHICLE_RC")).toBe("VEHICLE_RC");
        expect(kindForDocument("VEHICLE_INSURANCE")).toBe("VEHICLE_INSURANCE");
        expect(kindForDocument("DISPLAY_AGREEMENT")).toBe("AGREEMENT");
        expect(kindForDocument("MUNICIPAL_PERMIT")).toBe("PERMIT_OR_LICENCE");
        expect(kindForDocument("POLICE_VERIFICATION")).toBe("OTHER");
        expect(kindForDocument("ngoRegCertUrl")).toBe("INCORPORATION_CERTIFICATE");
    });

    it("finds the file id in a private URL and nothing in a public one", () => {
        expect(fileIdOf("http://localhost:3000/api/v1/files/f_abc-1")).toBe("f_abc-1");
        expect(fileIdOf("/files/f_2?x=1")).toBe("f_2");
        expect(fileIdOf("https://cdn.adx.in/uploads/listing/photo.jpg")).toBeNull();
        expect(fileIdOf(null)).toBeNull();
    });
});

describe("what a reading is checked against", () => {
    it("compares the typed PAN or GSTIN with what was read, ignoring case and spacing", () => {
        expect(expectedFor("PAN", { pan: "ABCDE1234F" })).toEqual({ number: "ABCDE1234F" });
        expect(expectedFor("GST_CERTIFICATE", { gstin: "29ABCDE1234F1Z5" })).toEqual({ gstin: "29ABCDE1234F1Z5" });
        expect(expectedFor("UTILITY_BILL", { pan: "ABCDE1234F" })).toBeUndefined();
        expect(expectedFor("PAN", {})).toBeUndefined();

        const fields = { number: { value: "abcde 1234f", confidence: 0.9 }, name: { value: null, confidence: 0 } };
        expect(readingMismatches({ fields }, { number: "ABCDE1234F" })).toEqual([]);
        expect(readingMismatches({ fields }, { number: "ABCDE1234G" })).toEqual([{ field: "number", expected: "ABCDE1234G", read: "abcde 1234f" }]);
        // A field the model could not read is nothing, not a mismatch.
        expect(readingMismatches({ fields }, { name: "Anita" })).toEqual([]);
        expect(readingMismatches({ fields }, undefined)).toEqual([]);
    });
});

describe("the routes", () => {
    it("reads one file by kind and fetches what is kept — by id, or by URL for a public file", async () => {
        await documentReadingService.read("f_1", "PAN");
        await documentReadingService.get("f_1");
        await documentReadingService.readByUrl("https://api.test/uploads/verification/noc.jpg", "AUTHORISATION_LETTER");
        await documentReadingService.getByUrl("https://api.test/uploads/verification/noc.jpg");
        expect(calls).toEqual([
            { method: "POST", path: "/files/f_1/read", body: { kind: "PAN" } },
            { method: "GET", path: "/files/f_1/reading", body: undefined },
            { method: "POST", path: "/files/read", body: { url: "https://api.test/uploads/verification/noc.jpg", kind: "AUTHORISATION_LETTER" } },
            { method: "GET", path: "/files/reading?url=https%3A%2F%2Fapi.test%2Fuploads%2Fverification%2Fnoc.jpg", body: undefined },
        ]);
    });
});

describe("the queue's batch", () => {
    const reading = { fileId: "f_1", kind: "PAN" };

    it("reads every readable document on an open manual case once, skipping what already has a reading, and goes on past a failure", async () => {
        answers.set("GET /files/f_pan/reading", reading);
        answers.set("POST /files/f_gst/read", new Error("The model did not answer"));
        const outcome = await readPendingDocuments([
            {
                method: "MANUAL",
                state: "PENDING",
                documents: [
                    { field: "panFrontUrl", type: "PAN card", url: "/files/f_pan" },
                    { field: "gstUrl", type: "GST certificate", url: "/files/f_gst" },
                    { field: "addressProofUrl", type: "Address proof (Utility bill)", url: "/files/f_bill" },
                    { field: "aadhaarFrontUrl", type: "Aadhaar · front", url: "/files/f_aad" },
                    { field: "selfieUrl", type: "Live selfie", url: "/files/f_selfie" },
                ],
            },
            { method: "DIGIO", state: "PENDING", documents: [{ field: "panFrontUrl", type: "PAN card", url: "/files/f_digio" }] },
            { method: "MANUAL", state: "VERIFIED", documents: [{ field: "panFrontUrl", type: "PAN card", url: "/files/f_done" }] },
        ]);
        expect(outcome).toEqual({ attempted: 3, read: 1, skipped: 1, failed: 1, firstError: "The model did not answer" });
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /files/f_pan/reading",
            "GET /files/f_gst/reading",
            "POST /files/f_gst/read",
            "GET /files/f_bill/reading",
            "POST /files/f_bill/read",
        ]);
        expect(calls.find((call) => call.path === "/files/f_bill/read")?.body).toEqual({ kind: "UTILITY_BILL" });
    });
});
