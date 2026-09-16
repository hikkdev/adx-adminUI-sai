import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot B (Q41) — the refund desk, the service half.
 *
 * What this pins: the two queues read the list contract at the paths the
 * backend mounts them on, the decisions send exactly the bodies the zod
 * schemas parse (a release note only when typed; a reject reason always),
 * the four-eyes refusal is recognised whichever status the API chose for it,
 * and the row helpers say what a request admits — because a Mark paid
 * button on a wallet-credit refund would call a route that 409s.
 */

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: null as unknown,
        status: 200,
        reset() {
            this.calls = [];
            this.answer = null;
            this.status = 200;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return {
        ...actual,
        apiConfig: { ...actual.apiConfig, live: true },
        isLive: () => true,
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.status !== 200) throw new actual.ApiError(backend.status, "REFUSED", "Refused");
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { ApiError } from "@/lib/api-client";
import {
    CAMPAIGN_REFUND_STATUSES,
    CAMPAIGN_REFUND_STATUS_META,
    REFUND_REQUEST_STATUSES,
    REFUND_REQUEST_STATUS_META,
    approvalConsequence,
    isDecisionRefused,
    refundRequestActions,
    refundsService,
} from "./refunds";

beforeEach(() => backend.reset());

describe("the campaign queue", () => {
    it("reads the list contract with the status facet as a comma list", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 50, counts: {} };
        await refundsService.campaignRefunds({ status: ["PENDING", "REJECTED"] });
        expect(backend.calls[0]).toEqual({
            method: "GET",
            path: "/finance/campaign-refunds?status=PENDING%2CREJECTED&pageSize=50",
            body: undefined,
        });
    });

    it("omits the facet when everything is asked for", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 50, counts: {} };
        await refundsService.campaignRefunds();
        expect(backend.calls[0]?.path).toBe("/finance/campaign-refunds?pageSize=50");
    });

    it("releases with a note only when one was typed — the schema refuses an empty string", async () => {
        backend.answer = { id: "cr_1", status: "RELEASED" };
        await refundsService.releaseCampaignRefund("cr_1", "   ");
        await refundsService.releaseCampaignRefund("cr_1", " Agreed on the call ");
        expect(backend.calls[0]).toEqual({ method: "POST", path: "/finance/campaign-refunds/cr_1/release", body: {} });
        expect(backend.calls[1]?.body).toEqual({ note: "Agreed on the call" });
    });

    it("refuses with the reason the schema requires", async () => {
        backend.answer = { id: "cr_1", status: "REJECTED" };
        await refundsService.rejectCampaignRefund("cr_1", "Campaign ran its full flight");
        expect(backend.calls[0]).toEqual({
            method: "POST",
            path: "/finance/campaign-refunds/cr_1/reject",
            body: { reason: "Campaign ran its full flight" },
        });
    });
});

describe("the request queue", () => {
    it("reads the desk at /finance and decides at /advertisers — two routers, one record", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 50, counts: {} };
        await refundsService.refundRequests({ status: ["APPROVED"] });
        backend.answer = { id: "rr_1", status: "APPROVED" };
        await refundsService.decideRefundRequest("rr_1", { approve: true, decisionNote: "" });
        await refundsService.decideRefundRequest("rr_1", { approve: false, decisionNote: " Not refundable " });
        await refundsService.markRefundPaid("rr_1", "UTR123456");
        await refundsService.failRefund("rr_1", "Account closed");
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /finance/refund-requests?status=APPROVED&pageSize=50",
            "PATCH /advertisers/refund-requests/rr_1/decide",
            "PATCH /advertisers/refund-requests/rr_1/decide",
            "POST /advertisers/refund-requests/rr_1/mark-paid",
            "POST /advertisers/refund-requests/rr_1/fail",
        ]);
        expect(backend.calls[1]?.body).toEqual({ approve: true });
        expect(backend.calls[2]?.body).toEqual({ approve: false, decisionNote: "Not refundable" });
        expect(backend.calls[3]?.body).toEqual({ railReference: "UTR123456" });
        expect(backend.calls[4]?.body).toEqual({ reason: "Account closed" });
    });
});

describe("the four-eyes refusal", () => {
    it("is a 403 from the campaign queue and a 409 once the row has moved on — both are refusals, not failures", async () => {
        backend.status = 403;
        await expect(refundsService.releaseCampaignRefund("cr_1")).rejects.toSatisfy(isDecisionRefused);
        backend.status = 409;
        await expect(refundsService.rejectCampaignRefund("cr_1", "x")).rejects.toSatisfy(isDecisionRefused);
    });

    it("does not swallow a broken request", () => {
        expect(isDecisionRefused(new ApiError(500, "INTERNAL", "boom"))).toBe(false);
        expect(isDecisionRefused(new Error("network"))).toBe(false);
    });
});

describe("what a request admits", () => {
    it("decides only while PENDING", () => {
        expect(refundRequestActions({ status: "PENDING", destination: "WALLET_CREDIT" })).toEqual({
            decide: true,
            markPaid: false,
            fail: false,
        });
    });

    it("pays or fails only an approved bank transfer — a wallet credit is settled at approval", () => {
        expect(refundRequestActions({ status: "APPROVED", destination: "BANK_TRANSFER" })).toEqual({
            decide: false,
            markPaid: true,
            fail: true,
        });
        expect(refundRequestActions({ status: "APPROVED", destination: "WALLET_CREDIT" })).toEqual({
            decide: false,
            markPaid: false,
            fail: false,
        });
        expect(refundRequestActions({ status: "PAID", destination: "BANK_TRANSFER" }).markPaid).toBe(false);
    });

    it("tells the person what approval does, by destination", () => {
        expect(approvalConsequence({ destination: "WALLET_CREDIT" })).toMatch(/spendable balance/);
        expect(approvalConsequence({ destination: "BANK_TRANSFER" })).toMatch(/UTR/);
        expect(approvalConsequence({ destination: "ORIGINAL_METHOD" })).toMatch(/gateway/);
    });
});

describe("the vocabulary", () => {
    it("labels every status the backend declares", () => {
        for (const status of CAMPAIGN_REFUND_STATUSES) expect(CAMPAIGN_REFUND_STATUS_META[status].label).toMatch(/\S/);
        for (const status of REFUND_REQUEST_STATUSES) expect(REFUND_REQUEST_STATUS_META[status].label).toMatch(/\S/);
        expect(REFUND_REQUEST_STATUSES).toEqual(["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "PAID", "FAILED"]);
    });
});
