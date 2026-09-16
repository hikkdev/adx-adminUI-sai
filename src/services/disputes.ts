import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { DisputeStatus } from "@/types";

/**
 * Disputes, live.
 *
 * `/disputes` rendered fixtures until DR 07's third wave built the domain:
 * one `Dispute` for the agent app, the user app's two personas and this
 * desk. One function per endpoint, one view model. The seeded `DSP-*`
 * cases are gone: their ids were never issued by the backend, and a fixture
 * beside a live case is the half-migration `api-config.ts` exists to
 * prevent. With the API off the desk says so.
 *
 * Two rules travel with the data. The server's six statuses project onto
 * the console's badges (`consoleStatusOf`): "SLA breach" is an open case past
 * its due time, not a status, and "Refunded" is a resolved case with a
 * credit. And a credit is recorded, never moved, until finance releases it
 * — DR 04's rule that nothing that moves money is automatic — so the desk
 * shows "credit pending" and a Release button rather than pretending the
 * decision paid anyone.
 */

export type LiveDisputeStatus = "OPEN" | "UNDER_REVIEW" | "AWAITING_RESPONSE" | "ESCALATED" | "RESOLVED" | "REJECTED";
export type DisputeOutcome = "REINSTALL" | "PARTIAL_CREDIT" | "FULL_CREDIT" | "NO_FAULT";
export type DisputeCreditStatus = "NONE" | "PENDING" | "RELEASED";
export type DisputeParty = "PUBLISHER" | "ADVERTISER" | "AGENT" | "ADX";

/** Where ops may move a case by hand; closing goes through resolve. */
export type MovableStatus = "OPEN" | "UNDER_REVIEW" | "AWAITING_RESPONSE" | "ESCALATED";

export const REASON_LABEL: Record<string, string> = {
    PROOF_REJECTED: "Proof rejected",
    PAYOUT_ISSUE: "Payout issue",
    DAMAGE: "Damage",
    WRONG_LOCATION: "Wrong location",
    OTHER: "Other",
};

export const OUTCOME_LABEL: Record<DisputeOutcome, string> = {
    REINSTALL: "Reinstall approved",
    PARTIAL_CREDIT: "Partial credit",
    FULL_CREDIT: "Full credit",
    NO_FAULT: "No fault found",
};

export interface WireDispute {
    id: string;
    displayId: string;
    raisedByUserId: string;
    raisedAs: DisputeParty;
    againstParty: DisputeParty;
    againstUserId: string | null;
    orderId: string | null;
    listingId: string | null;
    reason: string;
    detail: string;
    expectedResolution: string | null;
    amountClaimed: string | null;
    status: LiveDisputeStatus;
    statusNote: string | null;
    slaDueAt: string | null;
    reviewStartedAt: string | null;
    resolvedAt: string | null;
    outcome: DisputeOutcome | null;
    resolutionNote: string | null;
    creditedAmount: string | null;
    creditStatus: DisputeCreditStatus;
    creditReleasedAt: string | null;
    reopenUntil: string | null;
    createdAt: string;
    updatedAt: string;
    /* Lot D (Q53/Q54/Q91/Q92): the clock as the server reads it, the
       re-install a REINSTALL verdict raised, and the open fraud case citing
       this dispute (ADMIN reads only). */
    sla?: DisputeSla;
    reinstallMilestoneId?: string | null;
    reinstallStatus?: string | null;
    reinstallPending?: boolean;
    openFraudCase?: { id: string; displayId: string | null; status: string } | null;
    /** E7-3: the party record the case is against, on an ADMIN read; null against ADX or when the login has no record. */
    against?: { type: "PUBLISHER" | "ADVERTISER" | "AGENT"; id: string; displayId: string | null; name: string | null } | null;
    order: { id: string; status: string; campaignName: string | null; listing: { id: string; title: string; address: string; city: string | null } | null } | null;
    messageCount?: number;
    evidenceCount?: number;
    raisedBy?: { id: string; name: string | null };
    messages?: { id: string; authorUserId: string; authorName: string; isFromOps: boolean; body: string; createdAt: string }[];
    evidence?: { id: string; uploadedByUserId: string; url: string; kind: string; fileName: string | null; uploadedAt: string }[];
}

/** `slaOf(dispute, now)` — derived on read, never stored. `dueIn` is ms to the due time, negative once past, null once closed. */
export interface DisputeSla {
    breached: boolean;
    /** True while AWAITING_RESPONSE — the clock is stopped until a party answers. */
    paused: boolean;
    dueAt: string | null;
    dueIn: number | null;
}

export interface WireSummary {
    open: number;
    valueAtRisk: string;
    slaBreaches: number;
    avgResolutionDays: number;
    creditedThisMonth: string;
    rejectedThisMonth: number;
}

export interface CaseMessage {
    id: string;
    author: string;
    fromOps: boolean;
    body: string;
    at: string;
}

export interface CaseEvidence {
    id: string;
    kind: "IMG" | "PDF" | "OTHER";
    fileName: string;
    url: string | null;
    uploadedAt: string;
}

/** The desk's one shape for a case, live or fixture. */
export interface DisputeCase {
    id: string;
    displayId: string;
    status: LiveDisputeStatus;
    badge: DisputeStatus;
    reason: string;
    detail: string;
    expectedResolution: string | null;
    /** Decimal strings, or null when nothing was claimed or credited. */
    amountClaimed: string | null;
    creditedAmount: string | null;
    creditStatus: DisputeCreditStatus;
    outcome: DisputeOutcome | null;
    resolutionNote: string | null;
    raisedAs: DisputeParty;
    againstParty: DisputeParty;
    raisedByName: string | null;
    orderId: string | null;
    orderRef: string;
    site: string;
    filedAt: string;
    ageDays: number;
    slaNote: string | null;
    /** The clock is stopped: the case is AWAITING_RESPONSE and the server says so. */
    slaPaused: boolean;
    /** Lot D (Q92): the INSTALLATION milestone a REINSTALL verdict raised on the order. */
    reinstallMilestoneId: string | null;
    reinstallStatus: string | null;
    /** True until the re-install visit is COMPLETED or SKIPPED — "resolved, re-install pending". */
    reinstallPending: boolean;
    /** The OPEN or INVESTIGATING fraud case citing this dispute, on an ADMIN read. */
    openFraudCase: { id: string; displayId: string | null; status: string } | null;
    /** E7-3: the record the case is against — what a fraud case opened from here names as its subject. */
    against: { type: "PUBLISHER" | "ADVERTISER" | "AGENT"; id: string; displayId: string | null; name: string | null } | null;
    messages: CaseMessage[];
    evidence: CaseEvidence[];
    /** False for a queue row: the thread arrives with the by-id read. */
    threadLoaded: boolean;
}

export interface CaseSummary {
    open: number;
    valueAtRisk: string;
    slaBreaches: number;
    avgResolutionDays: number;
    creditedThisMonth: string;
    rejectedThisMonth: number;
}

const OPEN_STATUSES: LiveDisputeStatus[] = ["OPEN", "UNDER_REVIEW", "AWAITING_RESPONSE", "ESCALATED"];

export const isOpenStatus = (status: LiveDisputeStatus) => OPEN_STATUSES.includes(status);

/**
 * Whether the case is late. The server's `sla` view is the answer when it
 * rides on the row — it already adds a running pause to the due time — and
 * the raw `slaDueAt` is the fallback for a row that came without one. A
 * paused case (AWAITING_RESPONSE) never breaches while it waits.
 */
export function isBreached(dispute: Pick<WireDispute, "status" | "slaDueAt" | "sla">, now: Date): boolean {
    if (!isOpenStatus(dispute.status)) return false;
    if (dispute.sla) return dispute.sla.breached;
    if (dispute.status === "AWAITING_RESPONSE") return false;
    return !!dispute.slaDueAt && new Date(dispute.slaDueAt).getTime() < now.getTime();
}

/** The badge the desk shows: the server's status, with SLA and credit folded in. */
export function consoleStatusOf(
    dispute: Pick<WireDispute, "status" | "slaDueAt" | "creditedAmount" | "sla">,
    now: Date = new Date()
): DisputeStatus {
    switch (dispute.status) {
        case "REJECTED":
            return "rejected";
        case "RESOLVED":
            return dispute.creditedAmount ? "refunded" : "resolved";
        case "ESCALATED":
            return "escalated";
        default:
            if (isBreached(dispute, now)) return "sla_breach";
            return dispute.status === "AWAITING_RESPONSE" ? "awaiting_publisher" : dispute.status === "OPEN" ? "open" : "in_review";
    }
}

const ageDaysOf = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));

/**
 * The SLA line beside the badge. Paused says so rather than counting down
 * a clock that is stopped; otherwise the hours to or since the due time,
 * from the server's `dueIn` when it sent one.
 */
export function slaNoteOf(dispute: Pick<WireDispute, "status" | "slaDueAt" | "sla">, now: Date): string | null {
    if (!isOpenStatus(dispute.status)) return null;
    if (dispute.sla?.paused || (!dispute.sla && dispute.status === "AWAITING_RESPONSE")) return "SLA paused — awaiting a response";
    const dueIn = dispute.sla ? dispute.sla.dueIn : dispute.slaDueAt ? new Date(dispute.slaDueAt).getTime() - now.getTime() : null;
    if (dueIn === null) return null;
    const hours = Math.round(dueIn / 3_600_000);
    if (hours < 0) return `SLA breached ${Math.abs(hours)}h ago`;
    if (hours <= 24) return `SLA breach in ${hours}h`;
    return null;
}

const kindOf = (kind: string): CaseEvidence["kind"] => (kind === "PDF" ? "PDF" : kind === "IMG" ? "IMG" : "OTHER");

export function shapeDispute(wire: WireDispute, now: Date = new Date()): DisputeCase {
    const raisedBy = wire.raisedBy?.name ?? null;
    return {
        id: wire.id,
        displayId: wire.displayId,
        status: wire.status,
        badge: consoleStatusOf(wire, now),
        reason: REASON_LABEL[wire.reason] ?? wire.reason.toLowerCase().replace(/_/g, " "),
        detail: wire.detail,
        expectedResolution: wire.expectedResolution,
        amountClaimed: wire.amountClaimed,
        creditedAmount: wire.creditedAmount,
        creditStatus: wire.creditStatus,
        outcome: wire.outcome,
        resolutionNote: wire.resolutionNote,
        raisedAs: wire.raisedAs,
        againstParty: wire.againstParty,
        raisedByName: raisedBy,
        orderId: wire.orderId,
        orderRef: wire.orderId ? `ORDER #${wire.orderId.slice(-4).toUpperCase()}` : "—",
        site: wire.order?.listing?.title ?? wire.order?.campaignName ?? "—",
        filedAt: wire.createdAt,
        ageDays: ageDaysOf(wire.createdAt, now),
        slaNote: slaNoteOf(wire, now),
        slaPaused: wire.sla?.paused ?? false,
        reinstallMilestoneId: wire.reinstallMilestoneId ?? null,
        reinstallStatus: wire.reinstallStatus ?? null,
        reinstallPending: wire.reinstallPending ?? false,
        openFraudCase: wire.openFraudCase ?? null,
        against: wire.against ?? null,
        messages: (wire.messages ?? []).map((message) => ({
            id: message.id,
            author: message.authorName,
            fromOps: message.isFromOps,
            body: message.body,
            at: message.createdAt,
        })),
        evidence: (wire.evidence ?? []).map((item) => ({
            id: item.id,
            kind: kindOf(item.kind),
            fileName: item.fileName ?? "Attachment",
            url: item.url,
            uploadedAt: item.uploadedAt,
        })),
        threadLoaded: wire.messages !== undefined,
    };
}

function live() {
    if (!isLive("disputes")) {
        throw new Error("Disputes read the API. Set NEXT_PUBLIC_USE_API=true to work the desk.");
    }
    return http;
}

/* ------------------------------------------------------------------ */
/* The queue — E6, on the list contract                                */
/* ------------------------------------------------------------------ */

/** `?q=&status=a,b&page=&pageSize=` as `GET /disputes` parses them. */
export interface DisputeQueueQuery {
    q?: string;
    status?: LiveDisputeStatus[];
    page?: number;
    pageSize?: number;
}

export interface DisputeQueuePage {
    items: DisputeCase[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed — what the chips say. */
    counts: Record<string, number>;
}

/** The query string, with nothing sent that was not asked for. Oldest first is the server's order. */
export function disputeQueuePath(query: DisputeQueueQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.status?.length) params.set("status", query.status.join(","));
    params.set("page", String(query.page && query.page > 1 ? query.page : 1));
    params.set("pageSize", String(query.pageSize ?? 50));
    return `/disputes?${params.toString()}`;
}

/** The statuses each chip on the desk stands for. */
export const QUEUE_CHIP_STATUSES: Record<"open" | "escalated" | "resolved", LiveDisputeStatus[]> = {
    open: ["OPEN", "UNDER_REVIEW", "AWAITING_RESPONSE"],
    escalated: ["ESCALATED"],
    resolved: ["RESOLVED", "REJECTED"],
};

/** A chip's count off the server's per-status `counts`. */
export function chipCount(counts: Record<string, number>, statuses: LiveDisputeStatus[]): number {
    return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

export const disputeService = {
    /** The queue on the list contract: `{ items, total, page, pageSize, counts }`, oldest first. */
    queue: async (query: DisputeQueueQuery = {}): Promise<DisputeQueuePage> => {
        const page = await live().get<{ items: WireDispute[]; total: number; page: number; pageSize: number; counts?: Record<string, number> }>(
            disputeQueuePath(query)
        );
        return {
            items: (page.items ?? []).map((row) => shapeDispute(row)),
            total: page.total ?? 0,
            page: page.page ?? 1,
            pageSize: page.pageSize ?? query.pageSize ?? 50,
            counts: page.counts ?? {},
        };
    },

    /** One case with its thread, evidence, re-install and the fraud case citing it. */
    get: async (disputeId: string): Promise<DisputeCase> =>
        shapeDispute(await live().get<WireDispute>(`/disputes/${disputeId}`)),

    summary: (): Promise<CaseSummary> => live().get<WireSummary>("/disputes/summary"),

    /** Posted as ADX Ops; both parties are told. */
    message: (disputeId: string, body: string) => http.post<unknown>(`/disputes/${disputeId}/messages`, { body }),

    /** Moving a case by hand, with the note the record keeps. */
    setStatus: (disputeId: string, status: MovableStatus, note: string) =>
        http.patch<WireDispute>(`/disputes/${disputeId}/status`, { status, note }),

    /**
     * The decision. A credit is recorded pending; nothing moves until release.
     * REINSTALL raises an INSTALLATION milestone on the order, offered to the
     * agent who did the work unless `agentId` names another (Q92).
     */
    resolve: (disputeId: string, input: { outcome: DisputeOutcome; note: string; creditAmount?: string; agentId?: string }) =>
        http.post<WireDispute>(`/disputes/${disputeId}/resolve`, input),

    /** Finance's step: the wallet moves. */
    releaseCredit: (disputeId: string) => http.post<WireDispute>(`/disputes/${disputeId}/credit/release`, {}),
};
