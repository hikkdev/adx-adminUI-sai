import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { agentService, type AgentSummary } from "@/services/agents";
import type { RequesterRole, Ticket, TicketMessage, TicketPriority, TicketSla, TicketStatus } from "@/types";

/**
 * The support desk's side of a ticket.
 *
 * Two decisions live here. Putting an agent on a ticket is not only workflow:
 * it is what later authorises that agent to reach into the publisher's account
 * — the publisher's app will only offer an access code for a request somebody
 * is already on, and the code it mints is bound to whoever that is. So the
 * assignment is an ADMIN action, the actor is recorded, and unassigning is
 * possible without closing the ticket.
 *
 * The other is answering. The backend lets ADMIN read a thread, reply on it
 * and close it, signing every reply "ADX Support" rather than with a
 * colleague's name and telling the raiser one arrived. Since Lot D (Q53/Q91)
 * a reply may also be `internal` — an ops note the requester never sees,
 * never a first response, never a notification — and the desk moves the
 * priority, the ops owner, the team and the WAITING pause through one PATCH.
 *
 * No fixtures. The seeded `tkt_*` rows are gone: the queue is on the list
 * contract now and every row carries the two SLA clocks, which nothing
 * seeded could have carried truthfully.
 */

/** The row the queue and the assignment screen share. */
export type OpsTicket = Ticket;

/** One message as `GET /support/tickets/:id` returns it, oldest first. */
export interface WireTicketMessage {
    id: string;
    ticketId: string;
    authorId: string;
    authorName: string;
    message: string;
    /** Lot D (Q53): an ops note. Only ADX ever sees one. */
    internal?: boolean;
    createdAt: string;
}

/** The ticket with its thread, as the by-id read returns it. */
export type TicketThread = Ticket & { messages: WireTicketMessage[] };

/** The name every desk reply wears on the raiser's side. Mirrors the backend. */
export const SUPPORT_AUTHOR = "ADX Support";

/**
 * Which side of the conversation a message sits on.
 *
 * The wire carries who wrote it, not whose side they were on; the raiser is
 * `ticket.userId`, and everyone else who can post on a thread is ADX. That is
 * exactly the backend's rule (owner or ADMIN), so it is safe to derive here.
 * An internal note is ADX talking to ADX and is drawn as its own kind.
 */
export function shapeThread(thread: Pick<TicketThread, "userId" | "messages">): TicketMessage[] {
    return thread.messages.map((message) => ({
        id: message.id,
        from: message.authorName,
        kind: message.internal ? "internal" : message.authorId === thread.userId ? "requester" : "support",
        body: message.message,
        at: formatDateTime(message.createdAt),
    }));
}

/* ------------------------------------------------------------------ */
/* The SLA, as the desk words it                                       */
/* ------------------------------------------------------------------ */

/** "2h 14m", "3d 4h", "12m" — a duration in the two largest units that matter. */
export function formatDuration(ms: number): string {
    const minutes = Math.floor(Math.abs(ms) / 60_000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

export interface SlaBadge {
    label: string;
    tone: "success" | "warning" | "danger" | "info" | "neutral";
}

/**
 * The SLA as the row and the properties card print it.
 *
 * Breach beats everything: a ticket past either clock says so in red. Paused
 * is WAITING on the requester and the clock is stopped. Otherwise it counts
 * down to the next clock — first response until one is given, resolution
 * after — turning amber inside the last hour. Closed tickets carry no clock.
 */
export function slaBadge(sla: TicketSla, status: TicketStatus): SlaBadge | null {
    if (status === "CLOSED") return null;
    if (sla.firstResponseBreached) {
        return { label: `First response breached${sla.dueIn !== null ? ` ${formatDuration(sla.dueIn)} ago` : ""}`, tone: "danger" };
    }
    if (sla.resolutionBreached) {
        return { label: `Resolution breached${sla.dueIn !== null ? ` ${formatDuration(sla.dueIn)} ago` : ""}`, tone: "danger" };
    }
    if (sla.paused) return { label: "Clock paused — waiting on requester", tone: "info" };
    if (sla.dueIn === null) return null;
    const label = `${formatDuration(sla.dueIn)} left`;
    return { label, tone: sla.dueIn <= 3_600_000 ? "warning" : "success" };
}

/* ------------------------------------------------------------------ */
/* The requester (E7-3)                                                */
/* ------------------------------------------------------------------ */

/** The role a requester wears, as the desk prints it. */
export const REQUESTER_ROLE_LABEL: Record<RequesterRole, string> = {
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
    AGENT: "Agent",
    PARTNER: "Partner",
    ADMIN: "ADX staff",
};

/** The three party types a requester's record can be — the ones with a page in the console. */
export type RequesterPartyType = "PUBLISHER" | "ADVERTISER" | "AGENT";

/** `GET /support/tickets/:id/requester`, as the API answers it. */
export interface WireRequesterRail {
    user: {
        id: string;
        name: string | null;
        mobile: string;
        email: string | null;
        isActive: boolean;
        createdAt: string;
        roles: string[];
        role: RequesterRole | null;
    } | null;
    party: { type: RequesterPartyType; id: string; displayId: string | null; name: string | null; kycStatus: string | null } | null;
    /** A decimal string — the settled balance of the party's wallet — or null without one. */
    walletBalance: string | null;
    openOrders: number;
    openTickets: number;
    recentActivity: { action: string; at: string }[];
}

/** The rail beside the thread, as the desk draws it. */
export interface RequesterRail {
    /** The sign-in account, for the audited session and the admin link. Null when the account is gone. */
    userId: string | null;
    name: string;
    role: RequesterRole | null;
    roleLabel: string;
    party: { type: RequesterPartyType; id: string; displayId: string | null; kycStatus: string | null; href: string } | null;
    /** Where "View in admin" goes: the party page when there is a record, else the account. */
    adminHref: string | null;
    walletBalance: string | null;
    openOrders: number;
    openTickets: number;
    recentActivity: { action: string; label: string; at: string }[];
}

/** The console page for a party record. */
export function requesterPartyHref(party: { type: RequesterPartyType; id: string }): string {
    const base = party.type === "PUBLISHER" ? "/publishers" : party.type === "ADVERTISER" ? "/advertisers" : "/agents";
    return `${base}/${encodeURIComponent(party.id)}`;
}

/** `PUBLISHER_KYC_REVIEWED` → "Publisher kyc reviewed" — the audit action as a phrase. */
export function activityLabel(action: string): string {
    const spaced = action.toLowerCase().replace(/[_.]+/g, " ").trim();
    return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : action;
}

/**
 * The name the desk prints for a requester: the party's, else the user's,
 * else their mobile — the queue row's own rule, so the rail and the row
 * never disagree.
 */
export function shapeRequesterRail(wire: WireRequesterRail): RequesterRail {
    const party = wire.party
        ? { type: wire.party.type, id: wire.party.id, displayId: wire.party.displayId, kycStatus: wire.party.kycStatus, href: requesterPartyHref(wire.party) }
        : null;
    const role: RequesterRole | null = wire.party?.type ?? wire.user?.role ?? null;
    return {
        userId: wire.user?.id ?? null,
        name: wire.party?.name?.trim() || wire.user?.name?.trim() || wire.user?.mobile || "Unknown requester",
        role,
        roleLabel: role ? REQUESTER_ROLE_LABEL[role] : "No role",
        party,
        adminHref: party ? party.href : wire.user ? `/users/${encodeURIComponent(wire.user.id)}` : null,
        walletBalance: wire.walletBalance ?? null,
        openOrders: wire.openOrders ?? 0,
        openTickets: wire.openTickets ?? 0,
        recentActivity: (wire.recentActivity ?? []).map((row) => ({ action: row.action, label: activityLabel(row.action), at: row.at })),
    };
}

/* ------------------------------------------------------------------ */
/* The queue                                                           */
/* ------------------------------------------------------------------ */

/** OLDEST is the default: a queue worked newest-first leaves the longest wait waiting. */
export type TicketSort = "OLDEST" | "NEWEST" | "DUE";

/**
 * `?q=&status=&sort=&page=&pageSize=` plus the desk's facets — the list
 * contract as `opsTicketQuerySchema` parses it. `mine` is the caller as ops
 * owner, resolved by the server from the token; `breached` is either clock
 * run out and not paused.
 */
export interface TicketQueueQuery {
    q?: string;
    status?: TicketStatus[];
    sort?: TicketSort;
    page?: number;
    pageSize?: number;
    kind?: "ISSUE" | "FEEDBACK";
    priority?: TicketPriority;
    unassigned?: boolean;
    mine?: boolean;
    breached?: boolean;
    team?: string;
}

export interface TicketQueuePage {
    items: Ticket[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted without the status facet in force. */
    counts: Record<string, number>;
    /** E10-1: the distinct teams across the whole queue, not the page, sorted. */
    teams?: string[];
}

/** The query string `GET /support/tickets/queue` takes, with nothing sent that was not asked for. */
export function ticketQueuePath(query: TicketQueueQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status?.length) params.set("status", query.status.join(","));
    params.set("sort", query.sort ?? "OLDEST");
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    if (query.kind) params.set("kind", query.kind);
    if (query.priority) params.set("priority", query.priority);
    // Flags are sent only when true: `mine=false` is not "everyone's", it is
    // a filter the server reads as false and applies as nothing.
    if (query.unassigned) params.set("unassigned", "true");
    if (query.mine) params.set("mine", "true");
    if (query.breached) params.set("breached", "true");
    if (query.team) params.set("team", query.team);
    return `/support/tickets/queue?${params.toString()}`;
}

/** Lot D (Q53/Q91): the columns the desk moves through one PATCH. */
export interface TicketPatch {
    status?: TicketStatus;
    priority?: TicketPriority;
    /** null takes the ops owner off. */
    assignedAdminUserId?: string | null;
    /** null clears the desk. */
    team?: string | null;
}

/** Re-exported so the assignment screens keep one import. The type moved to
 *  `@/services/agents` when the order board started picking agents too. */
export type { AgentSummary };

/**
 * Refuses a read while the domain is off — there is nothing to fall back to,
 * and a request against a server that is not there should say so rather
 * than hang on a spinner.
 */
function live() {
    if (!isLive("support")) {
        throw new Error("Support reads the API. Set NEXT_PUBLIC_USE_API=true to work the desk.");
    }
    return http;
}

export const supportService = {
    /**
     * The ops queue, on the list contract.
     *
     * Note this is `/tickets/queue` and not `/tickets`: the latter is scoped to
     * the caller's own tickets, so an operator calling it would see whatever
     * they had personally raised and conclude the queue was empty. The counts
     * come back computed without the status facet, so the chip row can say
     * how many each status would show.
     */
    queue: (query: TicketQueueQuery = {}): Promise<TicketQueuePage> =>
        live().get<TicketQueuePage>(ticketQueuePath(query)),

    /** The thread. The raiser's and ADX's to read; nobody else's. Carries `sla`. */
    ticket: (ticketId: string) => live().get<TicketThread>(`/support/tickets/${ticketId}`),

    /** E7-3: the rail beside the thread — the account, the party record, the wallet, what they have open, what they did last. 404 when the ticket does not exist. */
    requester: async (ticketId: string): Promise<RequesterRail> =>
        shapeRequesterRail(await live().get<WireRequesterRail>(`/support/tickets/${ticketId}/requester`)),

    /**
     * Signed "ADX Support" on the raiser's side, who is notified. With
     * `internal`, an ops note: never in the requester's thread, never a first
     * response, never a notification — audited `SUPPORT_TICKET_NOTE_ADDED`.
     */
    reply: (ticketId: string, message: string, internal = false) =>
        live().post<WireTicketMessage>(`/support/tickets/${ticketId}/reply`, internal ? { message, internal: true } : { message }),

    /**
     * The desk's PATCH. WAITING pauses both clocks and tells the requester;
     * OPEN from WAITING resumes them with the pause banked; a priority change
     * recomputes both due dates from the creation time; the ops owner and team
     * are plain columns. Audited `SUPPORT_TICKET_UPDATED` with what moved.
     */
    patch: (ticketId: string, patch: TicketPatch) =>
        live().patch<Ticket>(`/support/tickets/${ticketId}`, patch),

    /** Resolving tells the raiser; they can reply on the thread if it is not. */
    close: (ticketId: string) => supportService.patch(ticketId, { status: "CLOSED" }),

    reopen: (ticketId: string) => supportService.patch(ticketId, { status: "OPEN" }),

    /** "Waiting on the requester" — the SLA clock stops until they answer. */
    waitOnRequester: (ticketId: string) => supportService.patch(ticketId, { status: "WAITING" }),

    /** `null` takes the agent off without resolving the request. */
    assign: (ticketId: string, assignedAgentId: string | null) =>
        live().post<OpsTicket>(`/support/tickets/${ticketId}/assign`, { assignedAgentId }),

    agents: () => agentService.list(),
};
