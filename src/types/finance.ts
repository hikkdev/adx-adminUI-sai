import type { StatusMeta } from "./common";
import type { KycQueueState } from "./kyc-state";

/* ------------------------------------------------------------------ */
/* KYC review                                                          */
/* ------------------------------------------------------------------ */

/**
 * The badge on a case's head, keyed on the backend's own `KycStatus` (R-C):
 * the pre-Lot-D lowercase vocabulary is gone, and an escalation is a flag
 * beside the status (Lot G), not a status of its own.
 */
export const KYC_CASE_STATUS_META: Record<KycRowStatus, StatusMeta> = {
    PENDING: { label: "Awaiting review", tone: "warning" },
    NEEDS_INFO: { label: "Needs info", tone: "info" },
    VERIFIED: { label: "Approved", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

export type CheckResult = "pass" | "fail" | "manual";

export interface KycDocument {
    id: string;
    /** The column on the KYC row — what a per-document decision names (`govIdFrontUrl`). */
    field: string;
    /** What the document is — the API names it per column ("Government ID · front (Passport)"). */
    type: string;
    fileName: string;
    uploadedAt: string;
    /** Where the image is: a `/files/:id` URL the desk fetches with the token, or a pre-Lot-D public one. */
    url: string;
}

/** Lot D (Q42): one decision on one tile — the row `KycDocumentReview` holds. */
export interface KycDocumentReview {
    id: string;
    field: string;
    decision: "APPROVED" | "FLAGGED";
    note: string | null;
    reviewedById: string;
    /** E10-1: the reviewer by name beside the id, on every case read; null name for an account the platform no longer has. */
    reviewedBy?: { id: string; name: string | null } | null;
    reviewedAt: string;
}

/** Lot D (Q131): the liveness video's state — `UserKyc` with purpose LIVENESS, or null when none was recorded. */
export interface KycLiveness {
    id: string;
    status: "PENDING" | "VERIFIED" | "REJECTED";
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    /** The private file behind the video, for `<PrivateFile>`. Null once purged. */
    fileId: string | null;
    recordedById: string | null;
    /**
     * Lot N: presence attested at the desk instead of (or beside) a video —
     * an admin who met the person says so, and the note is the evidence.
     * Absent on a read older than the desk's attestation.
     */
    attestedById?: string | null;
    attestedAt?: string | null;
    attestationNote?: string | null;
}

/** Lot N: how the desk asked for the KYC — a Digio session opened on the party's behalf, or a notice to upload by hand. */
export type KycRequestChannel = "DIGIO" | "MANUAL";

/**
 * Lot N: the desk's ask, stamped on the row — when, by whom and over which
 * channel. `open` is REQUESTED as the server derives it: asked, and nothing
 * submitted since. Null while nobody has asked.
 */
export interface KycRequest {
    at: string;
    by: KycPerson | null;
    channel: KycRequestChannel;
    open: boolean;
}

/** Lot N: who put the documents on the row and from where — the party's own phone, an agent, the desk, or Digio's webhook. */
export type KycRecordedVia = "SELF" | "AGENT" | "DESK" | "DIGIO";

export interface KycRecorded {
    /** A value the server grows reads as itself. */
    via: KycRecordedVia | string;
    /** Null for Digio's own completion, or a row written before the column. */
    by: KycPerson | null;
}

export type KycRowStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_INFO";

export interface KycCheck {
    label: string;
    detail: string;
    result: CheckResult;
}

/** A Digio session as ADX holds it: the request, its answer, when, and Digio's message. */
export interface KycDigio {
    requestId: string | null;
    /** ADX's own reference sent to Digio — what stays after a purge as proof. */
    referenceId: string | null;
    /** Digio's own word: pending, approved, rejected, cancelled. */
    status: string | null;
    verifiedAt: string | null;
    message: string | null;
}

/** `{ id, name }` — who decided, who is working it, who recorded it. `name` is null when the account has none or the read predates E7-3. */
export interface KycPerson {
    id: string;
    name: string | null;
}

/** Lot G (Q127/142): where an escalation came from — the nightly age sweep, a fraud case opened against the party, or the reviewer's own button. */
export type KycEscalationSource = "AGE" | "FRAUD_LINK" | "REVIEWER";

/** A person on a case as the reads name them (G11-1): the id, and the name when the label lookup found one. */
export interface KycPerson {
    id: string;
    name: string | null;
}

/**
 * Lot G (Q127/142): the five escalation columns as one object, or null. A
 * flag on an open case rather than a status — the desk decides as before,
 * and the decision clears it. `to` is the Compliance-pool member it was
 * handed to and `by` the reviewer who escalated (null for the sweep and
 * the fraud link) — G11-1: both named by the read itself (`escalatedTo` /
 * `escalatedBy` beside the ids), so the console reads no admin list to
 * print them.
 */
export interface KycEscalation {
    at: string;
    source: KycEscalationSource;
    reason: string;
    to: KycPerson | null;
    by: KycPerson | null;
}

export interface KycCase {
    id: string;
    applicant: string;
    owner: string;
    publisherId: string;
    /** N3-B: the party's state as the server derives it — AWAITING_DOCUMENTS from the moment the account exists. */
    state: KycQueueState;
    /** N3-B: the record's id, null while the publisher has no record yet (the row is the party alone). */
    kycId: string | null;
    /** When the publisher arrived — the arrival order the awaiting rows sort by. */
    createdAt: string;
    /** The publisher's `User.id`, when they have signed in — who the liveness video belongs to. Null before that. */
    userId: string | null;
    businessType: "Individual" | "Company";
    /** The legal entity form as the API holds it: INDIVIDUAL, BUSINESS, NGO, POLITICAL. */
    entityType: string;
    city: string;
    submittedAt: string;
    /** Hours since submission, from the API; null when nothing was submitted. */
    ageHours: number | null;
    /** Past the review SLA ops set in platform settings. */
    slaBreached: boolean;
    /** Hours left of that SLA, from `ageHours`; negative once breached, 0 with nothing submitted. */
    slaHoursLeft: number;
    /** The row's own `KycStatus`, as the API sends it. */
    status: KycRowStatus;
    /** The same word, kept for the decision buttons that read it by this name. */
    kycStatus: KycRowStatus;
    /** Documents uploaded by hand, or Digio's verification. */
    method: "MANUAL" | "DIGIO";
    /** The Digio session, when one was ever started for this case. */
    digio: KycDigio | null;
    documents: KycDocument[];
    checks: KycCheck[];
    /** Who brought them in — null when they onboarded themselves (D7). */
    agent: { name: string | null; displayId: string | null } | null;
    selfOnboarded: boolean;
    rejectionReason: string | null;
    /** Lot D (Q42): what the reviewer said with the decision or the re-upload ask. */
    reviewNote: string | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    /** Lot D (Q119): the admin working the case, or null. A filter, not ownership. */
    assignedToId: string | null;
    assignedAt: string | null;
    /** E7-3: the people on the case by name, from the case read; a queue row carries ids only. */
    reviewedBy: KycPerson | null;
    assignedTo: KycPerson | null;
    /** Lot D (Q42): the decision on each tile, from the case read; empty on a queue row. */
    documentReviews: KycDocumentReview[];
    /** Lot D (Q131): the liveness video, from the case read; null on a queue row or when none. */
    liveness: KycLiveness | null;
    /** Lot D (Q127): when the Digio-path images were purged; the reference stays as proof. */
    imagesPurgedAt: string | null;
    /** Lot G (Q127/142): handed to Compliance, by whom and why; null while not escalated (a decision clears it). */
    escalation: KycEscalation | null;
    /** Lot N: the desk's ask — when, who, which channel — or null while nobody has asked. */
    request: KycRequest | null;
    /** Lot N: who recorded the documents and from where; null before any submission. */
    recorded: KycRecorded | null;
    mobile: string;
    displayId: string | null;
}

/* ------------------------------------------------------------------ */
/* Withdrawals                                                         */
/* ------------------------------------------------------------------ */

/*
 * The fixture withdrawal — four lower-case statuses, a `risk` level, a history
 * of typed-in entries — is gone. The API's withdrawal has seven statuses and a
 * rail; `services/finance.ts` holds that vocabulary (`Withdrawal`,
 * `WITHDRAWAL_STATUS_META`) and every finance screen reads it from there.
 */

/* ------------------------------------------------------------------ */
/* Disputes & refunds                                                  */
/* ------------------------------------------------------------------ */

export type DisputeStatus =
    | "open"
    | "sla_breach"
    | "in_review"
    | "awaiting_publisher"
    | "escalated"
    | "resolved"
    | "refunded"
    | "rejected";

export const DISPUTE_STATUS_META: Record<DisputeStatus, StatusMeta> = {
    open: { label: "New", tone: "info" },
    sla_breach: { label: "SLA breach", tone: "danger" },
    in_review: { label: "In review", tone: "info" },
    awaiting_publisher: { label: "Awaiting response", tone: "warning" },
    escalated: { label: "Escalated", tone: "danger" },
    resolved: { label: "Resolved", tone: "success" },
    refunded: { label: "Refunded", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
};

/* `Dispute` and `DisputeEvidence` are gone: the desk's one shape for a case
   is `DisputeCase` in `services/disputes.ts`, read from `/disputes`. The
   badge vocabulary above stays — it is the projection of the server's six
   statuses the console draws. */
