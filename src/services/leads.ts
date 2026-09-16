import { api as http } from "@/lib/api-client";
import type { Tone } from "@/types";

/**
 * Leads — DR 06's desk, wired to the backend `leads` module.
 *
 * A lead is a business an agent has found and not yet turned into a publisher
 * or an advertiser. The mobile app works them from the map through
 * `GET /leads/near`; this file is the admin half — the paged `GET /leads`, and
 * the two writes the desk performs on a row.
 *
 * No fixture fallback, and none is missing: there are no lead fixtures at all.
 * Nothing seeded has ever described a lead, so the console cannot draw one it
 * did not get from the API, and cannot hand a made-up id to a real endpoint.
 *
 * Two rules the rest of this file exists to keep:
 *
 * - `estimatedCommission` is a decimal STRING or null, and stays one. It is
 *   what the agent stands to earn, null means nobody has estimated it, and the
 *   two are not the same fact. It becomes a number in exactly one place — the
 *   `formatINR` call in the table cell that prints it.
 *
 * - `pill` comes off the wire. The server owns the mapping from status to the
 *   words on a badge, and the console does not keep a second opinion about it;
 *   `pillTone` below bridges the API's four tone words onto the five the
 *   StatusBadge draws and does nothing else.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type LeadStatus = "NEW" | "CONTACTED" | "HOT" | "VISIT_BOOKED" | "CONVERTED" | "LOST";

export const LEAD_STATUSES: readonly LeadStatus[] = [
    "NEW",
    "CONTACTED",
    "HOT",
    "VISIT_BOOKED",
    "CONVERTED",
    "LOST",
];

/**
 * What to call a status in the filter.
 *
 * This is NOT the card's pill. The pill is a property of a lead and arrives
 * with it; these are the six options in a dropdown, which the server has no
 * reason to send and no endpoint to send them on. They are deliberately worded
 * as filter options — "Closed as lost", not "Lost" — so nobody mistakes the
 * Select for a second copy of the badge.
 */
const FACET_LABEL: Record<LeadStatus, string> = {
    NEW: "New",
    CONTACTED: "Contacted",
    HOT: "Hot",
    VISIT_BOOKED: "Visit booked",
    CONVERTED: "Converted",
    LOST: "Closed as lost",
};

export const leadStatusLabel = (status: LeadStatus): string => FACET_LABEL[status] ?? status;

/** Which side of the marketplace the lead would join. */
export type LeadSide = "PUBLISHER" | "ADVERTISER";

export const LEAD_SIDE_LABEL: Record<LeadSide, string> = {
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
};

/** The four tone words the API's `pill.tone` can carry. */
export type LeadPillTone = "hot" | "new" | "live" | "neutral";

/**
 * The API's tone vocabulary onto the console's.
 *
 * A translation, not a second mapping: the server still decides which tone a
 * status gets, and this only says how each of its four words is painted here.
 * `hot` becomes warning rather than danger on purpose — a hot lead is good
 * news that needs chasing today, and danger is the colour this console uses
 * for suspended and rejected things.
 */
export function pillTone(tone: LeadPillTone | string): Tone {
    switch (tone) {
        case "hot":
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
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/** A lead card exactly as `GET /leads` and `GET /leads/near` send it. */
export interface WireLead {
    id: string;
    /** Issued on create; null on a row older than the identifier formats (the server names such a lead by its id). */
    displayId: string | null;
    side: LeadSide;
    businessName: string;
    category: string | null;
    locality: string | null;
    city: string | null;
    status: LeadStatus;
    /** The badge, decided server-side. Sent on every card. */
    pill: { label: string; tone: LeadPillTone };
    /** Decimal string, or null when nobody has estimated it. Never a number. */
    estimatedCommission: string | null;
    /** Metres, and only when the caller sent a point. The desk never does. */
    distanceM: number | null;
    visitBooked: boolean;
    latitude: number | null;
    longitude: number | null;
    contactName: string | null;
    phone: string | null;
    interest: string | null;
    source: string | null;
    bestTimeFrom: string | null;
    bestTimeTo: string | null;
    firstContactedAt: string | null;
    /** null is the open pool — a lead any agent may take. */
    assignedAgentId: string | null;
}

/** One row of the desk. Identical to the wire but for the painted pill. */
export interface Lead extends Omit<WireLead, "pill"> {
    pill: { label: string; tone: Tone };
}

export function shapeLead(wire: WireLead): Lead {
    return { ...wire, pill: { label: wire.pill.label, tone: pillTone(wire.pill.tone) } };
}

/* ------------------------------------------------------------------ */
/* How the desk reads a row                                            */
/* ------------------------------------------------------------------ */

/** A lead nobody owns yet — the queue the "Unassigned only" toggle isolates. */
export const isUnassigned = (lead: Pick<Lead, "assignedAgentId">): boolean =>
    lead.assignedAgentId === null;

/**
 * Who is on it.
 *
 * The open pool is said in words rather than left as an empty cell: it is a
 * real state — DR 06 lets any agent in range take one of these — and a blank
 * reads as missing data.
 *
 * The agent's identifier rather than their name: `GET /leads` joins no agent,
 * so a name here would be one the console invented. The table resolves it
 * against the roster where it can and falls back to this.
 */
export const assignedLabel = (lead: Pick<Lead, "assignedAgentId">): string =>
    lead.assignedAgentId ?? "Open pool";

/** "Jayanagar 4th Block · Bengaluru", whichever half exists, or nothing. */
export function whereLabel(lead: Pick<Lead, "locality" | "city">): string {
    const parts = [lead.locality, lead.city].filter((part): part is string => Boolean(part?.trim()));
    return parts.length ? parts.join(" · ") : "—";
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface LeadsPage {
    items: Lead[];
    total: number;
    page: number;
    pageSize: number;
    /** How many leads sit behind each status, counted without the status facet. */
    counts: Record<string, number>;
}

/**
 * The two orders the desk can ask for.
 *
 * `NEAREST` is the API's third and is deliberately absent: it is refused
 * without a `lat`/`lng` pair, and the admin console has no point to send — the
 * person at this desk is not standing anywhere near the shop. Offering it here
 * would be an option that answers 400 every time.
 */
export type AdminLeadsSort = "NEWEST" | "ESTIMATE_DESC";

export interface AdminLeadsQuery {
    q?: string;
    status?: LeadStatus[];
    sort?: AdminLeadsSort;
    page?: number;
    pageSize?: number;
    side?: LeadSide;
    category?: string;
    city?: string;
    assignedAgentId?: string;
    /** Only leads in the open pool. Sent as `unassigned=true` or left off. */
    unassigned?: boolean;
}

/** Any field `POST /leads` accepts, plus the two only a PATCH may move. */
export interface UpdateLeadInput {
    side?: LeadSide;
    businessName?: string;
    category?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    locality?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    interest?: string | null;
    source?: string | null;
    bestTimeFrom?: string | null;
    bestTimeTo?: string | null;
    /** A decimal string on the way out too. Never a float. */
    estimatedCommission?: string | null;
    /**
     * CONVERTED is not in this type on purpose: conversion is
     * `POST /leads/:id/convert`, which needs the publisher or advertiser the
     * lead became, and the PATCH endpoint refuses the value outright.
     */
    status?: Exclude<LeadStatus, "CONVERTED">;
    /** null returns the lead to the open pool. */
    assignedAgentId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Lot D (Q56/Q93): creating, importing, converting                     */
/* ------------------------------------------------------------------ */

/** What `POST /leads` takes — `createLeadSchema`. Only keys with a value go up. */
export interface CreateLeadInput {
    side: LeadSide;
    businessName: string;
    category?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    locality?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    interest?: string;
    source?: string;
    bestTimeFrom?: string;
    bestTimeTo?: string;
    /** A decimal string; omitted, the platform quotes what it actually pays. */
    estimatedCommission?: string;
    assignedAgentId?: string;
}

/** One row of an import: a create, minus `source`, which the sheet carries once. */
export type ImportLeadRow = Omit<CreateLeadInput, "source">;

export type ImportOutcome = "CREATED" | "DUPLICATE_LEAD" | "EXISTING_ACCOUNT" | "INVALID" | "WARNING";

export const IMPORT_OUTCOME_META: Record<ImportOutcome, { label: string; tone: Tone }> = {
    CREATED: { label: "Created", tone: "success" },
    WARNING: { label: "Created with a warning", tone: "warning" },
    DUPLICATE_LEAD: { label: "Duplicate lead", tone: "neutral" },
    EXISTING_ACCOUNT: { label: "Already an account", tone: "danger" },
    INVALID: { label: "Invalid", tone: "danger" },
};

/** What became of one row. `row` is 1-based, as the sheet numbers them. */
export interface ImportRowReport {
    row: number;
    outcome: ImportOutcome;
    /** The lead or account the row collided with, or the LED- number it became. */
    ref: string | null;
    message: string;
}

export interface ImportResult {
    dryRun: boolean;
    imported: number;
    skipped: number;
    warnings: number;
    ids: string[];
    report: ImportRowReport[];
}

/** The lead with its activity, as `GET /leads/:id` returns it. */
export interface LeadDetail extends Lead {
    address: string | null;
    email: string | null;
    activity: LeadActivity[];
}

export type LeadActivityKind =
    | "IMPORTED"
    | "CALLED"
    | "MESSAGED"
    | "NOTE"
    | "VISIT_BOOKED"
    | "VISIT_DONE"
    | "STATUS_CHANGED"
    | "FOLLOW_UP";

export const LEAD_ACTIVITY_LABEL: Record<LeadActivityKind, string> = {
    IMPORTED: "Imported",
    CALLED: "Called",
    MESSAGED: "Messaged",
    NOTE: "Note",
    VISIT_BOOKED: "Visit booked",
    VISIT_DONE: "Visit done",
    STATUS_CHANGED: "Status changed",
    FOLLOW_UP: "Follow-up",
};

export interface LeadActivity {
    id: string;
    kind: LeadActivityKind;
    note: string | null;
    at: string;
}

/** The lead with its activity as the wire sends it: the card plus the two fields the list leaves off. */
type WireLeadDetail = WireLead & { address: string | null; email: string | null; activity: LeadActivity[] };

const shapeDetail = (wire: WireLeadDetail): LeadDetail => ({
    ...shapeLead(wire),
    address: wire.address,
    email: wire.email,
    activity: wire.activity ?? [],
});

/** The header names an import sheet may carry, folded to the schema's keys. */
const CSV_COLUMNS: Record<string, keyof ImportLeadRow> = {
    side: "side",
    businessname: "businessName",
    business: "businessName",
    name: "businessName",
    category: "category",
    contactname: "contactName",
    contact: "contactName",
    phone: "phone",
    mobile: "phone",
    email: "email",
    address: "address",
    locality: "locality",
    area: "locality",
    city: "city",
    latitude: "latitude",
    lat: "latitude",
    longitude: "longitude",
    lng: "longitude",
    lon: "longitude",
    interest: "interest",
    besttimefrom: "bestTimeFrom",
    besttimeto: "bestTimeTo",
    estimatedcommission: "estimatedCommission",
    estimate: "estimatedCommission",
    assignedagentid: "assignedAgentId",
    agentid: "assignedAgentId",
};

/** A row the server would refuse as a whole batch: the schema's required fields and enums. */
export interface CsvRowProblem {
    row: number;
    message: string;
}

export interface ParsedLeadCsv {
    rows: ImportLeadRow[];
    /** Problems the sheet has to fix before the API will look at it — a bad row fails the whole batch, not just itself. */
    problems: CsvRowProblem[];
    /** Header columns the sheet carried that nothing here reads. */
    ignored: string[];
}

/** RFC-4180-ish: quoted fields, doubled quotes, CRLF or LF. Blank lines are dropped. */
export function splitCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                field += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[i + 1] === "\n") i += 1;
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

/**
 * A pasted or dropped sheet into the rows `POST /leads/import` takes.
 *
 * The first line is the header. Column names are matched case-insensitively
 * with spaces and underscores dropped, so "Business name", "business_name"
 * and "businessName" are the same column. Empty cells are left off the row
 * rather than sent as "" — the schema treats an absent key and an empty
 * string differently, and refuses the latter.
 */
export function parseLeadCsv(text: string): ParsedLeadCsv {
    const lines = splitCsv(text);
    if (lines.length === 0) return { rows: [], problems: [], ignored: [] };
    const header = lines[0].map((cell) => cell.trim().toLowerCase().replace(/[\s_-]+/g, ""));
    const keys = header.map((name) => CSV_COLUMNS[name] ?? null);
    const ignored = header.filter((_, index) => keys[index] === null);
    const rows: ImportLeadRow[] = [];
    const problems: CsvRowProblem[] = [];
    lines.slice(1).forEach((cells, index) => {
        const n = index + 1;
        const row: Record<string, string | number> = {};
        keys.forEach((key, column) => {
            if (!key) return;
            const value = cells[column]?.trim();
            if (!value) return;
            if (key === "latitude" || key === "longitude") {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) {
                    problems.push({ row: n, message: `"${value}" is not a ${key}` });
                    return;
                }
                row[key] = parsed;
            } else if (key === "side") {
                row.side = value.toUpperCase();
            } else {
                row[key] = value;
            }
        });
        if (!row.businessName) problems.push({ row: n, message: "No business name" });
        if (row.side !== "PUBLISHER" && row.side !== "ADVERTISER") {
            problems.push({ row: n, message: `Side must be PUBLISHER or ADVERTISER${row.side ? `, not "${row.side}"` : ""}` });
        }
        rows.push(row as unknown as ImportLeadRow);
    });
    return { rows, problems, ignored };
}

/** `POST /leads/:id/convert` — one of the two, or neither to link the account the phone belongs to. */
export interface ConvertLeadInput {
    publisherId?: string;
    advertiserId?: string;
}

export const leadsService = {
    /**
     * The desk's page.
     *
     * The status facet goes to the API rather than being applied here, because
     * `counts` comes back computed over the whole filter *without* the status
     * in force — which a client holding one page cannot work out for itself.
     */
    list: async (query: AdminLeadsQuery = {}): Promise<LeadsPage> => {
        const params = new URLSearchParams();
        if (query.q) params.set("q", query.q);
        if (query.status?.length) params.set("status", query.status.join(","));
        if (query.sort) params.set("sort", query.sort);
        if (query.side) params.set("side", query.side);
        if (query.category) params.set("category", query.category);
        if (query.city) params.set("city", query.city);
        if (query.assignedAgentId) params.set("assignedAgentId", query.assignedAgentId);
        // Sent only when true: `unassigned=false` is a filter the API does not
        // have, and would read as a request for assigned leads only.
        if (query.unassigned) params.set("unassigned", "true");
        params.set("page", String(query.page ?? 1));
        params.set("pageSize", String(query.pageSize ?? 20));

        const page = await http.get<{
            items: WireLead[];
            total: number;
            page: number;
            pageSize: number;
            counts: Record<string, number>;
        }>(`/leads?${params.toString()}`);
        return { ...page, items: (page.items ?? []).map(shapeLead) };
    },

    /** `PATCH /leads/:id`. Answers with the lead as it now stands. */
    update: async (leadId: string, patch: UpdateLeadInput): Promise<Lead> =>
        shapeLead(await http.patch<WireLead>(`/leads/${leadId}`, patch)),

    /** Put an agent on a lead, or pass null to return it to the open pool. */
    assign: (leadId: string, agentId: string | null): Promise<Lead> =>
        leadsService.update(leadId, { assignedAgentId: agentId }),

    /**
     * The end of a lead that went nowhere. Nothing is deleted — a lost lead is
     * still the record of a shop that was approached, which is what stops the
     * next agent walking in three weeks later.
     */
    closeAsLost: (leadId: string): Promise<Lead> => leadsService.update(leadId, { status: "LOST" }),

    /* ---- Lot D (Q56/Q93) ---------------------------------------------- */

    /** `GET /leads/:id` — the card plus the address, the email and the activity. */
    get: async (leadId: string): Promise<LeadDetail> => shapeDetail(await http.get<WireLeadDetail>(`/leads/${leadId}`)),

    /**
     * `POST /leads`. A number already on a lead answers 409 with
     * `details.reason = DUPLICATE_LEAD`; one on a publisher or advertiser
     * account, `EXISTING_ACCOUNT` — an account is not a prospect.
     */
    create: async (input: CreateLeadInput): Promise<Lead> => shapeLead(await http.post<WireLead>("/leads", input)),

    /**
     * `POST /leads/import` — up to 500 rows, one transaction, a per-row
     * report. With `dryRun` the report comes back and nothing is written or
     * minted; without it, created rows carry their LED- number as `ref`.
     */
    import: (source: string, rows: ImportLeadRow[], dryRun: boolean): Promise<ImportResult> =>
        http.post<ImportResult>("/leads/import", { source, rows, dryRun }),

    /**
     * `POST /leads/:id/convert`. The lead's number is checked against both
     * account tables: with nothing named the match is linked, naming a
     * different account than the phone belongs to is 409, and with no match
     * and nothing named, 400.
     */
    convert: async (leadId: string, target: ConvertLeadInput): Promise<LeadDetail> =>
        shapeDetail(await http.post<WireLeadDetail>(`/leads/${leadId}/convert`, target)),
};
