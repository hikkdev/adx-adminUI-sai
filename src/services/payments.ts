import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * Payments — the gateway register (Lot C, Q110/Q118/Q12).
 *
 * One `Payment` per attempt to pay a campaign or a package sale through
 * Razorpay, Cashfree or CCAvenue. Money arriving from advertisers, not to be
 * confused with `payouts`, which is money leaving. A capture is a TOPUP into
 * the advertiser's wallet and the target is settled out of that balance, so
 * a captured payment whose campaign could not be applied leaves the money
 * spendable rather than in limbo — the desk exists to see that.
 *
 * Same discipline as the rest of finance: no fixture fallback, money is a
 * decimal string end to end, and a refund is refused while the API is off
 * rather than toasted.
 */

export type PaymentGateway = "RAZORPAY" | "CASHFREE" | "CCAVENUE";
export const PAYMENT_GATEWAYS: readonly PaymentGateway[] = ["RAZORPAY", "CASHFREE", "CCAVENUE"];

export const GATEWAY_LABEL: Record<PaymentGateway, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
    CCAVENUE: "CCAvenue",
};

export type PaymentStatus = "CREATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
    "CREATED",
    "AUTHORIZED",
    "CAPTURED",
    "PARTIALLY_REFUNDED",
    "REFUNDED",
    "FAILED",
];

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
    CREATED: { label: "Created", tone: "neutral" },
    AUTHORIZED: { label: "Authorised", tone: "warning" },
    CAPTURED: { label: "Captured", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    REFUNDED: { label: "Refunded", tone: "neutral" },
    PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "info" },
};

export type PaymentRefundStatus = "PENDING" | "PROCESSED" | "FAILED";

export const REFUND_STATUS_META: Record<PaymentRefundStatus, StatusMeta> = {
    PENDING: { label: "Pending at gateway", tone: "warning" },
    PROCESSED: { label: "Processed", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
};

/** One refund back to the card or UPI the payment came from. */
export interface PaymentRefund {
    id: string;
    amount: string;
    status: PaymentRefundStatus;
    gatewayRefundId: string | null;
    reason: string;
    /** Set when the refund paid an APPROVED wallet refund request. */
    refundRequestId: string | null;
    createdAt: string;
    processedAt: string | null;
}

/** What `POST /payments/:id/refund` answers — the refund it made and the payment as `GET /payments/:id` now sends it. */
export interface RefundOutcome {
    refund: PaymentRefund;
    payment: Payment;
}

/** A payment as `GET /payments` and `GET /payments/:id` send it. */
export interface Payment {
    id: string;
    /** PAY-2026-000482 */
    reference: string;
    advertiserId: string;
    campaignId: string | null;
    packageSaleId: string | null;
    gateway: PaymentGateway;
    gatewayOrderId: string | null;
    gatewayPaymentId: string | null;
    amount: string;
    currency: string;
    /** card | upi | netbanking | wallet, as the gateway reported it. */
    method: string | null;
    status: PaymentStatus;
    failureReason: string | null;
    topUpId: string | null;
    walletEntryId: string | null;
    ledgerTransactionId: string | null;
    invoiceId: string | null;
    createdByUserId: string | null;
    createdAt: string;
    capturedAt: string | null;
    updatedAt: string;
    /** What is still on the payment after the refunds that stand. */
    refundable: string;
    refunds: PaymentRefund[];
}

/** The list contract: `{ items, total, page, pageSize, counts }`. */
export interface PaymentsPage {
    items: Payment[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export type PaymentsSort = "NEWEST" | "OLDEST" | "AMOUNT_DESC";

export interface PaymentsQuery {
    status?: PaymentStatus[];
    gateway?: PaymentGateway;
    advertiserId?: string;
    campaignId?: string;
    packageSaleId?: string;
    q?: string;
    sort?: PaymentsSort;
    page?: number;
    pageSize?: number;
}

export interface RefundInput {
    amount: string;
    reason: string;
    /** Paying an APPROVED wallet refund request whose destination is ORIGINAL_METHOD. */
    refundRequestId?: string;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** The desk reads the API or says it cannot; a seeded payment would be money nobody paid. */
export const paymentsReadApi = (): boolean => isLive("payments");

/** "Campaign" or "Package sale" — what the payment was for. */
export function paymentTarget(payment: Pick<Payment, "campaignId" | "packageSaleId">): {
    kind: "CAMPAIGN" | "PACKAGE_SALE" | null;
    href: string | null;
    label: string;
} {
    if (payment.campaignId) return { kind: "CAMPAIGN", href: `/campaigns/${payment.campaignId}`, label: "Campaign" };
    if (payment.packageSaleId) return { kind: "PACKAGE_SALE", href: "/packages", label: "Package sale" };
    return { kind: null, href: null, label: "—" };
}

/** Only a capture — or a partial refund of one — has money left to send back. */
export function canRefund(payment: Pick<Payment, "status" | "refundable">): boolean {
    if (payment.status !== "CAPTURED" && payment.status !== "PARTIALLY_REFUNDED") return false;
    const left = Number(payment.refundable);
    return Number.isFinite(left) && left > 0;
}

/**
 * What the refund dialog refuses before the API would: a blank or malformed
 * amount, one above what is left, a reason too short to be one.
 */
export function refundProblem(input: { amount: string; reason: string }, refundable: string): string | null {
    const amount = input.amount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return "Enter an amount in rupees, up to two decimal places.";
    if (Number(amount) <= 0) return "The amount has to be more than zero.";
    if (Number(amount) > Number(refundable)) return `No more than ₹${refundable} is left on this payment.`;
    if (input.reason.trim().length < 3) return "Say why the money is going back.";
    return null;
}

/** The `?a=b` for the register, skipping what is unset. */
export function paymentsQuery(query: PaymentsQuery): string {
    const params = new URLSearchParams();
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.gateway) params.set("gateway", query.gateway);
    if (query.advertiserId) params.set("advertiserId", query.advertiserId);
    if (query.campaignId) params.set("campaignId", query.campaignId);
    if (query.packageSaleId) params.set("packageSaleId", query.packageSaleId);
    if (query.q) params.set("q", query.q);
    if (query.sort) params.set("sort", query.sort);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const paymentsService = {
    /** The register, on the list contract with counts by status. */
    list: (query: PaymentsQuery = {}) => http.get<PaymentsPage>(`/payments${paymentsQuery(query)}`),

    /** One payment with its refunds. */
    get: (id: string) => http.get<Payment>(`/payments/${id}`),

    /**
     * Money back through the gateway. Never more than what is left; the
     * wallet is debited first on a direct return, so the books never show
     * money leaving ADX that the advertiser still holds. ADMIN + finance.approve.
     */
    refund: (id: string, input: RefundInput) => http.post<RefundOutcome>(`/payments/${id}/refund`, input),
};
