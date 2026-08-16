import type { StatusMeta, Tone } from "./common";

/* ------------------------------------------------------------------ */
/* Support console                                                     */
/* ------------------------------------------------------------------ */

export type TicketStatus = "open" | "pending" | "resolved";

export const TICKET_STATUS_META: Record<TicketStatus, StatusMeta> = {
    open: { label: "Open", tone: "warning" },
    pending: { label: "Pending", tone: "info" },
    resolved: { label: "Resolved", tone: "success" },
};

export interface TicketMessage {
    id: string;
    from: string;
    kind: "requester" | "support" | "system" | "internal";
    body: string;
    at: string;
    attachment?: { name: string; size: string };
}

export interface Ticket {
    id: string;
    subject: string;
    team: "Payments" | "Fulfilment" | "KYC" | "Orders" | "Account";
    ago: string;
    requester: string;
    requesterRole: "Publisher" | "Advertiser" | "Agent" | "Publisher agent";
    priority: "low" | "normal" | "high";
    status: TicketStatus;
    assignee: string;
    createdAt: string;
    slaLeft: string;
    mine?: boolean;
    wallet: number;
    openOrders: number;
    ticketCount: number;
    recentActivity: { label: string; ago: string }[];
    messages: TicketMessage[];
}

/* ------------------------------------------------------------------ */
/* Content moderation                                                  */
/* ------------------------------------------------------------------ */

export type CreativeStatus = "awaiting" | "flagged" | "approved" | "rejected" | "resubmitted";

export const CREATIVE_STATUS_META: Record<CreativeStatus, StatusMeta> = {
    awaiting: { label: "Awaiting review", tone: "warning" },
    flagged: { label: "Flagged", tone: "danger" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Rejected", tone: "danger" },
    resubmitted: { label: "Resubmitted", tone: "info" },
};

export interface Creative {
    id: string;
    advertiser: string;
    campaign: string;
    kind: "Static" | "Video";
    dimensions: string;
    fileSize: string;
    submittedAt: string;
    status: CreativeStatus;
    flags: string[];
    /** Deterministic placeholder gradient hue for the preview tile */
    previewHue: number;
}

/* ------------------------------------------------------------------ */
/* Growth CMS (agent milestone program)                                */
/* ------------------------------------------------------------------ */

export type MilestoneStatus = "live" | "scheduled" | "paused" | "draft" | "ended";

export const MILESTONE_STATUS_META: Record<MilestoneStatus, StatusMeta> = {
    live: { label: "Live", tone: "success" },
    scheduled: { label: "Scheduled", tone: "info" },
    paused: { label: "Paused", tone: "warning" },
    draft: { label: "Draft", tone: "neutral" },
    ended: { label: "Ended", tone: "neutral" },
};

export type MilestoneAudience = "Publisher agents" | "Advertiser agents" | "Both";

export interface Milestone {
    id: string;
    title: string;
    description: string;
    audience: MilestoneAudience;
    targetCount: number;
    targetLabel: string;
    rewardInr: number;
    durationDays: number;
    targetEvent: string;
    autoEnroll: boolean;
    pushOnUnlock: boolean;
    status: MilestoneStatus;
    enrolled: number;
    completed: number;
    note?: string;
}

/* ------------------------------------------------------------------ */
/* Roles & permissions                                                 */
/* ------------------------------------------------------------------ */

/** One row of the capability matrix (e.g. "Approve withdrawals ≤ ₹1L"). */
export interface CapabilityRow {
    id: string;
    label: string;
}

export interface CapabilityGroup {
    id: string;
    label: string;
    capabilities: CapabilityRow[];
}

/** One column of the matrix: a role and the capability ids it holds. */
export interface RoleColumn {
    id: string;
    name: string;
    members: number;
    grants: string[];
    system?: boolean;
}

/* ------------------------------------------------------------------ */
/* Admin users                                                         */
/* ------------------------------------------------------------------ */

export type AdminUserStatus = "active" | "invited" | "suspended";

export const ADMIN_USER_STATUS_META: Record<AdminUserStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    invited: { label: "Invited", tone: "info" },
    suspended: { label: "Suspended", tone: "danger" },
};

export interface AdminUser {
    id: string;
    name: string;
    email: string;
    role: string;
    twoFactorEnabled: boolean;
    lastLogin: string;
    status: AdminUserStatus;
}

/* ------------------------------------------------------------------ */
/* Notifications & audit                                               */
/* ------------------------------------------------------------------ */

export interface AppNotification {
    id: string;
    severity: Tone;
    title: string;
    body: string;
    time: string;
    read: boolean;
    href?: string;
}

export interface AuditEvent {
    id: string;
    actor: string;
    actorRole: string;
    action: string;
    target: string;
    module: string;
    at: string;
    ip: string;
}
