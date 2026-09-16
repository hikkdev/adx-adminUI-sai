import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta, Tone } from "@/types";

/**
 * Field visits — DR 06's dispatch board, wired to the backend `visits` module.
 *
 * A visit is the trip that is not a step on an order: an onboarding call on a
 * lead, a renewal call on an advertiser, a follow-up, a survey. The agent app
 * works its own through `GET /visits/mine`; this file is the admin half — the
 * cross-agent `GET /visits`, the dispatch, and the three things ops does to a
 * card once it exists.
 *
 * No fixture fallback, and none is missing: no seed file has ever described a
 * visit, so there is no `vis_*` id in existence to hand to a live endpoint.
 *
 * Three rules the rest of this file exists to keep:
 *
 * - `earned` is a decimal STRING or null, and stays one. It is what the wallet
 *   recorded when the visit completed; null is a completion with no rate
 *   configured, which is not zero. It is printed by `formatMoney` and never
 *   becomes a number.
 *
 * - `expiresInSeconds` is the server's clock. Dispatching to an agent is an
 *   OFFER with the same 25 minutes an order offer gets; the console draws the
 *   countdown and keeps no clock of its own.
 *
 * - `pill` comes off the wire. The server folds seven statuses onto four
 *   pills, and the console does not keep a second opinion; `visitPillTone`
 *   bridges the API's tone words onto the five the StatusBadge draws.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** The backend's `FieldVisitKind`. Lot E (Q99) added AUDIT — a data audit or poster check, paid at the visit rate like the rest. */
export type VisitKind = "ONBOARDING" | "RENEWAL" | "FOLLOW_UP" | "SURVEY" | "AUDIT";

export const VISIT_KINDS: readonly VisitKind[] = ["ONBOARDING", "RENEWAL", "FOLLOW_UP", "SURVEY", "AUDIT"];

export const VISIT_KIND_LABEL: Record<VisitKind, string> = {
    ONBOARDING: "Onboarding",
    RENEWAL: "Renewal",
    FOLLOW_UP: "Follow-up",
    SURVEY: "Survey",
    AUDIT: "Audit",
};

export const visitKindLabel = (kind: VisitKind | string): string =>
    VISIT_KIND_LABEL[kind as VisitKind] ?? kind;

export type VisitStatus =
    | "REQUESTED"
    | "SCHEDULED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "DECLINED"
    | "EXPIRED"
    | "CANCELLED";

export const VISIT_STATUSES: readonly VisitStatus[] = [
    "REQUESTED",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETED",
    "DECLINED",
    "EXPIRED",
    "CANCELLED",
];

/**
 * A badge per status, for the chips.
 *
 * This is NOT the card's pill. The pill is a property of a visit and arrives
 * with it; these are the seven options in the chip row, which the server has
 * no reason to send. Tones follow the pill's so a chip and the cards under it
 * agree, with the three settled-badly statuses in neutral rather than danger:
 * a declined visit is an agent saying no, which is allowed.
 */
export const VISIT_STATUS_META: Record<VisitStatus, StatusMeta> = {
    REQUESTED: { label: "Requested", tone: "warning" },
    SCHEDULED: { label: "Scheduled", tone: "info" },
    IN_PROGRESS: { label: "In progress", tone: "info" },
    COMPLETED: { label: "Completed", tone: "success" },
    DECLINED: { label: "Declined", tone: "neutral" },
    EXPIRED: { label: "Expired", tone: "neutral" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/**
 * The API's tone vocabulary onto the console's.
 *
 * A translation, not a second mapping: the server still decides which tone a
 * status gets. `warn` is the new-request pill — work waiting on an answer —
 * and lands on warning; `new` is the two open states and lands on info.
 */
export function visitPillTone(tone: string): Tone {
    switch (tone) {
        case "warn":
            return "warning";
        case "new":
            return "info";
        case "live":
            return "success";
        default:
            return "neutral";
    }
}

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

export type VisitColumnId = "requested" | "scheduled" | "in_progress" | "completed" | "closed";

/**
 * The five columns, in the order the day happens: a request goes out, is
 * accepted into a slot, is worked, is done — or ends in one of the three ways
 * a visit stops without happening, which share a column because ops treats
 * them the same way (look at why, dispatch again).
 */
export const VISIT_BOARD_COLUMNS: { id: VisitColumnId; title: string; statuses: VisitStatus[] }[] = [
    { id: "requested", title: "Requested", statuses: ["REQUESTED"] },
    { id: "scheduled", title: "Scheduled", statuses: ["SCHEDULED"] },
    { id: "in_progress", title: "In progress", statuses: ["IN_PROGRESS"] },
    { id: "completed", title: "Completed", statuses: ["COMPLETED"] },
    { id: "closed", title: "Closed", statuses: ["DECLINED", "EXPIRED", "CANCELLED"] },
];

export const VISIT_COLUMN_OF = Object.fromEntries(
    VISIT_BOARD_COLUMNS.flatMap((column) => column.statuses.map((status) => [status, column.id])),
) as Record<VisitStatus, VisitColumnId>;

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/** A visit card exactly as `GET /visits` and `POST /visits` send it. */
export interface WireVisit {
    id: string;
    /** VIS-…; null on a row older than the identifier migration. */
    displayId: string | null;
    kind: VisitKind | string;
    status: VisitStatus;
    /** The badge, decided server-side. Sent on every card. */
    pill: { label: string; tone: string };
    businessName: string;
    locality: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    scheduledFor: string | null;
    /** Set only while REQUESTED. */
    offerExpiresAt: string | null;
    /** The countdown, in the server's clock. Null unless REQUESTED. */
    expiresInSeconds: number | null;
    startedAt: string | null;
    completedAt: string | null;
    /** Decimal string once completed and paid; null otherwise. Never a number. */
    earned: string | null;
    leadId: string | null;
    publisherId: string | null;
    advertiserId: string | null;
    agentId: string;
    notes: string | null;
}

/** One card on the board. Identical to the wire but for the painted pill. */
export interface VisitRow extends Omit<WireVisit, "pill"> {
    pill: StatusMeta;
}

export function shapeVisit(wire: WireVisit): VisitRow {
    return { ...wire, pill: { label: wire.pill.label, tone: visitPillTone(wire.pill.tone) } };
}

/**
 * Every status at a number, whatever the server sent.
 *
 * The histogram is counted without the status facet so the chips never
 * collapse, and `countsFrom` on the server already fills every status in —
 * but a chip reading "undefined" is the failure this guards against if that
 * ever changes, so the fill is repeated here rather than trusted.
 */
export function shapeCounts(counts: Record<string, number> | undefined): Record<VisitStatus, number> {
    const shaped = {} as Record<VisitStatus, number>;
    for (const status of VISIT_STATUSES) shaped[status] = counts?.[status] ?? 0;
    return shaped;
}

/* ------------------------------------------------------------------ */
/* How the board reads a card                                          */
/* ------------------------------------------------------------------ */

/** "Jayanagar 4th Block · Bengaluru", whichever half exists, or nothing. */
export function whereLabel(visit: Pick<VisitRow, "locality" | "city">): string {
    const parts = [visit.locality, visit.city].filter((part): part is string => Boolean(part?.trim()));
    return parts.length ? parts.join(" · ") : "—";
}

/**
 * "Expires in 25 min" on a request, or null on anything else.
 *
 * Counted against the local clock when there is one (`useNow`, which is null
 * on the server and the first client render) so a board left open ticks down,
 * and against the server's snapshot otherwise. Rounded up: 61 seconds is still
 * two minutes of somebody's attention. The server keeps the real clock and
 * sweeps the request when it runs out; this only draws it.
 */
export function expiresInLabel(
    visit: Pick<VisitRow, "status" | "offerExpiresAt" | "expiresInSeconds">,
    nowMs: number | null,
): string | null {
    if (visit.status !== "REQUESTED") return null;
    let seconds: number | null = null;
    if (nowMs !== null && visit.offerExpiresAt) {
        seconds = Math.round((Date.parse(visit.offerExpiresAt) - nowMs) / 1000);
    } else if (visit.expiresInSeconds !== null) {
        seconds = visit.expiresInSeconds;
    }
    if (seconds === null) return null;
    if (seconds <= 0) return "Expiring now";
    return `Expires in ${Math.ceil(seconds / 60)} min`;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface VisitsPage {
    items: VisitRow[];
    total: number;
    page: number;
    pageSize: number;
    /** How many visits sit behind each status, counted without the status facet. */
    counts: Record<VisitStatus, number>;
}

export type AdminVisitsSort = "SOONEST" | "NEWEST";

export interface AdminVisitsQuery {
    q?: string;
    status?: VisitStatus[];
    sort?: AdminVisitsSort;
    page?: number;
    pageSize?: number;
    /** One Indian day, as YYYY-MM-DD. Left off, the board shows every day. */
    date?: string;
    agentId?: string;
    city?: string;
    kind?: VisitKind;
}

/** The default page. The API's ceiling, because a board wants the whole day. */
export const VISITS_PAGE_SIZE = 100;

/**
 * `?date=&status=&agentId=…` exactly as `adminVisitsQuerySchema` parses it.
 *
 * Pure, so the shape the board sends can be pinned without a transport: a
 * facet the caller did not set is not sent at all, status travels as the comma
 * list a chip row serialises to, and a page is always asked for.
 */
export function buildVisitsQuery(query: AdminVisitsQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.sort) params.set("sort", query.sort);
    if (query.date) params.set("date", query.date);
    if (query.agentId) params.set("agentId", query.agentId);
    if (query.city) params.set("city", query.city);
    if (query.kind) params.set("kind", query.kind);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? VISITS_PAGE_SIZE));
    return params.toString();
}

/** `POST /visits` from ADX: a dispatch to a named agent, with the 25-minute clock. */
export interface DispatchVisitInput {
    kind: VisitKind;
    agentId: string;
    /** Exactly one of the three. The schema refuses two or none. */
    leadId?: string;
    publisherId?: string;
    advertiserId?: string;
    businessName: string;
    locality?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    /** ISO datetime. Left off, the agent picks the slot on accepting. */
    scheduledFor?: string;
    notes?: string;
}

/**
 * Refuses to talk to the API while the domain is off.
 *
 * There is nothing to fall back to: the board is the only screen and there are
 * no visit fixtures. Throwing here, before a request goes out, is what keeps a
 * "dispatched" toast from ever appearing over nothing.
 */
function live() {
    if (!isLive("visits")) throw new Error("Visits read the API; connect the console to the ADX backend first.");
    return http;
}

export const visitsService = {
    /**
     * The board's page.
     *
     * Every facet goes to the API rather than being applied here: `counts`
     * comes back computed without the status in force, which is the only way
     * each chip can say how many it would show, and the day is cut against the
     * Indian calendar on the server because the hosts run UTC.
     */
    board: async (query: AdminVisitsQuery = {}): Promise<VisitsPage> => {
        const page = await live().get<{
            items: WireVisit[];
            total: number;
            page: number;
            pageSize: number;
            counts?: Record<string, number>;
        }>(`/visits?${buildVisitsQuery(query)}`);
        return {
            items: (page.items ?? []).map(shapeVisit),
            total: page.total,
            page: page.page,
            pageSize: page.pageSize,
            counts: shapeCounts(page.counts),
        };
    },

    /** One visit, as the card draws it. */
    get: async (visitId: string): Promise<VisitRow> => shapeVisit(await live().get<WireVisit>(`/visits/${visitId}`)),

    /**
     * Dispatches a visit to an agent. It lands REQUESTED with the clock
     * running; the agent accepts from the field app or it goes back to ops
     * as EXPIRED twenty-five minutes later.
     */
    dispatch: async (input: DispatchVisitInput): Promise<VisitRow> =>
        shapeVisit(await live().post<WireVisit>("/visits", input)),

    /**
     * A different agent. The server treats this as a fresh offer — the visit
     * goes back to REQUESTED with a fresh 25-minute clock, whatever state it
     * was in — so the board says so before asking.
     */
    reassign: async (visitId: string, agentId: string): Promise<VisitRow> =>
        shapeVisit(await live().patch<WireVisit>(`/visits/${visitId}`, { agentId })),

    /** Sets or moves the slot; null clears it so the agent picks one. */
    reschedule: async (visitId: string, scheduledFor: string | null): Promise<VisitRow> =>
        shapeVisit(await live().patch<WireVisit>(`/visits/${visitId}`, { scheduledFor })),

    /** Stops a visit. The server refuses on a completed one — that trip happened. */
    cancel: async (visitId: string): Promise<VisitRow> =>
        shapeVisit(await live().patch<WireVisit>(`/visits/${visitId}`, { status: "CANCELLED" })),
};
