import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Support console                                                     */
/* ------------------------------------------------------------------ */

/**
 * Ticket status, exactly the backend's `TicketStatus` enum.
 *
 * Three states since Lot D (Q53): WAITING is "on the requester" — the SLA
 * clock is paused until they answer or ops moves it back to OPEN. The console
 * used to carry a "pending" between open and resolved that the backend never
 * had; WAITING is the real thing, and it is the server that pauses the clock.
 */
export type TicketStatus = "OPEN" | "WAITING" | "CLOSED";

export const TICKET_STATUS_META: Record<TicketStatus, StatusMeta> = {
    OPEN: { label: "Open", tone: "warning" },
    WAITING: { label: "Waiting on requester", tone: "info" },
    CLOSED: { label: "Closed", tone: "success" },
};

/** Lot D (Q91): the four priorities, each with its own pair of SLA targets. */
export type TicketPriority = "URGENT" | "HIGH" | "NORMAL" | "LOW";

export const TICKET_PRIORITIES: readonly TicketPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];

export const TICKET_PRIORITY_META: Record<TicketPriority, StatusMeta> = {
    URGENT: { label: "Urgent", tone: "danger" },
    HIGH: { label: "High", tone: "danger" },
    NORMAL: { label: "Normal", tone: "neutral" },
    LOW: { label: "Low", tone: "neutral" },
};

/**
 * The two clocks, derived on read by the server (`slaView`) and never stored.
 * `dueIn` is milliseconds to the next clock — first response until one is
 * given, resolution after — negative once it has run out, null once closed.
 */
export interface TicketSla {
    firstResponseBreached: boolean;
    resolutionBreached: boolean;
    /** True while WAITING on the requester — the clock is stopped. */
    paused: boolean;
    dueIn: number | null;
    firstResponseDueAt: string | null;
    resolutionDueAt: string | null;
}

export interface TicketMessage {
    id: string;
    from: string;
    /** `internal` is an ops note the requester never sees. */
    kind: "requester" | "support" | "internal";
    body: string;
    at: string;
}

/**
 * A support request, shaped as `GET /support/tickets/queue` returns it.
 *
 * The ops queue returns ticket rows and nothing else — no requester join, no
 * message thread. The desk fetches the thread by id when a ticket is selected.
 */
export interface Ticket {
    id: string;
    /** The User who raised it. Not resolved to a name by the queue endpoint. */
    userId: string;
    title: string;
    description: string;
    category: string;
    status: TicketStatus;
    /** The agent ADX put on this request; what later authorises delegated
     *  access to the requester's account. */
    assignedAgentId: string | null;
    assignedAt: string | null;
    assignedById: string | null;
    relatedOrderId: string | null;
    createdAt: string;
    /** TKT-… or FB-…, minted off the identifiers counter when the ticket is
     *  raised. Rows older than DR 07's second wave have none. */
    displayId?: string | null;
    /** Feedback is a ticket wearing FB- clothes; the desk shows it as one. */
    kind?: "ISSUE" | "FEEDBACK";
    /** What the raiser attached, as uploaded URLs. */
    attachmentUrls?: string[];
    /* Lot D (Q53/Q91): the priority, the ops owner and desk, and the clocks. */
    priority: TicketPriority;
    /** The ops user working it — distinct from the field agent above. */
    assignedAdminUserId: string | null;
    assignedAdminAt: string | null;
    team: string | null;
    firstRespondedAt: string | null;
    sla: TicketSla;
    /** E7-3: who raised it, as the queue row carries it — the party's name
     *  and record when the login has one, else the account's. Absent on rows
     *  from before Lot E. */
    requester?: TicketRequester | null;
}

/** The console's vocabulary for who a login is: the party record's type when
 *  it has one, else the account's primary role folded to it. */
export type RequesterRole = "PUBLISHER" | "ADVERTISER" | "AGENT" | "PARTNER" | "ADMIN";

/** `{ userId, name, role, displayId }` on every queue row (E7-3). */
export interface TicketRequester {
    userId: string;
    name: string | null;
    role: RequesterRole | null;
    displayId: string | null;
}

/* `Creative`, `CreativeStatus` and `CREATIVE_STATUS_META` are gone: the
   review desk reads `/campaigns/creatives/review-queue` through
   `moderationService`, whose shapes live with the service, and the seeded
   `cr_*` creatives named a status vocabulary (awaiting, flagged…) that no
   CampaignCreative has. */

/* `CapabilityGroup`, `RoleColumn` and `AdminUser` are gone: the roles domain
   reads `/roles-config` and its shapes live with the service
   (`PermissionGroup`, `RoleConfig` in services/roles.ts). */

/* ------------------------------------------------------------------ */
/* Notifications & audit                                               */
/* ------------------------------------------------------------------ */

/* `AppNotification` is gone: the feed's row is `NotificationRow` in
   `services/notifications.ts`, shaped from what `GET /notifications` sends. */

