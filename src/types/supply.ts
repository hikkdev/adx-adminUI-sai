import type { StatusMeta } from "./common";

/**
 * The publisher supply lifecycle, mirroring the backend `supply` module.
 * Specification: ADX-backendv1/docs/publisher-supply-lifecycle.md.
 */

/* ------------------------------------------------------------------ */
/* Listing status                                                      */
/* ------------------------------------------------------------------ */

export type ListingLifecycleStatus =
    | "UNCLAIMED"
    | "DRAFT"
    | "AWAITING_AGREEMENT"
    | "AWAITING_DOCUMENTS"
    | "PENDING_REVIEW"
    | "AWAITING_SITE_VERIFICATION"
    | "ACTIVE"
    | "SUSPENDED"
    | "REJECTED"
    | "INACTIVE";

/** Who has to act next. The whole point of the middle states. */
export type WaitingOn = "publisher" | "adx" | "nobody";

export const LISTING_LIFECYCLE_META: Record<ListingLifecycleStatus, StatusMeta> = {
    UNCLAIMED: { label: "Unclaimed", tone: "neutral" },
    DRAFT: { label: "Draft", tone: "neutral" },
    AWAITING_AGREEMENT: { label: "Awaiting agreement", tone: "warning" },
    AWAITING_DOCUMENTS: { label: "Awaiting documents", tone: "warning" },
    PENDING_REVIEW: { label: "Document review", tone: "info" },
    AWAITING_SITE_VERIFICATION: { label: "Site visit due", tone: "info" },
    ACTIVE: { label: "Live", tone: "success" },
    SUSPENDED: { label: "Suspended", tone: "danger" },
    REJECTED: { label: "Rejected", tone: "danger" },
    INACTIVE: { label: "Inactive", tone: "neutral" },
};

export const LISTING_LIFECYCLE_WAITING_ON: Record<ListingLifecycleStatus, WaitingOn> = {
    UNCLAIMED: "nobody",
    DRAFT: "adx",
    AWAITING_AGREEMENT: "publisher",
    AWAITING_DOCUMENTS: "publisher",
    PENDING_REVIEW: "adx",
    AWAITING_SITE_VERIFICATION: "adx",
    ACTIVE: "nobody",
    SUSPENDED: "publisher",
    REJECTED: "nobody",
    INACTIVE: "nobody",
};

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

export type Removability = "PERMANENT" | "REMOVABLE";
export type VerificationState = "UNVERIFIED" | "FRESH" | "RISKY" | "LAPSED";

export const REMOVABILITY_META: Record<Removability, { label: string; cadenceDays: number }> = {
    PERMANENT: { label: "Permanent", cadenceDays: 180 },
    REMOVABLE: { label: "Removable", cadenceDays: 90 },
};

export const VERIFICATION_STATE_META: Record<VerificationState, StatusMeta> = {
    UNVERIFIED: { label: "Never verified", tone: "neutral" },
    FRESH: { label: "Verified", tone: "success" },
    // Shown to advertisers too: verified for now, re-verification due.
    RISKY: { label: "Re-verification due", tone: "warning" },
    LAPSED: { label: "Lapsed", tone: "danger" },
};

export interface VerificationQueueRow {
    listingId: string;
    title: string;
    publisherId: string | null;
    publisherName: string | null;
    removability: Removability;
    verifiedAt: string | null;
    verificationExpiresAt: string | null;
    status: ListingLifecycleStatus;
    state: VerificationState;
}

/* ------------------------------------------------------------------ */
/* A submitted verification                                            */
/* ------------------------------------------------------------------ */

/** Who filed it: an agent on a site visit, or the publisher's own GPS camera. */
export type VerificationType = "AGENT_INITIAL" | "SELF_REVERIFICATION";

/** The backend's `VerificationStatus` — it writes ACCEPTED on an approved verification, never APPROVED. */
export type VerificationReviewStatus = "SUBMITTED" | "ACCEPTED" | "REJECTED";

export const VERIFICATION_TYPE_META: Record<VerificationType, StatusMeta> = {
    AGENT_INITIAL: { label: "Agent site visit", tone: "info" },
    SELF_REVERIFICATION: { label: "Publisher re-verification", tone: "neutral" },
};

export const VERIFICATION_REVIEW_META: Record<VerificationReviewStatus, StatusMeta> = {
    SUBMITTED: { label: "Awaiting review", tone: "warning" },
    ACCEPTED: { label: "Accepted", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

/**
 * One named shot inside a verification.
 *
 * `label` is the milestone requirement it answers, verbatim — "Decal from an
 * angle", "Reception / locker zone". Null for a single-photo submission that
 * named nothing. `order` is the position in the sequence the agent was walked
 * through, and a reviewer looking at an angle shot out of sequence cannot tell
 * whether the angle was the one asked for, so it is kept.
 */
export interface ListingVerificationPhoto {
    id: string;
    url: string;
    label: string | null;
    order: number;
}

/**
 * A site verification as the reviewer sees it.
 *
 * `photoUrl` is the first shot, denormalised on the backend so single-photo
 * readers are unchanged; it is always also `photos[0]`. Render `photos` — a
 * four-shot visit whose reviewer sees one photograph is a review of a quarter of
 * the evidence, and the agent app tells the agent all of them are checked.
 */
export interface ListingVerification {
    id: string;
    listingId: string;
    type: VerificationType;
    status: VerificationReviewStatus;
    photoUrl: string;
    photos: ListingVerificationPhoto[];
    latitude: number;
    longitude: number;
    /** From the listing's stored coordinates. Recorded, never enforced. */
    distanceMeters: number | null;
    /** A scan of the spot's own code alongside the photographs. */
    qrScanned: boolean;
    capturedAt: string;
    orderId: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Funnel                                                              */
/* ------------------------------------------------------------------ */

export interface SupplyFunnel {
    accountsCreated: number;
    kycVerified: number;
    platformAgreementAccepted: number;
    withInventory: number;
    listingAgreementAccepted: number;
    listingsLive: number;
    stuckOnPublisher: { awaitingAgreement: number; awaitingDocuments: number };
    stuckOnAdx: { pendingDocumentReview: number; awaitingSiteVerification: number };
}

export interface PublisherFunnelRow {
    id: string;
    name: string;
    city: string | null;
    isPartnerPublisher: boolean;
    kycStatus: "PENDING" | "VERIFIED" | "REJECTED";
    platformAgreementAcceptedAt: string | null;
    activatedAt: string | null;
    listingCount: number;
    liveListingCount: number;
    createdAt: string;
}

/** The gate a publisher is currently stuck at, derived from their row. */
export type FunnelGate =
    | "kyc"
    | "platform-agreement"
    | "inventory"
    | "listing-agreement"
    | "live";

export const FUNNEL_GATE_META: Record<FunnelGate, StatusMeta> = {
    kyc: { label: "KYC pending", tone: "warning" },
    "platform-agreement": { label: "Agreement pending", tone: "warning" },
    inventory: { label: "No inventory", tone: "info" },
    "listing-agreement": { label: "Listings not live", tone: "info" },
    live: { label: "Live", tone: "success" },
};

export function funnelGate(row: PublisherFunnelRow): FunnelGate {
    if (row.kycStatus !== "VERIFIED") return "kyc";
    if (!row.platformAgreementAcceptedAt) return "platform-agreement";
    if (row.listingCount === 0) return "inventory";
    if (row.liveListingCount === 0) return "listing-agreement";
    return "live";
}

/* ------------------------------------------------------------------ */
/* Attempts                                                            */
/* ------------------------------------------------------------------ */

export type AttemptOrigin = "SELF" | "AGENT" | "ADMIN_SINGLE" | "ADMIN_BULK" | "SCRAPE";
export type AttemptStatus = "DRAFT" | "AWAITING_ACCEPTANCE" | "ACCEPTED" | "ABANDONED";

export const ATTEMPT_ORIGIN_META: Record<AttemptOrigin, string> = {
    SELF: "Publisher",
    AGENT: "Field agent",
    ADMIN_SINGLE: "Ops",
    ADMIN_BULK: "Bulk import",
    SCRAPE: "Seeded",
};

export const ATTEMPT_STATUS_META: Record<AttemptStatus, StatusMeta> = {
    DRAFT: { label: "Building", tone: "neutral" },
    AWAITING_ACCEPTANCE: { label: "Awaiting acceptance", tone: "warning" },
    ACCEPTED: { label: "Accepted", tone: "success" },
    ABANDONED: { label: "Abandoned", tone: "neutral" },
};

export interface AttemptListing {
    id: string;
    title: string;
    address: string;
    city: string | null;
    status: ListingLifecycleStatus;
    removability: Removability;
    documentsClearedAt: string | null;
    verificationExpiresAt: string | null;
}

export interface ListingAttempt {
    id: string;
    publisherId: string | null;
    publisherName: string | null;
    origin: AttemptOrigin;
    status: AttemptStatus;
    sourceFilename: string | null;
    note: string | null;
    createdAt: string;
    acceptedAt: string | null;
    listings: AttemptListing[];
    progress: {
        listingCount: number;
        documentsCleared: number;
        documentsRejected: number;
        awaitingSiteVerification: number;
        live: number;
    };
}

/* ------------------------------------------------------------------ */
/* Compliance                                                          */
/* ------------------------------------------------------------------ */

export type ComplianceStatus = "OPEN" | "CONTACTED" | "RESOLVED" | "ESCALATED";

export const COMPLIANCE_STATUS_META: Record<ComplianceStatus, StatusMeta> = {
    OPEN: { label: "Needs contact", tone: "danger" },
    CONTACTED: { label: "Contacted", tone: "warning" },
    RESOLVED: { label: "Resolved", tone: "success" },
    ESCALATED: { label: "Suspended", tone: "danger" },
};

export interface ComplianceCase {
    id: string;
    listingId: string;
    listingTitle: string;
    publisherName: string | null;
    status: ComplianceStatus;
    openedAt: string;
    dueAt: string;
    attemptCount: number;
}
