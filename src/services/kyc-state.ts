import { KYC_QUEUE_STATES, KYC_STATE_META, type KycQueueState, type KycSummary, type StatusMeta, type WireKycSummary } from "@/types";

/**
 * The KYC state of a PARTY — N3-C, the console half of N3-B (the owner,
 * 14 Sep 2026): "the moment a user creates an account or gets an account
 * at ADX, their KYC automatically becomes pending, hence they should be
 * automatically appearing in the KYC queue in their respective section."
 *
 * The five queues (`GET /publishers/kyc-queue`, `/advertiser-kyc`,
 * `/print-partner-kyc`, `/agent-kyc`, `/employee-kyc`) list parties, not
 * records, and every row carries a `state` the server derives with one
 * function (`shared/kyc-state.deriveKycState`). The five party reads carry
 * the same six facts as `kyc: { state, kycId, submittedAt, requestedAt,
 * requestedChannel, method }`, so a party's page and its queue row never
 * disagree. This file is the console's one vocabulary for that state: the
 * chips (with `?state=` in the URL), what each chip sends, the header line,
 * and which actions a row in each state offers. The six words and their
 * pills live in `types/kyc-state`, re-exported here.
 */

export { KYC_QUEUE_STATES, KYC_STATE_META, type KycQueueState, type KycSummary, type WireKycSummary };

/** The meta for a state the enum may grow after this file was written — never a crash on a pill. */
export function kycStateMeta(state: string): StatusMeta {
    return (KYC_STATE_META as Partial<Record<string, StatusMeta>>)[state] ?? { label: state.charAt(0) + state.slice(1).toLowerCase().replace(/_/g, " "), tone: "neutral" };
}

/** The chips on every KYC tab: the six states, and Escalated — a flag across states, `?escalated=true`. */
export type KycStateChip = "all" | KycQueueState | "ESCALATED";

export const KYC_STATE_CHIPS: readonly KycStateChip[] = ["all", ...KYC_QUEUE_STATES, "ESCALATED"];

/**
 * The old chips and status words, folded onto the state they name, so a
 * bookmarked `?state=awaiting_review` or `?status=needs_info` still lands on
 * the same rows. Anything unknown is "all".
 */
const CHIP_ALIASES: Record<string, KycStateChip> = {
    all: "all",
    awaiting_documents: "AWAITING_DOCUMENTS",
    awaiting: "AWAITING_DOCUMENTS",
    requested: "REQUESTED",
    pending: "PENDING",
    awaiting_review: "PENDING",
    under_review: "PENDING",
    needs_info: "NEEDS_INFO",
    rejected: "REJECTED",
    verified: "VERIFIED",
    approved: "VERIFIED",
    escalated: "ESCALATED",
};

export function stateChipFromQuery(raw: string | null | undefined): KycStateChip {
    if (!raw) return "all";
    return CHIP_ALIASES[raw.trim().toLowerCase()] ?? "all";
}

/** What goes in the URL for a chip — nothing for "all", so the plain path stays the plain queue. */
export function stateChipQuery(chip: KycStateChip): string | null {
    return chip === "all" ? null : chip.toLowerCase();
}

/** What a chip sends: `?state=` for a state, `?escalated=true` for the flag, nothing for all. */
export function kycStateFilter(chip: KycStateChip): { state?: KycQueueState; escalated?: true } {
    if (chip === "all") return {};
    if (chip === "ESCALATED") return { escalated: true };
    return { state: chip };
}

/** The six state counts a queue answers as `counts`, with `escalated` and `requested` beside them — each counted with the state facet removed. */
export type KycStateCounts = Record<KycQueueState, number> & { escalated: number; requested: number };

/**
 * `counts` off the wire, every state filled in. The server sends the six
 * states (plus `awaitingDocuments` camel-cased), `escalated` and
 * `requested`; a server one release behind sends only the record statuses,
 * and the missing ones read 0 rather than undefined.
 */
export function shapeKycStateCounts(counts: Record<string, number | undefined> | null | undefined, fallback: { escalated?: number; requested?: number } = {}): KycStateCounts {
    const has = (key: string) => typeof counts?.[key] === "number" && Number.isFinite(counts[key]);
    const read = (key: string) => (has(key) ? (counts![key] as number) : 0);
    return {
        AWAITING_DOCUMENTS: has("AWAITING_DOCUMENTS") ? read("AWAITING_DOCUMENTS") : read("awaitingDocuments"),
        REQUESTED: has("REQUESTED") ? read("REQUESTED") : (fallback.requested ?? 0),
        PENDING: read("PENDING"),
        NEEDS_INFO: read("NEEDS_INFO"),
        REJECTED: read("REJECTED"),
        VERIFIED: read("VERIFIED"),
        escalated: has("escalated") ? read("escalated") : (fallback.escalated ?? 0),
        requested: has("requested") ? read("requested") : has("REQUESTED") ? read("REQUESTED") : (fallback.requested ?? 0),
    };
}

/** The chip strip — the six states and Escalated with the server's counts, "All" with the total. */
export function kycStateChips(counts: KycStateCounts, total: number): { value: KycStateChip; label: string; count: number }[] {
    return [
        { value: "all", label: "All", count: total },
        ...KYC_QUEUE_STATES.map((state) => ({ value: state, label: KYC_STATE_META[state].label, count: counts[state] })),
        { value: "ESCALATED", label: "Escalated", count: counts.escalated },
    ];
}

/** Everyone the total covers when no chip is on: the six states summed. */
export function kycStateTotal(counts: KycStateCounts): number {
    return KYC_QUEUE_STATES.reduce((sum, state) => sum + counts[state], 0);
}

/**
 * The header's count: "N awaiting documents · N under review · N past SLA".
 * Under review is what the desk has in hand — PENDING and NEEDS_INFO, the
 * two open record states; awaiting documents is the party-only state (a
 * REQUESTED party is still waiting on documents, so it is counted there too).
 */
export function kycHeadline(counts: KycStateCounts, breached: number): string {
    const awaiting = counts.AWAITING_DOCUMENTS + counts.REQUESTED;
    const review = counts.PENDING + counts.NEEDS_INFO;
    return `${awaiting} awaiting documents · ${review} under review · ${breached} past SLA`;
}

/**
 * Which actions a row in each state offers (N3-C, item 1):
 *
 *   AWAITING_DOCUMENTS   Send Digio request (primary) · Request manual upload / Record at the desk (menu)
 *   REQUESTED            "Requested on <date> by <who>" with Resend behind a confirm · the same menu
 *   PENDING / NEEDS_INFO / REJECTED   Open the case, and the request still offered — nothing is verified yet
 *   VERIFIED             Open the case only; there is nothing to ask for
 */
export interface KycRowActionSet {
    /** The one-click Digio request (or Resend once asked). Every state but VERIFIED. */
    request: boolean;
    /** The row was asked and nothing is in: draw the stamp and Resend instead of the primary button. */
    resend: boolean;
    /** A record exists to open. */
    openCase: boolean;
    /** The desk may record on their behalf. Every state but VERIFIED. */
    record: boolean;
}

export function kycRowActions(state: KycQueueState): KycRowActionSet {
    switch (state) {
        case "AWAITING_DOCUMENTS":
            return { request: true, resend: false, openCase: false, record: true };
        case "REQUESTED":
            return { request: true, resend: true, openCase: false, record: true };
        case "VERIFIED":
            return { request: false, resend: false, openCase: true, record: false };
        default:
            return { request: true, resend: false, openCase: true, record: true };
    }
}

/** What the derivation reads off a record — the columns every KYC table has. */
export interface KycStateRecord {
    status: string;
    submittedAt: string | null;
    requestedAt?: string | null;
}

/**
 * The server's rule, for a row that predates N3-B and carries no `state`
 * (a server one release behind): a decided record is its decision; a
 * PENDING record is PENDING once something was submitted, REQUESTED once
 * the desk asked, AWAITING_DOCUMENTS otherwise; no record is
 * AWAITING_DOCUMENTS unless the party's mirror already says VERIFIED.
 */
export function deriveKycState(record: KycStateRecord | null | undefined, partyKycStatus?: string | null): KycQueueState {
    if (!record) return partyKycStatus === "VERIFIED" ? "VERIFIED" : "AWAITING_DOCUMENTS";
    switch (record.status) {
        case "VERIFIED":
            return "VERIFIED";
        case "REJECTED":
            return "REJECTED";
        case "NEEDS_INFO":
            return "NEEDS_INFO";
        default:
            if (record.submittedAt) return "PENDING";
            if (record.requestedAt) return "REQUESTED";
            return "AWAITING_DOCUMENTS";
    }
}

/** `state` off a row when the server sent one (any case), else derived. */
export function kycStateOf(row: { state?: string | null }, record: KycStateRecord | null | undefined, partyKycStatus?: string | null): KycQueueState {
    const sent = row.state?.toUpperCase();
    return sent && (KYC_QUEUE_STATES as readonly string[]).includes(sent) ? (sent as KycQueueState) : deriveKycState(record, partyKycStatus);
}

/**
 * The party read's `kyc` as the console holds it. A read older than N3-B
 * (no `state`, or `kyc` null) is derived from what it does carry and the
 * party's mirror, so the card still prints a pill.
 */
export function shapeKycSummary(wire: WireKycSummary | null | undefined, partyKycStatus?: string | null): KycSummary {
    const record = wire && (wire.kycId || wire.status) ? { status: wire.status ?? "PENDING", submittedAt: wire.submittedAt ?? null, requestedAt: wire.requestedAt ?? null } : null;
    return {
        state: kycStateOf(wire ?? {}, record, partyKycStatus),
        kycId: wire?.kycId ?? null,
        submittedAt: wire?.submittedAt ?? null,
        requestedAt: wire?.requestedAt ?? null,
        requestedChannel: wire?.requestedChannel === "DIGIO" ? "DIGIO" : wire?.requestedChannel === "MANUAL" ? "MANUAL" : null,
        method: wire?.method === "DIGIO" ? "DIGIO" : wire?.method === "MANUAL" ? "MANUAL" : null,
    };
}
