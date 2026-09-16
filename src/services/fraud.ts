import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { SCOPES_BY_PARTY, type SuspensionPartyType, type SuspensionScope } from "@/services/suspension";
import type { StatusMeta } from "@/types";

/**
 * Fraud cases — Lot D (Q54/Q92/Q121), wired to the backend `fraud` module.
 *
 * A case is a record: a subject (one of the four parties `suspension`
 * knows), a kind, a summary, the notes and evidence gathered while it is
 * worked, and a decision. The decision is the only thing that touches the
 * party, and it does so through the suspension module — CONFIRMED applies
 * scopes with the case number as the reason (BLOCK_NEW + FREEZE_WALLET by
 * default), DISMISSED lifts exactly what this case applied.
 *
 * The seeded `FR-*` cases are gone rather than kept: their fraud score, link
 * graph, shared signals and value at risk were fields no `FraudCase` had,
 * and their statuses ("escalated to legal", "accounts suspended") named
 * moves the backend never had. With the API off the desk says so.
 *
 * Lot G (Q118/138, package CG2) gave the case what the frame drew: an
 * explainable score over thirteen signals (`POST …/score`, stored on the
 * row), the accounts those signals tie the party to (`GET …/linked`,
 * computed now), an escalation with a note and a named admin
 * (`POST …/escalate` → ESCALATED, a working status), and a scan over a
 * party with no case (`POST /fraud/scan/:type/:id`, stored nowhere). The
 * shaping for the signals card and the link graph lives here so the tests
 * pin it without a DOM.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type FraudCaseStatus = "OPEN" | "INVESTIGATING" | "ESCALATED" | "CONFIRMED" | "DISMISSED";

export const FRAUD_CASE_STATUSES: readonly FraudCaseStatus[] = ["OPEN", "INVESTIGATING", "ESCALATED", "CONFIRMED", "DISMISSED"];

export const FRAUD_CASE_STATUS_META: Record<FraudCaseStatus, StatusMeta> = {
    OPEN: { label: "Open", tone: "warning" },
    INVESTIGATING: { label: "Investigating", tone: "info" },
    /** Lot G (Q118): handed up with a note — still open; notes, evidence and the decision continue. */
    ESCALATED: { label: "Escalated to legal", tone: "danger" },
    CONFIRMED: { label: "Confirmed — suspended", tone: "danger" },
    DISMISSED: { label: "Dismissed", tone: "neutral" },
};

/** OPEN, INVESTIGATING or ESCALATED — the backend's own definition of "open" for the scan and the dispute link. */
export const OPEN_FRAUD_STATUSES: readonly FraudCaseStatus[] = ["OPEN", "INVESTIGATING", "ESCALATED"];

/** The subject is one of the four parties a suspension can land on. */
export type FraudSubjectType = SuspensionPartyType;

export const FRAUD_SUBJECT_TYPES: readonly FraudSubjectType[] = ["LISTING", "PUBLISHER", "ADVERTISER", "AGENT"];

/** Where the subject's own page is. */
export const SUBJECT_PATH: Record<FraudSubjectType, string> = {
    LISTING: "/listings",
    PUBLISHER: "/publishers",
    ADVERTISER: "/advertisers",
    AGENT: "/agents",
};

export const subjectHref = (subjectType: FraudSubjectType, subjectId: string): string =>
    `${SUBJECT_PATH[subjectType]}/${encodeURIComponent(subjectId)}`;

/** Decision 121: the wallet freeze is the FREEZE_WALLET scope; a confirmed case blocks new work and freezes the money by default. */
export const DEFAULT_CONFIRMED_SCOPES: readonly SuspensionScope[] = ["BLOCK_NEW", "FREEZE_WALLET"];

/**
 * Which scopes a confirmation may apply to this subject: the suspend
 * dialog's own per-party table, so a listing is never offered a wallet
 * freeze, and the default pair narrowed the same way.
 */
export const confirmableScopes = (subjectType: FraudSubjectType): SuspensionScope[] =>
    [...SCOPES_BY_PARTY[subjectType]];

export const defaultScopesFor = (subjectType: FraudSubjectType): SuspensionScope[] =>
    DEFAULT_CONFIRMED_SCOPES.filter((scope) => SCOPES_BY_PARTY[subjectType].includes(scope));

/** The bounds the schemas put on the free text. */
export const FRAUD_KIND_MIN = 2;
export const FRAUD_SUMMARY_MIN = 10;
export const FRAUD_DECISION_MIN = 3;

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Signals — Lot G (Q118/138)                                          */
/* ------------------------------------------------------------------ */

/** The party types a shared signal can link — a listing resolves to its publisher before evaluation. */
export type LinkedPartyType = "PUBLISHER" | "ADVERTISER" | "AGENT";

export interface LinkedParty {
    type: LinkedPartyType;
    id: string;
    name: string | null;
}

/**
 * One stored signal on `FraudCase.signals` (and one row of a scan): a fixed
 * key, its weight, a value 0..1 (null when it could not be computed here —
 * the photo hash without a decoder), one line of detail, and the accounts
 * it tied the subject to.
 */
export interface FraudSignal {
    key: string;
    weight: number;
    value: number | null;
    detail: string;
    links?: LinkedParty[];
    /** G13-B: the parties the signal compared against, matched or not — at most 20 per signal. */
    candidates?: LinkedParty[];
}

/** What the desk calls each signal key. An unknown key (a signal added since) prints as itself. */
export const SIGNAL_LABEL: Record<string, string> = {
    SHARED_PAN: "PAN number",
    SHARED_BANK: "Payout account",
    SHARED_IP_SUBNET: "IP subnet",
    SHARED_PHONE_ACROSS_ROLES: "Mobile across roles",
    SHARED_DEVICE: "Device fingerprint",
    BANK_NAME_MISMATCH: "Payout account in another name",
    DUPLICATE_LISTING_PHOTOS: "Duplicate listing photos",
    PROOF_FAR_FROM_SITE: "Installation proofs far from site",
    SELF_DEALING: "Self-dealing",
    COMMISSION_FARMING: "Commission farming",
    REFUND_DISPUTE_RATE: "Refund and dispute rate",
    WITHDRAW_AFTER_CREDIT: "Withdrawal straight after credit",
    LISTING_VELOCITY: "Listing velocity",
};

export const signalLabel = (key: string): string => SIGNAL_LABEL[key] ?? key;

/** One row of the SHARED SIGNALS card. */
export interface SignalRow {
    key: string;
    label: string;
    weight: number;
    /** Null when the signal could not be computed — shown, adds nothing. */
    value: number | null;
    /** `weight × value`, what this signal put on the score; 0 while null. */
    contribution: number;
    detail: string;
    /** The distinct accounts this signal tied the subject to. */
    links: LinkedParty[];
}

/**
 * The SHARED SIGNALS card: every signal that is present — a value above
 * zero, or null (the platform could not compute it and says so) — with its
 * weight, value, detail and the accounts it names, strongest first. A
 * signal that read 0 is absent and is not listed: the card says what was
 * found, not what was looked for.
 */
export function shapeSignals(signals: readonly FraudSignal[] | null | undefined): SignalRow[] {
    if (!signals) return [];
    return signals
        .filter((signal) => signal.value === null || signal.value > 0)
        .map((signal) => ({
            key: signal.key,
            label: signalLabel(signal.key),
            weight: signal.weight,
            value: signal.value,
            contribution: signal.value === null ? 0 : Math.round(signal.weight * signal.value * 1000) / 1000,
            detail: signal.detail,
            links: dedupeParties(signal.links ?? []),
        }))
        .sort((a, b) => b.contribution - a.contribution || (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0));
}

const partyKey = (party: { type: string; id: string }) => `${party.type}:${party.id}`;

function dedupeParties(parties: readonly LinkedParty[]): LinkedParty[] {
    const seen = new Map<string, LinkedParty>();
    for (const party of parties) if (!seen.has(partyKey(party))) seen.set(partyKey(party), party);
    return [...seen.values()];
}

/** The distinct accounts the stored signals name — what a queue row prints as "N accounts" without the linked read. */
export function linkedPartiesOf(signals: readonly FraudSignal[] | null | undefined): LinkedParty[] {
    return dedupeParties((signals ?? []).flatMap((signal) => signal.links ?? []));
}

/** "0.912" → "0.91"; null → null. The column is DECIMAL(4,3); the frame prints two places. */
export function formatScore(score: string | null | undefined): string | null {
    if (score === null || score === undefined) return null;
    const value = Number(score);
    return Number.isFinite(value) ? value.toFixed(2) : null;
}

/* ------------------------------------------------------------------ */
/* Linked accounts and the graph                                       */
/* ------------------------------------------------------------------ */

/** The subject as the scan and the linked read summarise it — never the PAN itself. */
export interface SubjectSummary {
    type: LinkedPartyType;
    id: string;
    name: string | null;
    kycStatus: string | null;
    /** A LISTING subject keeps the listing it came from. */
    listingId: string | null;
}

/**
 * One account the shared signals tie the subject to, every signal that does
 * so, and (G11-1) what is at stake on it: its wallet balance as money (null
 * when it holds no wallet) and how many of its orders are still open.
 */
export interface LinkedAccount {
    party: LinkedParty;
    via: string[];
    walletBalance: string | null;
    openBookings: number;
}

/**
 * `GET /fraud/cases/:id/linked` — computed now, most-linked first. G11-1:
 * `valueAtRisk` is every linked wallet's balance plus every linked open
 * order's value, as money — the accounts around the case, never the
 * subject's own figures.
 */
export interface LinkedAccountsRead {
    subject: SubjectSummary;
    linked: LinkedAccount[];
    /**
     * G13-B: the parties the last scoring compared the subject against
     * without a link — the graph's "Clean" nodes — the subject and anything
     * linked now taken out; `[]` on a case never scored. Absent from a
     * server one release behind.
     */
    evaluated?: { party: LinkedParty; linked: false }[];
    valueAtRisk: string;
    computedAt: string;
}

export interface GraphNode {
    key: string;
    type: LinkedPartyType;
    id: string;
    name: string | null;
    /** Two letters for the circle. */
    initials: string;
    x: number;
    y: number;
    subject: boolean;
    /** G13-B: evaluated and found unlinked — drawn in the band under the ring, with no edge. */
    clean: boolean;
    /** G11-1: the node card's figures — null on the subject, whose exposure the read does not carry. */
    walletBalance: string | null;
    openBookings: number | null;
}

export interface GraphEdge {
    from: string;
    to: string;
    /** The signal keys, as labels, joined for the edge's caption. */
    label: string;
    /** The midpoint, where the caption sits. */
    x: number;
    y: number;
}

export interface GraphLayout {
    width: number;
    height: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export function partyInitials(name: string | null, fallback: string): string {
    const source = (name ?? "").trim();
    if (!source) return fallback.slice(0, 2).toUpperCase();
    const words = source.split(/\s+/).filter(Boolean);
    const letters = words.length >= 2 ? words[0][0] + words[1][0] : source.slice(0, 2);
    return letters.toUpperCase();
}

/** The band under the ring where the clean nodes sit (G13-B); the layout grows by this much when there are any. */
export const CLEAN_BAND_HEIGHT = 72;

/**
 * The link graph's layout: the subject at the centre, the linked accounts
 * on a ring around it in the order the read gave them (most-linked first,
 * starting at twelve o'clock), one edge per linked account captioned with
 * the signals that tie it. G13-B: the parties evaluated and found unlinked
 * (`evaluated`) are the frame's "Clean" nodes — a row in a band under the
 * ring, evenly spaced, with no edge to the subject, and the layout's
 * height grows by the band. The ring itself does not move for them. Pure
 * geometry — the view draws it as SVG with no library — so the test can
 * pin where things land.
 */
export function linkedGraphLayout(
    read: Pick<LinkedAccountsRead, "subject" | "linked" | "evaluated">,
    size: { width: number; height: number } = { width: 640, height: 360 }
): GraphLayout {
    const { width, height } = size;
    const cx = width / 2;
    const cy = height / 2;
    const subjectKey = partyKey(read.subject);
    const nodes: GraphNode[] = [
        {
            key: subjectKey,
            type: read.subject.type,
            id: read.subject.id,
            name: read.subject.name,
            initials: partyInitials(read.subject.name, read.subject.id),
            x: cx,
            y: cy,
            subject: true,
            clean: false,
            walletBalance: null,
            openBookings: null,
        },
    ];
    const edges: GraphEdge[] = [];
    const count = read.linked.length;
    /* Leave room for the caption under each circle and the edge label. */
    const radius = Math.max(60, Math.min(width, height) / 2 - 48);
    read.linked.forEach((account, index) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(count, 1);
        const x = Math.round(cx + radius * Math.cos(angle));
        const y = Math.round(cy + radius * Math.sin(angle));
        const key = partyKey(account.party);
        nodes.push({
            key,
            type: account.party.type,
            id: account.party.id,
            name: account.party.name,
            initials: partyInitials(account.party.name, account.party.id),
            x,
            y,
            subject: false,
            clean: false,
            walletBalance: account.walletBalance ?? null,
            openBookings: account.openBookings ?? null,
        });
        edges.push({
            from: subjectKey,
            to: key,
            label: account.via.map(signalLabel).join(" · "),
            x: Math.round((cx + x) / 2),
            y: Math.round((cy + y) / 2),
        });
    });
    /* G13-B: the clean nodes, in a band under the ring — the subject and anything linked now are already out of the read. */
    const seen = new Set(nodes.map((node) => node.key));
    const clean = (read.evaluated ?? []).map((row) => row.party).filter((party) => !seen.has(partyKey(party)));
    if (clean.length === 0) return { width, height, nodes, edges };
    const bandY = height + CLEAN_BAND_HEIGHT / 2 - 8;
    clean.forEach((party, index) => {
        nodes.push({
            key: partyKey(party),
            type: party.type,
            id: party.id,
            name: party.name,
            initials: partyInitials(party.name, party.id),
            x: Math.round((width * (index + 1)) / (clean.length + 1)),
            y: bandY,
            subject: false,
            clean: true,
            walletBalance: null,
            openBookings: null,
        });
    });
    return { width, height: height + CLEAN_BAND_HEIGHT, nodes, edges };
}

/* ------------------------------------------------------------------ */
/* The scan                                                            */
/* ------------------------------------------------------------------ */

/** `POST /fraud/scan/:subjectType/:subjectId` — the signals over a party, stored nowhere. */
export interface ScanResult {
    subject: SubjectSummary;
    score: string;
    signals: FraudSignal[];
    scoredAt: string;
    /** The case already open against the party, if any — the desk links to it rather than opening a second. */
    openCase: { id: string; displayId: string | null; status: FraudCaseStatus } | null;
}

/** `?scan=PUBLISHER:cuid` — how a party page hands the desk a subject to scan on arrival. */
export function scanParam(subjectType: FraudSubjectType, subjectId: string): string {
    return `${subjectType}:${subjectId}`;
}

export function parseScanParam(value: string | null): { subjectType: FraudSubjectType; subjectId: string } | null {
    if (!value) return null;
    const [type, ...rest] = value.split(":");
    const subjectId = rest.join(":").trim();
    if (!subjectId || !FRAUD_SUBJECT_TYPES.includes(type as FraudSubjectType)) return null;
    return { subjectType: type as FraudSubjectType, subjectId };
}

/** G11-1: a person on the case as the reads name them — the id, and the name when the label lookup found one. */
export interface CasePerson {
    id: string;
    name: string | null;
}

/**
 * A person as the desk prints them: the read's name, else the id — and the
 * given word for nobody. A write answers the row without the names, so the
 * id column stands in until the desk re-reads.
 */
export function casePersonLabel(person: CasePerson | null | undefined, id: string | null, nobody = "Nobody yet"): string {
    if (person) return person.name?.trim() || person.id;
    return id ?? nobody;
}

/** One `FraudCase` row, as the list and every write answer. */
export interface FraudCase {
    id: string;
    /** FRD-26-0001, minted per Indian calendar year. Null only on rows older than the column. */
    displayId: string | null;
    subjectType: FraudSubjectType;
    subjectId: string;
    kind: string;
    status: FraudCaseStatus;
    summary: string;
    openedByUserId: string;
    assignedToUserId: string | null;
    disputeId: string | null;
    decision: string | null;
    decidedByUserId: string | null;
    decidedAt: string | null;
    /** Lot G (Q118/138): the explainable score 0–1 as a decimal string, the signals behind it, and when. Null until scored. */
    score: string | null;
    signals: FraudSignal[] | null;
    scoredAt: string | null;
    /** Lot G (Q118): set by `/escalate` — the named admin, else the investigator, else nobody. */
    escalatedAt: string | null;
    escalatedToUserId: string | null;
    escalationNote: string | null;
    createdAt: string;
    updatedAt: string;
    /**
     * G11-1: the four people by name beside the `*UserId` columns, on every
     * list row and the case read (one label lookup per read; a failed lookup
     * leaves the names null, never the row). A write answers without them.
     */
    openedBy?: CasePerson | null;
    assignedTo?: CasePerson | null;
    decidedBy?: CasePerson | null;
    escalatedTo?: CasePerson | null;
}

export interface FraudNote {
    id: string;
    caseId: string;
    byUserId: string;
    body: string;
    createdAt: string;
}

export interface FraudEvidence {
    id: string;
    caseId: string;
    kind: string;
    /** A private upload, read through `GET /files/:id` with the bearer token. */
    fileId: string | null;
    url: string | null;
    note: string | null;
    addedByUserId: string;
    createdAt: string;
}

/** Where the subject stands today, from the suspension module. Null when the party no longer resolves. */
export interface SubjectStanding {
    name: string | null;
    scopes: SuspensionScope[];
    suspendedAt: string | null;
    suspensionReason: string | null;
    suspendedById: string | null;
}

/** `GET /fraud/cases/:id` — the file. */
export interface FraudCaseFile extends FraudCase {
    notes: FraudNote[];
    evidence: FraudEvidence[];
    suspension: SubjectStanding | null;
}

/** What `/decide` answers: the row, plus what the decision did to the party. */
export interface FraudDecision extends FraudCase {
    scopesApplied: SuspensionScope[];
    scopesLifted: SuspensionScope[];
}

export interface FraudCasesPage {
    items: FraudCase[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted without the status facet in force. */
    counts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Queries and inputs                                                  */
/* ------------------------------------------------------------------ */

/** `?q=&status=&sort=&page=&pageSize=` plus `subjectType`, `subjectId`, `disputeId` — the list contract. */
export interface FraudCasesQuery {
    q?: string;
    status?: FraudCaseStatus[];
    sort?: "NEWEST" | "OLDEST";
    page?: number;
    pageSize?: number;
    subjectType?: FraudSubjectType;
    subjectId?: string;
    disputeId?: string;
}

export function fraudCasesPath(query: FraudCasesQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status?.length) params.set("status", query.status.join(","));
    params.set("sort", query.sort ?? "NEWEST");
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    if (query.subjectType) params.set("subjectType", query.subjectType);
    if (query.subjectId) params.set("subjectId", query.subjectId);
    if (query.disputeId) params.set("disputeId", query.disputeId);
    return `/fraud/cases?${params.toString()}`;
}

export interface OpenCaseInput {
    subjectType: FraudSubjectType;
    subjectId: string;
    kind: string;
    summary: string;
    disputeId?: string;
    assignedToUserId?: string;
}

/** At least one of the three: a private upload, a link, or a note. */
export interface AddEvidenceInput {
    kind: string;
    fileId?: string;
    url?: string;
    note?: string;
}

export interface DecideInput {
    status: "CONFIRMED" | "DISMISSED";
    decision: string;
    /** CONFIRMED only. Omitted, the default pair applies. */
    scopes?: SuspensionScope[];
}

/** Working the case: INVESTIGATING, and who is on it. A decision goes through `decide`. */
export interface PatchCaseInput {
    status?: "INVESTIGATING";
    assignedToUserId?: string | null;
}

/** `{ note, toUserId? }` — the schema wants at least three characters of the note. */
export interface EscalateInput {
    note: string;
    toUserId?: string;
}

export const FRAUD_ESCALATION_NOTE_MIN = 3;

export const isDecided = (status: FraudCaseStatus): boolean => status === "CONFIRMED" || status === "DISMISSED";

/** "4 accounts share a PAN" → the kind, then the summary's first line — what the queue row prints. */
export function caseTitle(fraudCase: Pick<FraudCase, "kind" | "summary">): string {
    const line = fraudCase.summary.split(/\r?\n/).find((part) => part.trim())?.trim() ?? fraudCase.summary;
    return line.length > 90 ? `${line.slice(0, 89).trimEnd()}…` : line;
}

function live() {
    if (!isLive("fraud")) {
        throw new Error("Fraud cases read the API. Set NEXT_PUBLIC_USE_API=true to work the desk.");
    }
    return http;
}

export const fraudService = {
    /** The desk, on the list contract, with a count per status chip. */
    list: (query: FraudCasesQuery = {}): Promise<FraudCasesPage> => live().get<FraudCasesPage>(fraudCasesPath(query)),

    /** The file: the case, its notes, its evidence, and where the subject stands today. */
    get: (caseId: string): Promise<FraudCaseFile> => live().get<FraudCaseFile>(`/fraud/cases/${caseId}`),

    /** Opens one against a party that exists (the suspension read is the existence check). `FRAUD_CASE_OPENED`. */
    open: (input: OpenCaseInput): Promise<FraudCase> => live().post<FraudCase>("/fraud/cases", input),

    /** `FRAUD_CASE_NOTE_ADDED`. Refused once the case is decided. */
    addNote: (caseId: string, body: string): Promise<FraudNote> =>
        live().post<FraudNote>(`/fraud/cases/${caseId}/notes`, { body }),

    /** `FRAUD_CASE_EVIDENCE_ADDED`. Refused once the case is decided. */
    addEvidence: (caseId: string, input: AddEvidenceInput): Promise<FraudEvidence> =>
        live().post<FraudEvidence>(`/fraud/cases/${caseId}/evidence`, input),

    /** `FRAUD_CASE_UPDATED` with the columns that moved. */
    patch: (caseId: string, input: PatchCaseInput): Promise<FraudCase> =>
        live().patch<FraudCase>(`/fraud/cases/${caseId}`, input),

    /** `FRAUD_CASE_DECIDED`, carrying `scopesApplied` / `scopesLifted`. Decided once in each direction. */
    decide: (caseId: string, input: DecideInput): Promise<FraudDecision> =>
        live().post<FraudDecision>(`/fraud/cases/${caseId}/decide`, input),

    /** Lot G: the signals recomputed over the party and stored on the case. `FRAUD_CASE_SCORED`. 409 on a decided case. */
    score: (caseId: string): Promise<FraudCase> => live().post<FraudCase>(`/fraud/cases/${caseId}/score`, {}),

    /** Lot G: the accounts the shared signals tie the party to, computed now. Only the linking signals are evaluated. */
    linked: (caseId: string): Promise<LinkedAccountsRead> => live().get<LinkedAccountsRead>(`/fraud/cases/${caseId}/linked`),

    /** Lot G: ESCALATED with a note, to a named admin or the investigator; they are told. `FRAUD_CASE_ESCALATED`. 409 when already escalated or decided. */
    escalate: (caseId: string, input: EscalateInput): Promise<FraudCase> =>
        live().post<FraudCase>(`/fraud/cases/${caseId}/escalate`, input),

    /** Lot G: the signals over a party with no case — stored nowhere, audited `FRAUD_SUBJECT_SCANNED`. 404 on a party that does not exist. */
    scan: (subjectType: FraudSubjectType, subjectId: string): Promise<ScanResult> =>
        live().post<ScanResult>(`/fraud/scan/${subjectType}/${encodeURIComponent(subjectId)}`, {}),
};
