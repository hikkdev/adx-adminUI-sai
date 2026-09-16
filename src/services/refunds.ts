import { ApiError, api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { StatusMeta } from "@/types";
import type { Money, PayoutRailName, Timestamp } from "./finance";

/**
 * The refund desk — Lot B (Q41), package CB3.
 *
 * Two queues, two tables, one screen:
 *
 * • A **campaign refund** is what a campaign cancelled after its money was
 *   captured owes the advertiser. The cancel records it PENDING in
 *   `campaigns`; finance releases it here through
 *   `POST /finance/campaign-refunds/:id/release`, which credits the wallet
 *   with REFUND legs out of payables, or refuses it with a reason. Four eyes:
 *   the person who releases may not be the person who asked — the API answers
 *   403 (or 409 once the row has moved on) and the screen says why.
 *
 * • A **refund request** is money an advertiser wants back — raised by
 *   support on their behalf from the advertiser page, decided here. The
 *   destination was fixed when it was raised: WALLET_CREDIT needs nothing
 *   more, BANK_TRANSFER carried the advertiser's recorded consent and a
 *   VERIFIED payout method of theirs, and approval captures the frozen slice
 *   as a REFUND debit and leaves the request APPROVED for finance to pay —
 *   `mark-paid` with the bank's UTR, or `fail` with a reason, which returns
 *   the money to the wallet.
 *
 * Same discipline as `finance.ts`: no fixture fallback anywhere, money is a
 * decimal string end to end, and a write while the API is off is refused
 * rather than toasted.
 */

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

export type CampaignRefundStatus = "PENDING" | "RELEASED" | "REJECTED";
export const CAMPAIGN_REFUND_STATUSES: readonly CampaignRefundStatus[] = ["PENDING", "RELEASED", "REJECTED"];

/** One row of `GET /finance/campaign-refunds`, with the campaign it is for. */
export interface CampaignRefund {
    id: string;
    campaignId: string;
    amount: Money;
    status: CampaignRefundStatus;
    /** The cancel's reason; a refusal appends " — refused: …". */
    reason: string;
    requestedByUserId: string;
    /** Set on RELEASED and on REJECTED alike: whoever decided. */
    releasedByUserId: string | null;
    releasedAt: Timestamp | null;
    ledgerTransactionId: string | null;
    createdAt: Timestamp;
    /** Null when the campaign behind it no longer exists. */
    campaign: {
        id: string;
        reference: string;
        name: string;
        advertiserId: string;
        status: string;
    } | null;
    /** E10-1: the campaign's advertiser by name, joined through the campaign; null when the campaign is gone. */
    advertiser?: { id: string; displayId: string | null; name: string } | null;
}

export type RefundRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "PAID" | "FAILED";
export const REFUND_REQUEST_STATUSES: readonly RefundRequestStatus[] = [
    "PENDING",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
    "PAID",
    "FAILED",
];

export type RefundReason = "NO_SUITABLE_ALTERNATIVE" | "PUBLISHER_WITHDREW" | "ADVERTISER_LEAVING" | "OTHER";
export type RefundDestination = "WALLET_CREDIT" | "BANK_TRANSFER" | "ORIGINAL_METHOD";

/** One row of `GET /finance/refund-requests` — the `WalletRefundRequest` as stored. */
export interface RefundRequest {
    id: string;
    walletId: string;
    amount: Money;
    reason: RefundReason;
    /** Why, in the raiser's own words. Required at raise. */
    note: string;
    status: RefundRequestStatus;
    holdId: string | null;
    ticketId: string | null;
    raisedByUserId: string;
    decidedByUserId: string | null;
    decidedAt: Timestamp | null;
    decisionNote: string | null;
    destination: RefundDestination;
    /** The advertiser's recorded agreement to a cash refund. Null on wallet credit. */
    consentNote: string | null;
    payoutMethodId: string | null;
    rail: PayoutRailName | null;
    /** The UTR, once finance has made the transfer. */
    railReference: string | null;
    paidAt: Timestamp | null;
    paidByUserId: string | null;
    ledgerTransactionId: string | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    /** E6: the wallet's owner, joined. Null on a wallet no advertiser holds. */
    advertiser: { id: string; displayId: string | null; name: string } | null;
}

/** The list contract both queues answer on: `{ items, total, page, pageSize, counts }`. */
export interface ListPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed — every status, zero included. */
    counts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Live gate                                                           */
/* ------------------------------------------------------------------ */

/** Same gate as the rest of finance — see `financeReadsApi` in `finance.ts`. */
export const refundsReadApi = (): boolean => apiConfig.live;

function mutable() {
    if (!refundsReadApi()) {
        throw new Error("The finance console is not connected to the ADX backend.");
    }
    return http;
}

const query = (params: Record<string, string | number | undefined>): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const encoded = search.toString();
    return encoded ? `?${encoded}` : "";
};

/**
 * The four-eyes refusal, whichever status the API chose for it.
 *
 * The campaign queue answers 403 FORBIDDEN; the request queue answers 403 as
 * well; a row that has already moved on answers 409 CONFLICT. All three are
 * "this decision is not yours to make right now" rather than a broken
 * request, so the screen shows the message and leaves the row where it is.
 */
export const isDecisionRefused = (cause: unknown): cause is ApiError =>
    cause instanceof ApiError && (cause.status === 403 || cause.status === 409);

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

export const refundsService = {
    /* ---------------- Campaign refunds ---------------- */

    campaignRefunds: (filter: { status?: CampaignRefundStatus[]; campaignId?: string; page?: number; pageSize?: number } = {}) =>
        http.get<ListPage<CampaignRefund>>(
            `/finance/campaign-refunds${query({
                status: filter.status?.length ? filter.status.join(",") : undefined,
                // E7-3: the one campaign's refund, from its detail page.
                campaignId: filter.campaignId,
                page: filter.page,
                pageSize: filter.pageSize ?? 50,
            })}`
        ),

    /** Credits the advertiser's wallet. Refused when the releaser is the requester. */
    releaseCampaignRefund: (id: string, note?: string) =>
        mutable().post<CampaignRefund>(`/finance/campaign-refunds/${id}/release`, note?.trim() ? { note: note.trim() } : {}),

    rejectCampaignRefund: (id: string, reason: string) =>
        mutable().post<CampaignRefund>(`/finance/campaign-refunds/${id}/reject`, { reason }),

    /* ---------------- Refund requests ---------------- */

    refundRequests: (filter: { status?: RefundRequestStatus[]; page?: number; pageSize?: number } = {}) =>
        http.get<ListPage<RefundRequest>>(
            `/finance/refund-requests${query({
                status: filter.status?.length ? filter.status.join(",") : undefined,
                page: filter.page,
                pageSize: filter.pageSize ?? 50,
            })}`
        ),

    /**
     * Approve or refuse. On WALLET_CREDIT an approval releases the frozen
     * slice back to spendable; on BANK_TRANSFER it captures the slice as a
     * REFUND debit and the request waits APPROVED for the transfer.
     */
    decideRefundRequest: (id: string, body: { approve: boolean; decisionNote?: string }) =>
        mutable().patch<RefundRequest>(`/advertisers/refund-requests/${id}/decide`, {
            approve: body.approve,
            ...(body.decisionNote?.trim() ? { decisionNote: body.decisionNote.trim() } : {}),
        }),

    /** The UTR of a transfer that has actually been made. APPROVED → PAID. */
    markRefundPaid: (id: string, railReference: string) =>
        mutable().post<RefundRequest>(`/advertisers/refund-requests/${id}/mark-paid`, { railReference }),

    /** The transfer bounced; the money returns to the wallet. APPROVED → FAILED. */
    failRefund: (id: string, reason: string) =>
        mutable().post<RefundRequest>(`/advertisers/refund-requests/${id}/fail`, { reason }),
};

/* ------------------------------------------------------------------ */
/* Display metadata                                                    */
/* ------------------------------------------------------------------ */

export const CAMPAIGN_REFUND_STATUS_META: Record<CampaignRefundStatus, StatusMeta> = {
    PENDING: { label: "Awaiting finance", tone: "warning" },
    RELEASED: { label: "Released", tone: "success" },
    REJECTED: { label: "Refused", tone: "danger" },
};

export const REFUND_REQUEST_STATUS_META: Record<RefundRequestStatus, StatusMeta> = {
    PENDING: { label: "Awaiting decision", tone: "warning" },
    APPROVED: { label: "Approved · to pay", tone: "info" },
    REJECTED: { label: "Refused", tone: "danger" },
    WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
    PAID: { label: "Paid", tone: "success" },
    FAILED: { label: "Transfer failed", tone: "danger" },
};

export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
    NO_SUITABLE_ALTERNATIVE: "No suitable alternative",
    PUBLISHER_WITHDREW: "Publisher withdrew",
    ADVERTISER_LEAVING: "Advertiser leaving",
    OTHER: "Other",
};

export const REFUND_DESTINATION_LABEL: Record<RefundDestination, string> = {
    WALLET_CREDIT: "Wallet credit",
    BANK_TRANSFER: "Bank transfer",
    ORIGINAL_METHOD: "Original payment method",
};

/**
 * Whether a destination is cash leaving ADX, which needs the advertiser's
 * recorded consent (the consumer-protection line: ADX may prefer credit, but
 * may not impose it) and, for a bank transfer, a VERIFIED payout method.
 */
export const isCashDestination = (destination: RefundDestination): boolean =>
    destination !== "WALLET_CREDIT";

/**
 * What approving a request does — the sentence on the decide dialog. The
 * destination decides it: credit is settled at approval, cash waits for the
 * transfer.
 */
export function approvalConsequence(request: Pick<RefundRequest, "destination">): string {
    switch (request.destination) {
        case "WALLET_CREDIT":
            return "The frozen amount returns to the advertiser's spendable balance now. Nothing leaves ADX.";
        case "BANK_TRANSFER":
            return "The amount is debited from the wallet and the request waits here, approved, until finance marks the transfer paid with its UTR.";
        case "ORIGINAL_METHOD":
            return "A return to the original payment method needs the gateway, which is not configured yet — the API will refuse this.";
    }
}

/** Which of the desk's actions a request admits in its current state. */
export function refundRequestActions(request: Pick<RefundRequest, "status" | "destination">): {
    decide: boolean;
    markPaid: boolean;
    fail: boolean;
} {
    const inFlight = request.status === "APPROVED" && request.destination === "BANK_TRANSFER";
    return { decide: request.status === "PENDING", markPaid: inFlight, fail: inFlight };
}
