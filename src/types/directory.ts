import type { StatusMeta } from "./common";
import type { KycSummary } from "./kyc-state";
import type { AdvertiserType } from "./advertisers";
import type { AdvertiserKycStatus } from "./accounts";
import type { SuspensionColumns } from "./common";

/* ------------------------------------------------------------------ */
/* Publishers                                                          */
/* ------------------------------------------------------------------ */

/** Mirrors the backend `KycStatus` enum; `NEEDS_INFO` is Lot D's re-upload ask. */
export type KycStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NEEDS_INFO";

export const KYC_STATUS_META: Record<KycStatus, StatusMeta> = {
    PENDING: { label: "Pending", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    NEEDS_INFO: { label: "Needs info", tone: "info" },
};

/**
 * The meta for a status, with a neutral fallback for a value the enum grows
 * after this file was written. The detail page used to index the record
 * directly, and a value it did not know took the whole page down.
 */
export function kycStatusMeta(status: string): StatusMeta {
    const known = (KYC_STATUS_META as Partial<Record<string, StatusMeta>>)[status];
    return known ?? { label: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " "), tone: "neutral" };
}

/** `User.closedAt` / `closeReason`, as a party read joins them (E6). */
export interface AccountClosureFacts {
    closedAt: string | null;
    closeReason: string | null;
}

/**
 * A publisher as `GET /publishers/:id` serves it — the roster's columns plus
 * what the detail read joins (`kyc`, `listings`, `user`) and E6's two computed
 * facts. Shaped by `shapePublisherDetail` in `services/supply.ts`.
 *
 * The fixture row this replaced carried `owner`, `pan`, `monthlyEarnings`,
 * `lastActive` and a two-valued `businessType`, none of which the API sends.
 * Each is now read off the column that actually holds it (`contactName`,
 * `kyc.panNumber`, `type`) or gone: nothing on the API computes a publisher's
 * monthly earnings, and the roster migration already ruled out zero-filling.
 */
export interface Publisher extends SuspensionColumns {
    id: string;
    /** Human-readable identifier, e.g. PUB-1909-2601. Issued once at signup. */
    displayId: string | null;
    /** The sign-in account behind the profile. Null until the owner claims it by signing in with the number. */
    userId: string | null;
    /** E6: the closure columns of the account behind the profile. Null while no account backs the profile. */
    user: AccountClosureFacts | null;
    /** E6: the non-terminal orders across the publisher's listings — what STOP_OPEN_WORK would cancel. */
    openOrders: number;
    name: string;
    /** The identity: the number the owner signs in with. */
    mobile: string;
    email: string | null;
    city: string | null;
    /** `PublisherType` — INDIVIDUAL, BUSINESS, NGO or POLITICAL; null on a row older than the column. */
    type: string | null;
    kycStatus: KycStatus;
    /** The person to reach on a business profile; null on an individual's, where the owner is the publisher. */
    contactName: string | null;
    contactMobile: string | null;
    contactEmail: string | null;
    gstin: string | null;
    /** Off the KYC row; null until the party has typed it in. */
    pan: string | null;
    /** N3-B: the party's KYC state and the record's facts, as `GET /publishers/:id` derives them — the queue row's word. */
    kyc: KycSummary;
    /** The listings on the profile, counted off the detail read. */
    sites: number;
    /** Whose book the profile sits on — an `AgentProfile.id`; null for a self-signup (DR 08). */
    agentId: string | null;
    onboardingStatus: string | null;
    createdAt: string;
    activatedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Advertisers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Where an advertiser has got to, derived rather than stored.
 *
 * The backend keeps two facts — `kycStatus` and `activatedAt` — and an account
 * is only usable when both are settled: KYC verified *and* the platform
 * agreement accepted. The console used to carry "active / paused / prospect",
 * none of which corresponded to anything the server could be asked about.
 * `advertiserStatus()` in the service computes this, in one place.
 */
export type AdvertiserStatus = "active" | "pending" | "rejected";

export const ADVERTISER_STATUS_META: Record<AdvertiserStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    pending: { label: "Not yet activated", tone: "warning" },
    rejected: { label: "KYC rejected", tone: "danger" },
};

/**
 * An advertiser account, shaped as the API returns it.
 *
 * Three fields the console used to show are gone, and it is worth saying why
 * rather than leaving somebody to look for them: `activeCampaigns`,
 * `totalSpend` and `lastActive`. The first counts rows in a table that does
 * not exist; the other two are aggregates the row does not carry — the
 * detail page reads both off `GET /advertisers/:id/summary` instead.
 * Showing a zero for any of them would have been a factual claim about
 * somebody's business that nothing checked. `industry` is back since Lot G
 * (Q119): a column on the row, one of the picklist `GET
 * /advertisers/industries` serves.
 */
export interface Advertiser extends SuspensionColumns {
    id: string;
    name: string;
    /** ADV-1909-2601. Issued once at account creation, never reissued. */
    displayId: string | null;
    /** The sign-in account behind the profile. Null until somebody registers
     *  against it; absent on fixtures. */
    userId?: string | null;
    /** E6: the closure columns of the account behind the profile, off `GET /advertisers/:id`. Null while nobody has claimed it. */
    user?: AccountClosureFacts | null;
    /** The account's mobile — its login, and how ADX reaches them. */
    contact: string;
    email: string | null;
    type: AdvertiserType;
    companyName: string | null;
    /** Lot G (Q119): one of the industry picklist, or null until set. */
    industry: string | null;
    gstin: string | null;
    city: string | null;
    state: string | null;
    kycStatus: AdvertiserKycStatus;
    /** N3-B: the party's KYC state and the record's facts, as `GET /advertisers/:id` derives them — the queue row's word. Absent on a list row. */
    kyc?: KycSummary;
    /** Derived from `kycStatus` and `activatedAt`; never sent as a field. */
    status: AdvertiserStatus;
    /** Both gates passed. Null until then. */
    activatedAt: string | null;
    joinedAt: string;
}

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

export type AgentStatus = "active" | "on_leave" | "suspended" | "deactivated";

/**
 * The states the backend can vouch for. An agent is a `User` with an
 * `AgentProfile`; `User.isActive` is whether they can sign in at all, and
 * since D5 `AgentProfile.status` is whether they are offered work — ACTIVE,
 * ON_LEAVE or SUSPENDED, set by ops. "On leave" was once a fixture invention
 * with nothing behind it; now the auto-assign sweep skips it.
 */
export const AGENT_STATUS_META: Record<AgentStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    on_leave: { label: "On leave", tone: "warning" },
    suspended: { label: "Suspended", tone: "danger" },
    deactivated: { label: "Deactivated", tone: "danger" },
};

/** MON..SUN, as the profile stores working days. */
export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** The listing categories an agent takes orders for — the API's own vocabulary. */
export type AgentOrderType = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";

/** As the backend stores it — upper case, e.g. "BRONZE". Title-cased for display by `tierLabel`. */
export type AgentTier = string;

/**
 * An agent, as `GET /agents` describes one. Fixture rows and API rows are this
 * same type and render through the same columns, so a fixture that drifts
 * from the wire is a screen that works on seed data and breaks on the first
 * real row.
 */
export interface Agent extends SuspensionColumns {
    id: string;
    userId: string;
    /** N3-B: the party's KYC state and the record's facts, as `GET /agents/:id` derives them — the queue row's word. */
    kyc: KycSummary;
    /** AGT-1009-2601; null on rows older than the identifier migration. */
    displayId: string | null;
    /** `User.name` is nullable — a row created from a bare number has none. */
    name: string | null;
    /** Normalised, +91 and ten digits. */
    mobile: string;
    /** The listing joins no email; only the by-id read does. */
    email: string | null;
    city: string | null;
    state: string | null;
    tier: AgentTier;
    /** I, II or III within the tier — DR 05's rung. Null on a row older than the column. */
    tierLevel: string | null;
    status: AgentStatus;
    /** Issued to every profile by the backend; the agent shares it to be credited for a signup. */
    referralCode: string | null;
    /** ISO timestamp — `createdAt` on the wire. */
    joinedAt: string;
    /* D5 — DR 10's territory, DR 07's "Business / Org", and the work preferences. */
    territory: string | null;
    homeZone: string | null;
    radiusKm: number | null;
    workingDays: Weekday[];
    /** "HH:MM", 24-hour. */
    hoursFrom: string | null;
    hoursTo: string | null;
    autoAcceptInZone: boolean;
    orderTypes: AgentOrderType[];
    maxActiveOrders: number | null;
    businessName: string | null;
    /**
     * E10-1: the closure columns as `GET /agents/:id` joins them, the way
     * the publisher and advertiser reads do. Null when no account backs the
     * profile; undefined on the listing, which does not join them.
     */
    user?: AccountClosureFacts | null;
}
