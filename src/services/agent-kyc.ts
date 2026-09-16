import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { recordedOf, requestOf } from "./kyc";
import { kycStateOf, shapeKycStateCounts, type KycQueueState, type KycStateCounts } from "./kyc-state";
import type { KycRecorded, KycRequest, StatusMeta } from "@/types";

/**
 * An agent's KYC, recorded at ADX's desk (D4).
 *
 * Agents never self-serve — they are onboarded in person and only ever sign
 * in — so the console is where their documents are recorded, on their
 * behalf, and where the decision is made. Wired to `/agent-kyc`; there are
 * no fixtures for it, on purpose, and the screens say so when the API is off.
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): `GET /agent-kyc` lists EVERY agent
 * (no mirror column — everyone), each row with a server-derived `state`
 * (AWAITING_DOCUMENTS from the moment the profile exists), `kycId` (null
 * with no record; every record column null then), `agentId` and the agent
 * slice; `?state=` is the facet, `?q=` the search box, `meta.counts` the
 * chips. The one click is `POST /agent-kyc/:agentId/request` with no body
 * — a Digio session in the agent's name, the queue reading REQUESTED until
 * Digio answers — behind `kyc.edit`.
 */

export type AgentKycStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface WireAgentKyc {
    id: string;
    agentId: string;
    govIdType: string | null;
    govIdFrontUrl: string | null;
    govIdBackUrl: string | null;
    panNumber: string | null;
    panFrontUrl: string | null;
    panSignatureUrl: string | null;
    addressProofType: string | null;
    addressProofUrl: string | null;
    selfieUrl: string | null;
    bankProofUrl: string | null;
    status: AgentKycStatus;
    rejectionReason: string | null;
    recordedById: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedById: string | null;
    /** N3-B: the desk's ask and the recorder, the Digio columns — on the agent record since the one click. */
    requestedAt?: string | null;
    requestedById?: string | null;
    requestedChannel?: string | null;
    recordedVia?: string | null;
    method?: string | null;
    digioStatus?: string | null;
    requestedBy?: { id: string; name: string | null } | null;
    agent: { id: string; displayId: string | null; city: string | null; userId?: string; createdAt?: string | null; user: { name: string | null; mobile: string; email?: string | null } };
    /** E7-3: on the case read — the age against the review SLA and the people on it by name. */
    ageHours?: number | null;
    slaBreached?: boolean;
    slaHours?: number;
    reviewedBy?: { id: string; name: string | null } | null;
    recordedBy?: { id: string; name: string | null } | null;
}

/**
 * N3-B: a queue row is a PARTY — every agent — with its `state`, and the
 * record's columns spread over it when it has one (every column null
 * otherwise, `kycId` null). `id` is the record's id when there is one, else
 * the agent's; `agentId` is always the agent's, which every
 * `/agent-kyc/:agentId` route takes.
 */
export type WireAgentKycQueueRow = { [K in keyof Omit<WireAgentKyc, "id" | "agentId" | "agent">]: WireAgentKyc[K] | null } & {
    id: string;
    agentId: string;
    kycId: string | null;
    state?: string | null;
    agent: WireAgentKyc["agent"];
};

/** `GET /agent-kyc` — `data: rows[]`, `meta { page, pageSize, total, totalPages, counts }`. */
export interface WireAgentKycMeta {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
    counts?: Record<string, number | undefined>;
}

/** The document slots the desk records, in the order the sheet asks for them. */
export const AGENT_KYC_SLOTS = [
    { key: "govIdFrontUrl", label: "Government ID · front" },
    { key: "govIdBackUrl", label: "Government ID · back" },
    { key: "panFrontUrl", label: "PAN card" },
    { key: "panSignatureUrl", label: "PAN signature" },
    { key: "addressProofUrl", label: "Address proof" },
    { key: "selfieUrl", label: "Live selfie" },
    { key: "bankProofUrl", label: "Bank proof (cancelled cheque or passbook)" },
] as const;

export type AgentKycSlot = (typeof AGENT_KYC_SLOTS)[number]["key"];

export interface AgentKycDocuments {
    govIdType?: "AADHAAR" | "PASSPORT" | "DRIVING_LICENCE";
    govIdFrontUrl?: string;
    govIdBackUrl?: string;
    panNumber?: string;
    panFrontUrl?: string;
    panSignatureUrl?: string;
    addressProofType?: "UTILITY_BILL" | "RENT_AGREEMENT" | "BANK_STATEMENT";
    addressProofUrl?: string;
    selfieUrl?: string;
    bankProofUrl?: string;
}

export interface AgentKycCase {
    agentId: string;
    agentName: string;
    displayId: string | null;
    city: string | null;
    mobile: string;
    status: AgentKycStatus;
    submittedAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
    /** E7-3: who recorded it and who decided, by name; null where nobody has. */
    recordedBy: { id: string; name: string | null } | null;
    reviewedBy: { id: string; name: string | null } | null;
    /** E7-3: hours waiting while PENDING, against the review SLA; null once decided or on a list row. */
    ageHours: number | null;
    slaBreached: boolean;
    slaHours: number | null;
    /** How many of the seven slots hold a document. */
    documents: number;
    /** Everything recorded, for the form to start from. */
    recorded: AgentKycDocuments;
}

/** A queue row as the tab draws it — the agent, their state, and what the record holds when there is one. */
export interface AgentKycQueueRow {
    /** The record's id, else the agent's. */
    id: string;
    agentId: string;
    kycId: string | null;
    state: KycQueueState;
    agentName: string;
    displayId: string | null;
    city: string | null;
    mobile: string;
    email: string | null;
    /** The agent's sign-in account — every agent has one. Null on a read older than N3-B. */
    userId: string | null;
    /** When the agent arrived — the order the awaiting rows sort by. */
    createdAt: string | null;
    /** The record's status; null while there is no record. */
    status: AgentKycStatus | null;
    /** Formatted, "—" with nothing submitted. */
    submittedAt: string;
    method: "MANUAL" | "DIGIO" | null;
    /** How many of the seven slots hold a document. */
    documents: number;
    request: KycRequest | null;
    recorded: KycRecorded | null;
}

export interface AgentKycQueue {
    rows: AgentKycQueueRow[];
    total: number;
    counts: KycStateCounts;
}

export interface AgentKycFilter {
    state?: KycQueueState;
    /** The legacy facet — an alias of `state`. */
    status?: AgentKycStatus;
    /** The agent's name, display id or mobile. */
    q?: string;
}

export function buildAgentKycQuery(filter: AgentKycFilter = {}): string {
    const params = new URLSearchParams({ pageSize: "100" });
    if (filter.state) params.set("state", filter.state);
    if (filter.status) params.set("status", filter.status);
    if (filter.q?.trim()) params.set("q", filter.q.trim());
    return params.toString();
}

export const AGENT_KYC_STATUS_META: Record<AgentKycStatus, StatusMeta> = {
    PENDING: { label: "Awaiting review", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

const orUndefined = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

export function shapeAgentKyc(row: WireAgentKyc): AgentKycCase {
    const recorded: AgentKycDocuments = {
        govIdType: orUndefined(row.govIdType) as AgentKycDocuments["govIdType"],
        govIdFrontUrl: orUndefined(row.govIdFrontUrl),
        govIdBackUrl: orUndefined(row.govIdBackUrl),
        panNumber: orUndefined(row.panNumber),
        panFrontUrl: orUndefined(row.panFrontUrl),
        panSignatureUrl: orUndefined(row.panSignatureUrl),
        addressProofType: orUndefined(row.addressProofType) as AgentKycDocuments["addressProofType"],
        addressProofUrl: orUndefined(row.addressProofUrl),
        selfieUrl: orUndefined(row.selfieUrl),
        bankProofUrl: orUndefined(row.bankProofUrl),
    };
    return {
        agentId: row.agentId,
        agentName: row.agent.user.name ?? row.agent.user.mobile,
        displayId: row.agent.displayId,
        city: row.agent.city,
        mobile: row.agent.user.mobile,
        status: row.status,
        submittedAt: row.submittedAt ? formatDateTime(row.submittedAt) : "—",
        reviewedAt: row.reviewedAt ? formatDateTime(row.reviewedAt) : null,
        rejectionReason: row.rejectionReason,
        recordedBy: row.recordedBy ?? (row.recordedById ? { id: row.recordedById, name: null } : null),
        reviewedBy: row.reviewedBy ?? (row.reviewedById ? { id: row.reviewedById, name: null } : null),
        ageHours: row.ageHours ?? null,
        slaBreached: row.slaBreached ?? false,
        slaHours: row.slaHours ?? null,
        documents: AGENT_KYC_SLOTS.filter((slot) => Boolean(row[slot.key])).length,
        recorded,
    };
}

export function shapeAgentKycQueueRow(row: WireAgentKycQueueRow): AgentKycQueueRow {
    const hasRecord = Boolean(row.kycId ?? row.status);
    const record = hasRecord && row.status ? { status: row.status, submittedAt: row.submittedAt, requestedAt: row.requestedAt ?? null } : null;
    return {
        id: row.id,
        agentId: row.agentId,
        kycId: row.kycId ?? (hasRecord ? row.id : null),
        state: kycStateOf(row, record),
        agentName: row.agent.user.name ?? row.agent.user.mobile,
        displayId: row.agent.displayId,
        city: row.agent.city,
        mobile: row.agent.user.mobile,
        email: row.agent.user.email ?? null,
        userId: row.agent.userId ?? null,
        createdAt: row.agent.createdAt ?? null,
        status: row.status,
        submittedAt: row.submittedAt ? formatDateTime(row.submittedAt) : "—",
        method: row.method === "DIGIO" ? "DIGIO" : row.method === "MANUAL" ? "MANUAL" : null,
        documents: AGENT_KYC_SLOTS.filter((slot) => Boolean(row[slot.key])).length,
        request: requestOf(row, row),
        recorded: recordedOf(row, row),
    };
}

/** Only the fields that hold a value go on the wire; the API takes each as optional. */
export function documentsBody(docs: AgentKycDocuments): AgentKycDocuments {
    return Object.fromEntries(
        Object.entries(docs).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ) as AgentKycDocuments;
}

function mutable() {
    if (!isLive("kyc")) {
        throw new Error("The KYC domain still reads fixtures; wire it to the API before writing.");
    }
    return http;
}

export const agentKycService = {
    /** N3-B: every agent, in one of six states — `data` the rows, `meta.counts` the chips (counted with the state facet removed). */
    queue: async (filter: AgentKycFilter = {}): Promise<AgentKycQueue> => {
        if (!isLive("kyc")) return { rows: [], total: 0, counts: shapeKycStateCounts(null) };
        const page = await http.getEnvelope<WireAgentKycQueueRow[], { meta?: WireAgentKycMeta }>(`/agent-kyc?${buildAgentKycQuery(filter)}`);
        const rows = (page.data ?? []).map(shapeAgentKycQueueRow);
        return { rows, total: page.meta?.total ?? rows.length, counts: shapeKycStateCounts(page.meta?.counts) };
    },

    /** The rows alone, for the screens that only need them. */
    list: async (status?: AgentKycStatus): Promise<AgentKycQueueRow[]> => (await agentKycService.queue(status ? { status } : {})).rows,

    /** The agent's record, or null when nothing has been recorded yet. */
    get: async (agentId: string): Promise<AgentKycCase | null> => {
        if (!isLive("kyc")) return null;
        try {
            return shapeAgentKyc(await http.get<WireAgentKyc>(`/agent-kyc/${agentId}`));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** On behalf: what the desk was shown. An upsert; the record goes (back) to PENDING. */
    record: async (agentId: string, docs: AgentKycDocuments): Promise<AgentKycCase> =>
        shapeAgentKyc(await mutable().put<WireAgentKyc>(`/agent-kyc/${agentId}`, documentsBody(docs))),

    review: async (agentId: string, status: "VERIFIED" | "REJECTED", rejectionReason?: string): Promise<AgentKycCase> =>
        shapeAgentKyc(
            await mutable().patch<WireAgentKyc>(`/agent-kyc/${agentId}/review`, {
                status,
                ...(rejectionReason ? { rejectionReason } : {}),
            })
        ),

    /** N3-C: the one click — `POST /agent-kyc/:agentId/request` with no body; the server opens a Digio session in the agent's name. Behind `kyc.edit`. 409 `KYC_ALREADY_VERIFIED`. */
    requestDigio: (agentId: string) =>
        mutable().post<{ kyc: WireAgentKyc; digio: { kycId: string; validTill: string } | null; notified: boolean }>(`/agent-kyc/${agentId}/request`),

    /** N3-C: the ask by hand — `{ channel, note? }`; MANUAL only tells the agent to upload, DIGIO is the one click with a note. */
    request: (agentId: string, channel: "DIGIO" | "MANUAL", note?: string) => {
        const trimmed = note?.trim();
        return mutable().post<{ kyc: WireAgentKyc; digio: { kycId: string; validTill: string } | null; notified: boolean }>(
            `/agent-kyc/${agentId}/request`,
            trimmed ? { channel, note: trimmed } : { channel }
        );
    },
};
