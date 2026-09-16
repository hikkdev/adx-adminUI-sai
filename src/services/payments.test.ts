import { describe, expect, it, vi } from "vitest";

/**
 * The gateway register as the console reads it (Lot C, Q110).
 *
 * Money is a decimal string end to end — the amount, what is left to refund,
 * and the amount a refund sends — and the one rule the desk enforces before
 * the API would is "never more than what is left". A refund goes back to a
 * real card, so the routes and bodies are pinned exactly.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

import { canRefund, paymentTarget, paymentsQuery, paymentsService, refundProblem, type Payment } from "./payments";

const payment = (over: Partial<Payment> = {}): Payment => ({
    id: "pay_1",
    reference: "PAY-2026-000482",
    advertiserId: "adv_1",
    campaignId: "cmp_1",
    packageSaleId: null,
    gateway: "RAZORPAY",
    gatewayOrderId: "order_1",
    gatewayPaymentId: "pay_rzp_1",
    amount: "18400.00",
    currency: "INR",
    method: "upi",
    status: "CAPTURED",
    failureReason: null,
    topUpId: "top_1",
    walletEntryId: "we_1",
    ledgerTransactionId: "ltx_1",
    invoiceId: null,
    createdByUserId: "usr_1",
    createdAt: "2026-09-12T08:00:00.000Z",
    capturedAt: "2026-09-12T08:01:00.000Z",
    updatedAt: "2026-09-12T08:01:00.000Z",
    refundable: "18400.00",
    refunds: [],
    ...over,
});

describe("what can be refunded", () => {
    it("is a capture with money left, and a partial refund of one", () => {
        expect(canRefund(payment())).toBe(true);
        expect(canRefund(payment({ status: "PARTIALLY_REFUNDED", refundable: "400.00" }))).toBe(true);
    });

    it("is not a failed, created or fully refunded payment", () => {
        expect(canRefund(payment({ status: "FAILED" }))).toBe(false);
        expect(canRefund(payment({ status: "CREATED" }))).toBe(false);
        expect(canRefund(payment({ status: "REFUNDED", refundable: "0.00" }))).toBe(false);
        expect(canRefund(payment({ status: "CAPTURED", refundable: "0.00" }))).toBe(false);
    });
});

describe("the refund dialog's own refusals", () => {
    it("wants a rupee amount with at most two places, above zero and within what is left", () => {
        expect(refundProblem({ amount: "", reason: "Duplicate" }, "18400.00")).toMatch(/amount/);
        expect(refundProblem({ amount: "12.345", reason: "Duplicate" }, "18400.00")).toMatch(/amount/);
        expect(refundProblem({ amount: "0", reason: "Duplicate" }, "18400.00")).toMatch(/more than zero/);
        expect(refundProblem({ amount: "18400.01", reason: "Duplicate" }, "18400.00")).toMatch(/18400.00/);
    });

    it("wants a reason, then lets the refund through", () => {
        expect(refundProblem({ amount: "500.00", reason: " " }, "18400.00")).toMatch(/why/);
        expect(refundProblem({ amount: "500.00", reason: "Duplicate capture" }, "18400.00")).toBeNull();
    });
});

describe("what a payment was for", () => {
    it("links a campaign payment to its campaign page", () => {
        expect(paymentTarget(payment())).toEqual({ kind: "CAMPAIGN", href: "/campaigns/cmp_1", label: "Campaign" });
    });

    it("names a package sale, and admits when there is no target", () => {
        expect(paymentTarget(payment({ campaignId: null, packageSaleId: "sale_1" })).kind).toBe("PACKAGE_SALE");
        expect(paymentTarget(payment({ campaignId: null }))).toEqual({ kind: null, href: null, label: "—" });
    });
});

describe("the routes", () => {
    it("builds the list query the contract takes, and nothing it does not", () => {
        expect(paymentsQuery({})).toBe("");
        expect(paymentsQuery({ status: ["CAPTURED", "FAILED"], gateway: "CASHFREE", campaignId: "cmp_1", q: "PAY" })).toBe(
            "?status=CAPTURED%2CFAILED&gateway=CASHFREE&campaignId=cmp_1&q=PAY",
        );
    });

    it("reads the register and one payment from /payments", async () => {
        calls.length = 0;
        await paymentsService.list({ pageSize: 50 });
        await paymentsService.get("pay_1");
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /payments?pageSize=50", "GET /payments/pay_1"]);
    });

    it("refunds with the amount as a string, the reason, and the request id only when paying one", async () => {
        calls.length = 0;
        await paymentsService.refund("pay_1", { amount: "500.00", reason: "Duplicate capture" });
        await paymentsService.refund("pay_1", { amount: "500.00", reason: "Approved request", refundRequestId: "rr_1" });
        expect(calls).toEqual([
            { method: "POST", path: "/payments/pay_1/refund", body: { amount: "500.00", reason: "Duplicate capture" } },
            {
                method: "POST",
                path: "/payments/pay_1/refund",
                body: { amount: "500.00", reason: "Approved request", refundRequestId: "rr_1" },
            },
        ]);
    });
});
