import type { KycQueueState } from "./kyc-state";
import type { StatusMeta } from "./common";
import type { KycDigio, KycDocumentReview, KycEscalation, KycLiveness, KycRecorded, KycRequest } from "./finance";

/* ------------------------------------------------------------------ */
/* Platform user accounts                                              */
/* ------------------------------------------------------------------ */

/** Mirrors the backend Role enum. */
export type UserRole =
    | "ADMIN"
    | "PARTNER"
    | "PUBLISHER"
    | "ADVERTISER"
    | "AGENT_PUBLISHER"
    | "AGENT_ADVERTISER";

export const USER_ROLE_META: Record<UserRole, { label: string; description: string }> = {
    ADMIN: { label: "Admin", description: "Full access to the operations console" },
    PARTNER: { label: "Partner", description: "Agency or reseller account" },
    PUBLISHER: { label: "Publisher", description: "Owns and lists ad inventory" },
    ADVERTISER: { label: "Advertiser", description: "Books campaigns against inventory" },
    AGENT_PUBLISHER: { label: "Publisher agent", description: "Onboards and services publishers" },
    AGENT_ADVERTISER: { label: "Advertiser agent", description: "Onboards and services advertisers" },
};

/* `PlatformUser`, its sessions, activity and `UserAccountStatus` are gone:
   the users domain reads `GET /users` and the shapes live with the service
   (`WireUserRow`, `WireUserDetail`, `UserStatus` in services/users.ts). */

/* ------------------------------------------------------------------ */
/* Advertiser KYC                                                      */
/* ------------------------------------------------------------------ */

/** Mirrors AdvertiserKyc.kycType on the backend. */
export type AdvertiserKycType = "INDIVIDUAL" | "COMMERCIAL" | "NGO" | "AGENCY";

export const ADVERTISER_KYC_TYPE_META: Record<AdvertiserKycType, string> = {
    INDIVIDUAL: "Individual",
    COMMERCIAL: "Commercial",
    NGO: "NGO",
    AGENCY: "Agency",
};

/** Mirrors the backend KycStatus enum; NEEDS_INFO is Lot D's re-upload ask. */
export type AdvertiserKycStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_INFO";

export const ADVERTISER_KYC_STATUS_META: Record<AdvertiserKycStatus, StatusMeta> = {
    PENDING: { label: "Pending", tone: "warning" },
    NEEDS_INFO: { label: "Needs info", tone: "info" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

export interface AdvertiserKycDocument {
    /** Backend field name, e.g. panCardUrl — what a per-document decision names. */
    field: string;
    label: string;
    fileName: string | null;
    uploadedAt: string | null;
    /** Where the file lives: a `/files/:id` URL the desk fetches with the token, or a pre-Lot-D public one. */
    url: string | null;
}

export interface AdvertiserKycCase {
    /** The KYC row id when there is a record, else (N3-B) the profile id — either is accepted as `:id` on every desk route. */
    id: string;
    /** The account's `User.id` — who the liveness video belongs to. N3-B: null for a profile nobody has registered against. */
    advertiserId: string | null;
    /** N3-B: the Advertiser PROFILE the record belongs to — what the desk records and asks over. Null on a case read older than N3-B. */
    profileId: string | null;
    /** The same as `advertiserId`, under the name the other parties use. */
    userId: string | null;
    /** N3-B: the party's state as the server derives it — AWAITING_DOCUMENTS from the moment the profile exists. */
    state: KycQueueState;
    /** N3-B: the record's id, null while the profile has no record yet. */
    kycId: string | null;
    displayId: string | null;
    city: string | null;
    /** When the profile arrived — the arrival order the awaiting rows sort by. Null on a case read that carries no party. */
    createdAt: string | null;
    /** The company name, else the account's name, else the mobile. */
    advertiser: string;
    contact: string;
    email: string;
    kycType: AdvertiserKycType;
    status: AdvertiserKycStatus;
    submittedAt: string;
    reviewedAt: string | null;
    reviewedById: string | null;
    rejectionReason: string | null;
    /** Lot D (Q42): what the reviewer said with the decision or the re-upload ask. */
    reviewNote: string | null;
    /** Lot D (Q119): the admin working the case, or null. A filter, not ownership. */
    assignedToId: string | null;
    /** E7-3: the people on the case by name, from the case read; a list row carries ids only. */
    reviewedBy: { id: string; name: string | null } | null;
    assignedTo: { id: string; name: string | null } | null;
    /** Lot A (Q31): hours since submission as the server measured; null once decided. */
    ageHours: number | null;
    slaBreached: boolean;
    /** Hours until the review SLA is breached. Negative once breached, 0 once decided. */
    slaHoursLeft: number;
    documents: AdvertiserKycDocument[];
    /** The PAN typed on the DR 08 ladder. */
    panNumber: string | null;
    /** Documents uploaded, or Digio's verification. */
    method: "MANUAL" | "DIGIO";
    /** The Digio session, when one was ever started. */
    digio: KycDigio | null;
    /** Lot D (Q42): the decision on each tile, from the case read; empty on a list row. */
    documentReviews: KycDocumentReview[];
    /** Lot D (Q131): the liveness video, from the case read; null on a list row or when none. */
    liveness: KycLiveness | null;
    /** Lot D (Q127): when the Digio-path images were purged; the reference stays as proof. */
    imagesPurgedAt: string | null;
    /** Lot G (Q127/142): handed to Compliance, by whom and why; null while not escalated (a decision clears it). */
    escalation: KycEscalation | null;
    /** Lot N: the desk's ask — when, who, which channel — or null while nobody has asked. */
    request: KycRequest | null;
    /** Lot N: who recorded the documents and from where; null before any submission. */
    recorded: KycRecorded | null;
}

/** Which documents the backend expects for each advertiser type. */
export const ADVERTISER_KYC_REQUIREMENTS: Record<
    AdvertiserKycType,
    { field: string; label: string }[]
> = {
    INDIVIDUAL: [
        { field: "nationalIdUrl", label: "National ID" },
        { field: "panCardUrl", label: "PAN card" },
        { field: "utilityBillUrl", label: "Utility bill" },
        { field: "drivingLicenseUrl", label: "Driving licence" },
    ],
    COMMERCIAL: [
        { field: "commercialIncCertUrl", label: "Certificate of incorporation" },
        { field: "commercialAssociationArticleUrl", label: "Articles of association" },
        { field: "commercialPanIdUrl", label: "Company PAN" },
        { field: "commercialGstCertUrl", label: "GST certificate" },
    ],
    NGO: [
        { field: "ngoRegCertUrl", label: "Registration certificate" },
        { field: "ngo80gCertUrl", label: "80G certificate" },
        { field: "ngoFcraRegUrl", label: "FCRA registration" },
    ],
    AGENCY: [
        { field: "agencyAuthLetterUrl", label: "Authorisation letter" },
        { field: "agencyGovtIdUrl", label: "Government ID" },
        { field: "commercialGstCertUrl", label: "GST certificate" },
    ],
};
