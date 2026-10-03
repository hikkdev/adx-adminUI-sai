import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The entity type — Phase D (the owner, 1 Oct 2026).
 *
 * Pinned: the labels are the server's (`GET /kyc/entity-types`) and the
 * static eight stand in, word for word, when that read fails; a 409
 * `ENTITY_TYPE_REQUIRED` hands the picker the options the server named; a
 * 409 `KYC_LOCKED` is told apart; the upgrade is a VERIFIED Individual
 * becoming a business form and nothing else; Digio's own failures read in
 * the owner's words and are not mistaken for the provider switch's 503;
 * every Digio start sends `{ entityType }` only once one was chosen; and an
 * employee's workflow follows their employment type.
 */

const backend = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    answer: null as unknown,
    failure: null as Error | null,
    reset() {
        this.calls = [];
        this.answer = null;
        this.failure = null;
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.failure) throw backend.failure;
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
        },
    };
});

import { ApiError } from "@/lib/api-client";
import { advertiserKycService } from "./advertiser-kyc";
import { employeeKycService, employeeWorkflowLabel, withEmploymentTypes, type EmployeeKycQueueRow } from "./employee-kyc";
import { kycRequestBody, kycService } from "./kyc";
import {
    KYC_ENTITY_TYPES,
    KYC_ENTITY_TYPE_FALLBACK,
    KYC_ENTITY_TYPE_LABEL,
    entityTypeLabel,
    entityTypeRequired,
    isEntityUpgrade,
    isKycLocked,
    kycEntityTypeService,
} from "./kyc-entity-types";
import { DIGIO_NOT_ANSWERING, DIGIO_NOT_AVAILABLE, digioFailure, providerUnavailable } from "./kyc-provider";
import { printPartnerKycService } from "./print-partner-kyc";

beforeEach(() => backend.reset());

describe("the labels", () => {
    it("are the owner's eight, word for word", () => {
        expect(KYC_ENTITY_TYPES.map((value) => KYC_ENTITY_TYPE_LABEL[value])).toEqual([
            "Individual",
            "Sole proprietor",
            "Company",
            "LLP or partnership",
            "Non-profit (NGO, trust, society, Section 8)",
            "Government or education",
            "Other entity (HUF, co-operative, AOP, …)",
            "Political party or candidate",
        ]);
    });

    it("a publisher and an advertiser may be any of the eight; a print partner the first four", () => {
        expect(KYC_ENTITY_TYPE_FALLBACK.PUBLISHER.map((option) => option.value)).toEqual([...KYC_ENTITY_TYPES]);
        expect(KYC_ENTITY_TYPE_FALLBACK.ADVERTISER.map((option) => option.value)).toEqual([...KYC_ENTITY_TYPES]);
        expect(KYC_ENTITY_TYPE_FALLBACK.PRINT_PARTNER.map((option) => option.value)).toEqual(["INDIVIDUAL", "SOLE_PROPRIETOR", "COMPANY", "LLP_PARTNERSHIP"]);
    });

    it("a detail page prints the server's word, the static one without it, and Not chosen yet for none", () => {
        expect(entityTypeLabel("COMPANY")).toBe("Company");
        expect(entityTypeLabel("COMPANY", [{ value: "COMPANY", label: "Company (Pvt Ltd, Ltd, OPC)" }])).toBe("Company (Pvt Ltd, Ltd, OPC)");
        expect(entityTypeLabel(null)).toBe("Not chosen yet");
        expect(entityTypeLabel(undefined)).toBe("Not chosen yet");
        // A value the enum grows reads as itself rather than vanishing.
        expect(entityTypeLabel("COOPERATIVE")).toBe("COOPERATIVE");
    });
});

describe("kycEntityTypeService.lists", () => {
    it("reads GET /kyc/entity-types and keeps the server's labels", async () => {
        backend.answer = {
            PUBLISHER: [
                { value: "INDIVIDUAL", label: "Individual" },
                { value: "COMPANY", label: "Company (as the server says it)" },
            ],
            ADVERTISER: [{ value: "POLITICAL", label: "Political party or candidate" }],
            PRINT_PARTNER: [{ value: "SOLE_PROPRIETOR", label: "Sole proprietor" }],
        };
        const lists = await kycEntityTypeService.lists();
        expect(backend.calls).toEqual([{ method: "GET", path: "/kyc/entity-types", body: undefined }]);
        expect(lists.PUBLISHER).toEqual([
            { value: "INDIVIDUAL", label: "Individual" },
            { value: "COMPANY", label: "Company (as the server says it)" },
        ]);
        expect(lists.ADVERTISER).toEqual([{ value: "POLITICAL", label: "Political party or candidate" }]);
        expect(lists.PRINT_PARTNER).toEqual([{ value: "SOLE_PROPRIETOR", label: "Sole proprietor" }]);
    });

    it("falls back to the static lists when the read fails, and per party when one list is unusable", async () => {
        backend.failure = new ApiError(500, "INTERNAL", "boom");
        expect(await kycEntityTypeService.lists()).toEqual(KYC_ENTITY_TYPE_FALLBACK);

        backend.failure = null;
        backend.answer = { PUBLISHER: [{ value: "COMPANY", label: "Company" }], ADVERTISER: "nope", PRINT_PARTNER: [{ value: "NOT_A_TYPE", label: "?" }] };
        const lists = await kycEntityTypeService.lists();
        expect(lists.PUBLISHER).toEqual([{ value: "COMPANY", label: "Company" }]);
        expect(lists.ADVERTISER).toEqual(KYC_ENTITY_TYPE_FALLBACK.ADVERTISER);
        expect(lists.PRINT_PARTNER).toEqual(KYC_ENTITY_TYPE_FALLBACK.PRINT_PARTNER);
    });
});

describe("the answers", () => {
    it("409 ENTITY_TYPE_REQUIRED hands over the party and the options the server named", () => {
        const options = [
            { value: "INDIVIDUAL", label: "Individual" },
            { value: "COMPANY", label: "Company" },
        ];
        expect(entityTypeRequired(new ApiError(409, "ENTITY_TYPE_REQUIRED", "Say who the account is for", { party: "PRINT_PARTNER", options }))).toEqual({ party: "PRINT_PARTNER", options });
        // No options on the answer: the party's static list.
        expect(entityTypeRequired(new ApiError(409, "ENTITY_TYPE_REQUIRED", "Say who", { party: "PRINT_PARTNER" }))?.options).toEqual(KYC_ENTITY_TYPE_FALLBACK.PRINT_PARTNER);
        expect(entityTypeRequired(new ApiError(409, "KYC_ALREADY_VERIFIED", "Already verified"))).toBeNull();
        expect(entityTypeRequired(new Error("offline"))).toBeNull();
    });

    it("409 KYC_LOCKED is told apart from every other conflict", () => {
        expect(isKycLocked(new ApiError(409, "KYC_LOCKED", "Locked", { party: "PUBLISHER", entityType: "COMPANY" }))).toBe(true);
        expect(isKycLocked(new ApiError(409, "CONFLICT", "Conflict"))).toBe(false);
        expect(isKycLocked(new Error("offline"))).toBe(false);
    });

    it("the upgrade is a verified Individual becoming a business form, and nothing else", () => {
        expect(isEntityUpgrade(true, "INDIVIDUAL", "COMPANY")).toBe(true);
        expect(isEntityUpgrade(true, "INDIVIDUAL", "SOLE_PROPRIETOR")).toBe(true);
        expect(isEntityUpgrade(false, "INDIVIDUAL", "COMPANY")).toBe(false);
        expect(isEntityUpgrade(true, "INDIVIDUAL", "INDIVIDUAL")).toBe(false);
        expect(isEntityUpgrade(true, "COMPANY", "LLP_PARTNERSHIP")).toBe(false);
        expect(isEntityUpgrade(true, null, "COMPANY")).toBe(false);
        expect(isEntityUpgrade(true, "INDIVIDUAL", "")).toBe(false);
    });

    it("Digio failing a start reads in the owner's words, and is not the provider switch's 503", () => {
        const timeout = new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio did not answer", { provider: "DIGIO", reason: "PROVIDER_ERROR" });
        const refused = new ApiError(502, "KYC_PROVIDER_REFUSED", "Digio refused", { provider: "DIGIO", status: 404, code: "TEMPLATE_NOT_FOUND" });
        const noTemplate = new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "No template", { provider: "DIGIO", reason: "NO_TEMPLATE" });
        expect(digioFailure(timeout)).toBe(DIGIO_NOT_ANSWERING);
        expect(digioFailure(refused)).toBe(DIGIO_NOT_AVAILABLE);
        expect(digioFailure(noTemplate)).toBe(DIGIO_NOT_AVAILABLE);
        expect(DIGIO_NOT_ANSWERING).toBe("Digio isn't answering right now. Try again in a few minutes.");
        expect(DIGIO_NOT_AVAILABLE).toBe("Online verification isn't available for this account type yet. Please contact ADX support.");
        for (const cause of [timeout, refused, noTemplate]) expect(providerUnavailable(cause)).toBeNull();

        // The switch's own 503 is unchanged: no reason, the provider it is on, and when to try again.
        const switched = new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio is off", { provider: "MANUAL", retryAfter: 300 });
        expect(digioFailure(switched)).toBeNull();
        expect(providerUnavailable(switched)).toEqual({ provider: "MANUAL", retryAfter: 300 });
        expect(digioFailure(new ApiError(409, "KYC_ALREADY_VERIFIED", "Already verified"))).toBeNull();
    });
});

describe("the Digio starts carry the entity type only once one was chosen", () => {
    it("the request body keeps the channel and the note, and adds the type when given", () => {
        expect(kycRequestBody("DIGIO")).toEqual({ channel: "DIGIO" });
        expect(kycRequestBody("DIGIO", "  by Friday ", "COMPANY")).toEqual({ channel: "DIGIO", note: "by Friday", entityType: "COMPANY" });
        expect(kycRequestBody("MANUAL", "", "NON_PROFIT")).toEqual({ channel: "MANUAL", entityType: "NON_PROFIT" });
    });

    it("the one click, the request and the restart of each party", async () => {
        backend.answer = { kyc: {}, digio: null, notified: true };
        await kycService.requestDigio("pub_1");
        await kycService.requestDigio("pub_1", "COMPANY");
        await kycService.restartDigio("pub_1");
        await kycService.restartDigio("pub_1", "SOLE_PROPRIETOR");
        await advertiserKycService.requestDigio("adv_1", "POLITICAL");
        await advertiserKycService.request("adv_1", "DIGIO", undefined, "NON_PROFIT");
        await advertiserKycService.restartDigio("akyc_1", "COMPANY");
        await printPartnerKycService.requestDigio("prt_1", "LLP_PARTNERSHIP");
        await printPartnerKycService.restartDigio("prt_1", "INDIVIDUAL");
        expect(backend.calls).toEqual([
            { method: "POST", path: "/publishers/kyc-queue/pub_1/request", body: undefined },
            { method: "POST", path: "/publishers/kyc-queue/pub_1/request", body: { entityType: "COMPANY" } },
            { method: "POST", path: "/publishers/kyc-queue/pub_1/digio/restart", body: {} },
            { method: "POST", path: "/publishers/kyc-queue/pub_1/digio/restart", body: { entityType: "SOLE_PROPRIETOR" } },
            { method: "POST", path: "/advertiser-kyc/adv_1/request", body: { entityType: "POLITICAL" } },
            { method: "POST", path: "/advertiser-kyc/adv_1/request", body: { channel: "DIGIO", entityType: "NON_PROFIT" } },
            { method: "POST", path: "/advertiser-kyc/akyc_1/digio/restart", body: { entityType: "COMPANY" } },
            { method: "POST", path: "/print-partner-kyc/prt_1/request", body: { entityType: "LLP_PARTNERSHIP" } },
            { method: "POST", path: "/print-partner-kyc/prt_1/digio/restart", body: { entityType: "INDIVIDUAL" } },
        ]);
    });
});

describe("an employee's Digio workflow", () => {
    it("is Employee: Full Time for full time, part time or none set, and Employee: Intern and Contract for contract and intern", () => {
        expect(employeeWorkflowLabel("FULL_TIME")).toBe("Employee: Full Time");
        expect(employeeWorkflowLabel("PART_TIME")).toBe("Employee: Full Time");
        expect(employeeWorkflowLabel(null)).toBe("Employee: Full Time");
        expect(employeeWorkflowLabel("CONTRACT")).toBe("Employee: Intern and Contract");
        expect(employeeWorkflowLabel("INTERN")).toBe("Employee: Intern and Contract");
    });

    it("the queue rows take the employment type off the HR roster, and stay unsaid where the roster does not know them", () => {
        const row = (employeeId: string, over: Partial<EmployeeKycQueueRow> = {}) => ({ id: employeeId, employeeId, ...over }) as EmployeeKycQueueRow;
        const joined = withEmploymentTypes(
            [row("emp_1"), row("emp_2"), row("emp_3"), row("emp_4", { employmentType: "INTERN" })],
            new Map([
                ["emp_1", "CONTRACT"],
                ["emp_2", null],
                ["emp_4", "FULL_TIME"],
            ]),
        );
        expect(joined.map((item) => item.employmentType)).toEqual(["CONTRACT", null, undefined, "INTERN"]);
    });

    it("reads the roster's employment types by HR id, and a failed roster read is an empty map", async () => {
        const employee = (id: string, over: Record<string, unknown> = {}) => ({
            id,
            userId: `usr_${id}`,
            displayId: null,
            department: null,
            designation: null,
            isActive: true,
            user: { id: `usr_${id}`, name: id, mobile: "9800000001", email: null },
            ...over,
        });
        backend.answer = {
            // The third row is from a server that does not send the column: it is left out, not read as "none set".
            items: [employee("emp_1", { employmentType: "INTERN" }), employee("emp_2", { employmentType: null }), employee("emp_3")],
            total: 3,
            page: 1,
            pageSize: 100,
            counts: {},
        };
        const types = await employeeKycService.employmentTypes();
        expect([...types.entries()]).toEqual([
            ["emp_1", "INTERN"],
            ["emp_2", null],
        ]);
        backend.failure = new ApiError(500, "INTERNAL", "boom");
        expect((await employeeKycService.employmentTypes()).size).toBe(0);
    });
});
