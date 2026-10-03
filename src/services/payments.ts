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

export type PaymentGateway = "RAZORPAY" | "CASHFREE" | "CCAVENUE" | "BANK_TRANSFER";
export const PAYMENT_GATEWAYS: readonly PaymentGateway[] = ["RAZORPAY", "CASHFREE", "CCAVENUE", "BANK_TRANSFER"];

export const GATEWAY_LABEL: Record<PaymentGateway, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
    CCAVENUE: "CCAvenue",
    /** BT-1 (DR 12): money sent to ADX's own account; ops confirm it against the statement. */
    BANK_TRANSFER: "Bank transfer",
};

/** BT-1: what the payer told us about their transfer. */
export interface BankTransferClaim {
    utr: string | null;
    /** YYYY-MM-DD */
    paidOn: string | null;
    claimedAmount: string | null;
    proofFileId: string | null;
    claimedAt: string | null;
}

/**
 * RF-1: what the payment is for. SETTLEMENT is the target's full amount —
 * a booking, a package, a plan; RESERVATION_FEE is the fee that holds a
 * campaign's spots, which is not a booking payment and is folded into the
 * checkout later. The list takes no `purpose` facet, so the desk cuts on
 * it client-side over the page in hand.
 */
export type PaymentPurpose = "SETTLEMENT" | "RESERVATION_FEE";
export const PAYMENT_PURPOSES: readonly PaymentPurpose[] = ["SETTLEMENT", "RESERVATION_FEE"];

export const PAYMENT_PURPOSE_META: Record<PaymentPurpose, StatusMeta> = {
    SETTLEMENT: { label: "Settlement", tone: "neutral" },
    RESERVATION_FEE: { label: "Reservation fee", tone: "info" },
};

/** The purpose as the row carries it; a row from before RF-1 is a settlement. */
export const paymentPurposeOf = (payment: Pick<Payment, "purpose">): PaymentPurpose => payment.purpose ?? "SETTLEMENT";

/** The purpose facet, applied to the rows in hand — "ALL" leaves them alone. */
export function filterByPurpose<T extends Pick<Payment, "purpose">>(rows: T[], purpose: PaymentPurpose | "ALL"): T[] {
    if (purpose === "ALL") return rows;
    return rows.filter((row) => paymentPurposeOf(row) === purpose);
}

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
    /** RF-1: a settlement, or the reservation fee on a campaign. Absent on a backend older than RF-1 — a settlement. */
    purpose?: PaymentPurpose;
    /** UP-1: the UPI id the payer typed, when they did — a collect request on Cashfree, the prefilled VPA on Razorpay. */
    payerUpiId?: string | null;
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
    /** BT-1: the payer's claim on a bank-transfer payment; null on a gateway payment. */
    bankTransfer?: BankTransferClaim | null;
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

/** BT-1: a bank transfer still waiting for ops — confirmable or rejectable, whether or not the payer has claimed it yet. */
export function awaitsBankConfirmation(payment: Pick<Payment, "gateway" | "status">): boolean {
    return payment.gateway === "BANK_TRANSFER" && payment.status === "CREATED";
}

/** BT-1: what the confirm dialog refuses before the API would. */
export function bankConfirmProblem(input: { amount: string; utr: string }, claim: BankTransferClaim | null | undefined): string | null {
    const amount = input.amount.trim();
    if (amount && !/^\d+(\.\d{1,2})?$/.test(amount)) return "Enter the amount that arrived in rupees, up to two decimal places — or leave it for the intent's own.";
    if (amount && Number(amount) <= 0) return "The amount has to be more than zero.";
    const utr = input.utr.trim();
    if (!utr && !claim?.utr) return "Give the UTR from the statement — the payer left none.";
    if (utr && utr.length < 6) return "A UTR is at least six characters.";
    return null;
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

    /**
     * BT-1: ops saw the transfer on the statement. Captured and settled
     * exactly as a gateway capture — the wallet topped up keyed on the UTR,
     * the campaign authorised. `amount` empty means the intent's own; a
     * different figure is credited as it came and flagged. ADMIN + finance.approve.
     */
    confirmBankTransfer: (id: string, input: { amount?: string; utr?: string; note?: string }) =>
        http.post<Payment>(`/payments/${id}/bank-transfer/confirm`, input),

    /** BT-1: nothing arrived. FAILED with the reason; the payer is told to start again. */
    rejectBankTransfer: (id: string, input: { reason: string }) => http.post<Payment>(`/payments/${id}/bank-transfer/reject`, input),
};
