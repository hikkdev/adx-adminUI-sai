import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* KYC review                                                          */
/* ------------------------------------------------------------------ */

export type KycCaseStatus = "awaiting_review" | "needs_info" | "escalated" | "approved" | "rejected";

export const KYC_CASE_STATUS_META: Record<KycCaseStatus, StatusMeta> = {
    awaiting_review: { label: "Awaiting review", tone: "warning" },
    needs_info: { label: "Needs info", tone: "info" },
    escalated: { label: "Escalated", tone: "danger" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
};

export type CheckResult = "pass" | "fail" | "manual";

export interface KycDocument {
    id: string;
    type: "PAN card" | "GST certificate" | "Bank proof" | "Aadhaar" | "Shop licence";
    fileName: string;
    uploadedAt: string;
    pages: number;
}

export interface KycCheck {
    label: string;
    detail: string;
    result: CheckResult;
}

export interface KycCase {
    id: string;
    applicant: string;
    owner: string;
    publisherId: string;
    businessType: "Individual" | "Company";
    city: string;
    submittedAt: string;
    slaHoursLeft: number;
    status: KycCaseStatus;
    documents: KycDocument[];
    checks: KycCheck[];
    riskFlags: string[];
    assignee?: string;
}

/* ------------------------------------------------------------------ */
/* Withdrawals                                                         */
/* ------------------------------------------------------------------ */

export type WithdrawalStatus = "pending" | "approved" | "rejected" | "on_hold";

export const WITHDRAWAL_STATUS_META: Record<WithdrawalStatus, StatusMeta> = {
    pending: { label: "Pending", tone: "warning" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
    on_hold: { label: "On hold", tone: "neutral" },
};

export type RiskLevel = "low" | "medium" | "high";

export const RISK_LEVEL_META: Record<RiskLevel, StatusMeta> = {
    low: { label: "Low risk", tone: "success" },
    medium: { label: "Medium risk", tone: "warning" },
    high: { label: "High risk", tone: "danger" },
};

export interface WithdrawalHistoryEntry {
    id: string;
    date: string;
    amount: number;
    method: string;
    status: WithdrawalStatus;
}

export interface Withdrawal {
    id: string;
    requester: string;
    requesterRole: "Publisher" | "Agent";
    region: string;
    memberSince: string;
    amount: number;
    availableBalance: number;
    totalWithdrawn12m: number;
    averageWithdrawal: number;
    destination: string;
    requestedAgo: string;
    status: WithdrawalStatus;
    risk: RiskLevel;
    riskChecks: { label: string; detail: string; result: CheckResult }[];
    history: WithdrawalHistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* Payout batches                                                      */
/* ------------------------------------------------------------------ */

export type PayoutBatchStatus = "draft" | "review" | "scheduled" | "processing" | "completed" | "failed";

export const PAYOUT_BATCH_STATUS_META: Record<PayoutBatchStatus, StatusMeta> = {
    draft: { label: "Draft", tone: "neutral" },
    review: { label: "In review", tone: "info" },
    scheduled: { label: "Scheduled", tone: "info" },
    processing: { label: "Processing", tone: "warning" },
    completed: { label: "Completed", tone: "success" },
    failed: { label: "Failed", tone: "danger" },
};

export interface PayoutLine {
    id: string;
    publisher: string;
    upiOrAccount: string;
    grossEarnings: number;
    commission: number;
    tds: number;
    netPayout: number;
    flagged?: string;
}

export interface PayoutBatch {
    id: string;
    number: number;
    payouts: number;
    amount: number;
    status: PayoutBatchStatus;
    scheduledFor?: string;
    completedAt?: string;
    lines: PayoutLine[];
}

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

export type InvoiceStatus = "paid" | "due" | "overdue" | "draft" | "void";

export const INVOICE_STATUS_META: Record<InvoiceStatus, StatusMeta> = {
    paid: { label: "Paid", tone: "success" },
    due: { label: "Due", tone: "warning" },
    overdue: { label: "Overdue", tone: "danger" },
    draft: { label: "Draft", tone: "neutral" },
    void: { label: "Void", tone: "neutral" },
};

export interface Invoice {
    id: string;
    number: string;
    party: string;
    kind: "Advertiser invoice" | "Publisher payout" | "Agent commission";
    amount: number;
    gst: number;
    issuedAt: string;
    dueAt: string;
    status: InvoiceStatus;
}

/* ------------------------------------------------------------------ */
/* Disputes & refunds                                                  */
/* ------------------------------------------------------------------ */

export type DisputeStatus =
    | "sla_breach"
    | "in_review"
    | "awaiting_publisher"
    | "escalated"
    | "resolved"
    | "refunded"
    | "rejected";

export const DISPUTE_STATUS_META: Record<DisputeStatus, StatusMeta> = {
    sla_breach: { label: "SLA breach", tone: "danger" },
    in_review: { label: "In review", tone: "info" },
    awaiting_publisher: { label: "Awaiting publisher", tone: "warning" },
    escalated: { label: "Escalated", tone: "danger" },
    resolved: { label: "Resolved", tone: "success" },
    refunded: { label: "Refunded", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
};

export interface DisputeEvidence {
    id: string;
    kind: "IMG" | "PDF";
    fileName: string;
    uploadedAt: string;
}

export interface Dispute {
    id: string;
    orderRef: string;
    advertiser: string;
    publisher: string;
    site: string;
    reason: string;
    detail: string;
    amount: number;
    filedAt: string;
    ageDays: number;
    slaNote?: string;
    status: DisputeStatus;
    evidence: DisputeEvidence[];
    publisherResponse?: { by: string; repliedAt: string; body: string };
}
