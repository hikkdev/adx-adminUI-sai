import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Publishers                                                          */
/* ------------------------------------------------------------------ */

export type KycStatus = "verified" | "under_review" | "rejected" | "pending";

export const KYC_STATUS_META: Record<KycStatus, StatusMeta> = {
    verified: { label: "Verified", tone: "success" },
    under_review: { label: "Under review", tone: "warning" },
    rejected: { label: "Rejected", tone: "danger" },
    pending: { label: "Pending", tone: "neutral" },
};

export type BusinessType = "individual" | "company";

export interface Publisher {
    id: string;
    name: string;
    owner: string;
    email: string;
    phone: string;
    city: string;
    businessType: BusinessType;
    kycStatus: KycStatus;
    sites: number;
    monthlyEarnings: number;
    lastActive: string;
    joinedAt: string;
    pan: string;
    gstin?: string;
    onboardedBy?: string;
}

/* ------------------------------------------------------------------ */
/* Advertisers                                                         */
/* ------------------------------------------------------------------ */

export type AdvertiserStatus = "active" | "paused" | "prospect";

export const ADVERTISER_STATUS_META: Record<AdvertiserStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    paused: { label: "Paused", tone: "warning" },
    prospect: { label: "Prospect", tone: "neutral" },
};

export interface Advertiser {
    id: string;
    name: string;
    contact: string;
    email: string;
    industry: string;
    status: AdvertiserStatus;
    activeCampaigns: number;
    totalSpend: number;
    lastActive: string;
    joinedAt: string;
    gstin: string;
}

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

export type AgentStatus = "active" | "on_leave" | "suspended";

export const AGENT_STATUS_META: Record<AgentStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    on_leave: { label: "On leave", tone: "warning" },
    suspended: { label: "Suspended", tone: "danger" },
};

export type AgentTier = "bronze" | "silver" | "gold" | "platinum";

export interface Agent {
    id: string;
    name: string;
    area: string;
    city: string;
    phone: string;
    email: string;
    status: AgentStatus;
    tier: AgentTier;
    publishersOnboarded: number;
    ordersCompleted: number;
    monthlyEarnings: number;
    rating: number;
    joinedAt: string;
    lastActive: string;
}
