import type { StatusMeta } from "./common";

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

export type UserAccountStatus = "active" | "invited" | "suspended";

export const USER_ACCOUNT_STATUS_META: Record<UserAccountStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    invited: { label: "Invited", tone: "warning" },
    suspended: { label: "Suspended", tone: "danger" },
};

export interface UserSession {
    id: string;
    device: string;
    location: string;
    lastSeen: string;
    current: boolean;
}

export interface UserActivityEntry {
    id: string;
    action: string;
    detail: string;
    at: string;
}

export interface PlatformUser {
    id: string;
    name: string;
    email: string;
    mobile: string;
    roles: UserRole[];
    status: UserAccountStatus;
    city: string;
    joinedAt: string;
    lastActive: string;
    /** Verified identity on file. */
    kycVerified: boolean;
    twoFactor: boolean;
    sessions: UserSession[];
    activity: UserActivityEntry[];
}

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

/** Mirrors the backend KycStatus enum. */
export type AdvertiserKycStatus = "PENDING" | "VERIFIED" | "REJECTED";

export const ADVERTISER_KYC_STATUS_META: Record<AdvertiserKycStatus, StatusMeta> = {
    PENDING: { label: "Pending", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

export interface AdvertiserKycDocument {
    /** Backend field name, e.g. panCardUrl. */
    field: string;
    label: string;
    fileName: string | null;
    uploadedAt: string | null;
}

export interface AdvertiserKycCase {
    id: string;
    advertiserId: string;
    advertiser: string;
    contact: string;
    email: string;
    city: string;
    kycType: AdvertiserKycType;
    status: AdvertiserKycStatus;
    submittedAt: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
    rejectionReason: string | null;
    /** Hours until the review SLA is breached. Negative once breached. */
    slaHoursLeft: number;
    monthlySpend: number;
    documents: AdvertiserKycDocument[];
    riskFlags: string[];
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
