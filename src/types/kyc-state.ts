import type { StatusMeta } from "./common";

/**
 * The KYC state of a PARTY — N3-B (the owner, 14 Sep 2026). Every one of
 * the five queues lists parties in exactly one of these six states, derived
 * by the server from the record it has (or has not) and the party's own
 * `kycStatus` mirror; the five party reads carry the same word under
 * `kyc.state`. The vocabulary lives here so the domain types can name it;
 * `services/kyc-state` holds the chips, the filters and the row actions.
 */
export const KYC_QUEUE_STATES = ["AWAITING_DOCUMENTS", "REQUESTED", "PENDING", "NEEDS_INFO", "REJECTED", "VERIFIED"] as const;
export type KycQueueState = (typeof KYC_QUEUE_STATES)[number];

/** The state pill, one meta per state. "Pending review" rather than "Pending": the record's word is the party's mirror too. */
export const KYC_STATE_META: Record<KycQueueState, StatusMeta> = {
    AWAITING_DOCUMENTS: { label: "Awaiting documents", tone: "neutral" },
    REQUESTED: { label: "Requested", tone: "info" },
    PENDING: { label: "Pending review", tone: "warning" },
    NEEDS_INFO: { label: "Needs info", tone: "info" },
    REJECTED: { label: "Rejected", tone: "danger" },
    VERIFIED: { label: "Verified", tone: "success" },
};

/** The six facts every party read carries as `kyc` (N3-B), as the wire sends them — `status` beside them on the publisher's and the print partner's. */
export interface WireKycSummary {
    state?: string | null;
    kycId?: string | null;
    status?: string | null;
    submittedAt?: string | null;
    requestedAt?: string | null;
    requestedChannel?: string | null;
    method?: string | null;
}

/** The party read's `kyc` as the console holds it — shaped by `services/kyc-state.shapeKycSummary`. */
export interface KycSummary {
    state: KycQueueState;
    /** The record's id, null while the party has no record. */
    kycId: string | null;
    submittedAt: string | null;
    requestedAt: string | null;
    requestedChannel: "DIGIO" | "MANUAL" | null;
    method: "MANUAL" | "DIGIO" | null;
}
