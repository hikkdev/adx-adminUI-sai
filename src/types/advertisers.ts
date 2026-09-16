import type { StatusMeta } from "./common";

/**
 * The demand-side lifecycle, mirroring the backend `advertisers` module.
 * Specification: ADX-backendv1/docs/advertiser-onboarding.md.
 *
 * Deliberately shaped like `supply.ts`: the same gate vocabulary, the same
 * funnel shape, so the two activation screens read alike.
 */

export type AdvertiserType = "INDIVIDUAL" | "COMMERCIAL" | "NGO" | "AGENCY";

export const ADVERTISER_TYPE_LABELS: Record<AdvertiserType, string> = {
    INDIVIDUAL: "Individual",
    COMMERCIAL: "Company",
    NGO: "NGO",
    AGENCY: "Agency",
};

export type BrandSector =
    | "GENERAL"
    | "ALCOHOL"
    | "TOBACCO"
    | "GAMBLING"
    | "PHARMA"
    | "POLITICAL"
    | "FINANCIAL"
    | "REAL_ESTATE"
    | "EDUCATION"
    | "HEALTHCARE"
    | "INFANT_NUTRITION";

/**
 * Sectors restricted in Indian OOH. `restricted` marks the ones whose campaigns
 * route through the category rules for a block or a legal approval — the rules
 * decide, this only says which brands to ask about.
 */
export const BRAND_SECTOR_META: Record<BrandSector, { label: string; restricted: boolean }> = {
    GENERAL: { label: "General", restricted: false },
    ALCOHOL: { label: "Alcohol", restricted: true },
    TOBACCO: { label: "Tobacco", restricted: true },
    GAMBLING: { label: "Gambling", restricted: true },
    PHARMA: { label: "Pharmaceutical", restricted: true },
    POLITICAL: { label: "Political", restricted: true },
    FINANCIAL: { label: "Financial services", restricted: true },
    REAL_ESTATE: { label: "Real estate", restricted: true },
    EDUCATION: { label: "Education", restricted: false },
    HEALTHCARE: { label: "Healthcare", restricted: true },
    INFANT_NUTRITION: { label: "Infant nutrition", restricted: true },
};

/** Which of a brand's campaigns are where — the card's counts. */
export interface BrandCampaignCounts {
    total: number;
    live: number;
    scheduled: number;
}

/**
 * A brand as `GET /advertisers/:id/brands` sends it.
 *
 * The first six fields are the row; the rest are the card the endpoint
 * grew in DR 05/06 — derived on read from the brand's campaigns — and are
 * optional here because the seeded brands the offline page draws do not
 * carry them. A screen prints a card field only when it is present; it
 * never fills one in.
 */
export interface Brand {
    id: string;
    advertiserId: string;
    name: string;
    sector: BrandSector;
    logoUrl?: string | null;
    website?: string | null;
    isActive: boolean;
    /** `!isActive`, said plainly. The `?status=ARCHIVED` read returns only these. */
    archived?: boolean;
    /** The newest campaign's awareness level; null before any campaign. */
    awareness?: string | null;
    /** Likewise the newest campaign's industry and sub-category; a brand has none of its own. */
    industry?: string | null;
    subCategory?: string | null;
    campaigns?: BrandCampaignCounts;
    /** Committed budget across the brand's campaigns, as a decimal string. */
    lifetimeSpend?: string;
    createdAt?: string;
}

export type BrandStatusFilter = "ACTIVE" | "ARCHIVED";

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

/**
 * Amounts are decimal strings, exactly as the API sends them — the columns are
 * Decimal(14,2) and a JSON number would not survive the round trip. Format for
 * display; never do arithmetic on these without parsing deliberately.
 */
export interface WalletSnapshot {
    balance: string;
    goodwill: string;
    held: string;
    spendable: string;
    currency: string;
}

/** The backend's `WalletEntryType`: the spending side, and the six earning-side kinds a publisher's wallet carries. */
export type WalletEntryType =
    | "TOPUP"
    | "CAMPAIGN_DEBIT"
    | "PACKAGE_DEBIT"
    | "GOODWILL_CREDIT"
    | "REFUND"
    | "ADJUSTMENT"
    | "EARNING"
    | "BONUS"
    | "REFERRAL"
    | "PAYOUT"
    | "PENALTY"
    | "EXPIRY";

export const WALLET_ENTRY_META: Record<WalletEntryType, StatusMeta> = {
    TOPUP: { label: "Top-up", tone: "success" },
    CAMPAIGN_DEBIT: { label: "Campaign", tone: "neutral" },
    /* A subscription package bought from an agent — a plan, not a campaign. */
    PACKAGE_DEBIT: { label: "Package", tone: "neutral" },
    GOODWILL_CREDIT: { label: "Goodwill", tone: "info" },
    REFUND: { label: "Refund", tone: "info" },
    ADJUSTMENT: { label: "Adjustment", tone: "warning" },
    /* The earning side (DR 04): credits in, the payout out, and the two forfeits. */
    EARNING: { label: "Earning", tone: "success" },
    BONUS: { label: "Bonus", tone: "success" },
    REFERRAL: { label: "Referral", tone: "success" },
    PAYOUT: { label: "Payout", tone: "neutral" },
    PENALTY: { label: "Penalty", tone: "danger" },
    EXPIRY: { label: "Expiry", tone: "warning" },
};

export interface WalletEntry {
    id: string;
    type: WalletEntryType;
    /** Signed: credits positive, debits negative. */
    amount: string;
    balanceAfter: string;
    isGoodwill: boolean;
    campaignId?: string | null;
    reference?: string | null;
    note?: string | null;
    createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Funnel                                                              */
/* ------------------------------------------------------------------ */

export interface AdvertiserFunnel {
    accountsCreated: number;
    profileComplete: number;
    kycVerified: number;
    platformAgreementAccepted: number;
    funded: number;
    stuckOnAdvertiser: {
        awaitingProfile: number;
        awaitingKycSubmission: number;
        awaitingAgreement: number;
        awaitingFunds: number;
    };
    stuckOnAdx: { pendingKycReview: number };
}

export interface AdvertiserFunnelRow {
    id: string;
    displayId: string | null;
    name: string;
    companyName: string | null;
    type: AdvertiserType;
    city: string | null;
    kycStatus: "PENDING" | "VERIFIED" | "REJECTED";
    platformAgreementAcceptedAt: string | null;
    activatedAt: string | null;
    brandCount: number;
    walletBalance: string;
    createdAt: string;
}

/** The gate an advertiser is held at. Mirrors `FunnelGate` on the supply side. */
export type AdvertiserGate = "profile" | "kyc" | "agreement" | "funds" | "ready";

export const ADVERTISER_GATE_META: Record<AdvertiserGate, StatusMeta> = {
    profile: { label: "Profile incomplete", tone: "neutral" },
    kyc: { label: "KYC pending", tone: "warning" },
    agreement: { label: "Agreement pending", tone: "warning" },
    funds: { label: "Not funded", tone: "info" },
    ready: { label: "Can book", tone: "success" },
};

/**
 * The first unmet gate, in order. The backend's `bookingEligibility` returns
 * every unmet gate; a table cell has room for one, and the first is the one
 * anyone would chase.
 */
export function advertiserGate(row: AdvertiserFunnelRow): AdvertiserGate {
    const profileComplete =
        Boolean(row.city) && (row.type === "INDIVIDUAL" || Boolean(row.companyName));
    if (!profileComplete) return "profile";
    if (row.kycStatus !== "VERIFIED") return "kyc";
    if (!row.platformAgreementAcceptedAt) return "agreement";
    if (Number(row.walletBalance) <= 0) return "funds";
    return "ready";
}

/** Whose move it is. Only KYC review sits with ADX; the rest is the advertiser. */
export const ADVERTISER_GATE_OWNER: Record<AdvertiserGate, "advertiser" | "adx" | "nobody"> = {
    profile: "advertiser",
    kyc: "adx",
    agreement: "advertiser",
    funds: "advertiser",
    ready: "nobody",
};
