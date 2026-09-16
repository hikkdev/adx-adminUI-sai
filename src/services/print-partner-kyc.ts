import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import {
    DEFAULT_KYC_SLA_HOURS,
    documentDecisionBody,
    escalationOf,
    kycRequestBody,
    recordedOf,
    requestOf,
    slaHoursLeftOf,
    type DocumentDecision,
    type KycDeskBody,
} from "./kyc";
import { kycStateOf, shapeKycStateCounts, type KycQueueState, type KycStateCounts } from "./kyc-state";
import type {
    KycDigio,
    KycDocumentReview,
    KycEscalation,
    KycEscalationSource,
    KycLiveness,
    KycPerson,
    KycRecorded,
    KycRequest,
    KycRequestChannel,
    KycRowStatus,
} from "@/types";

/**
 * The print partner's KYC desk — Lot N (owner, 14 Sep 2026), on
 * `/print-partner-kyc` behind feature `print.partner-kyc`.
 *
 * One record per partner (`PrintPartnerKyc`), the publisher's business
 * branch: the PAN and its signature, the GST certificate, the registration
 * certificate, the business address proof, a director's id, the government
 * id (type, front, back), the bank proof and a selfie. It reaches the desk
 * on three paths — the partner's own phone (SELF, documents or Digio), the
 * desk recording it on their behalf (`PUT /print-partner-kyc/:id`, DESK),
 * and the desk's ask (`POST /print-partner-kyc/:id/request`, Digio on their
 * behalf or by hand). The review is the advertiser desk's, tile for tile:
 * a decision per document, NEEDS_INFO and the re-upload ask, assignment as
 * a filter, escalation through `kyc`, no VERIFIED on the manual path until
 * the partner's liveness video or the desk's presence attestation is in.
 *
 * `:id` is the KYC record's id, or the partner's own id for a partner with
 * no record yet — the desk's PUT and the request make the record.
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): the queue lists PARTIES — every
 * partner not yet verified plus every one with a record — each row with a
 * server-derived `state` and `kycId` (null with no record; every record
 * column null, `id` the partner's); `?state=` is the facet and `counts`
 * carries the six states. The one click is `POST /print-partner-kyc/:id/request`
 * with no body, behind `kyc.edit`.
 */

export interface WirePrintPartnerKyc {
    id: string;
    printPartnerId: string;
    /** N3-B: the party's state and the record's id — null on a row that is the partner alone. */
    state?: string | null;
    kycId?: string | null;
    panNumber: string | null;
    panFrontUrl: string | null;
    panSignatureUrl: string | null;
    gstUrl: string | null;
    businessRegCertUrl: string | null;
    businessAddressProofUrl: string | null;
    directorIdUrl: string | null;
    govIdType: string | null;
    govIdFrontUrl: string | null;
    govIdBackUrl: string | null;
    bankProofUrl: string | null;
    selfieUrl: string | null;
    digioRequestId: string | null;
    digioReferenceId: string | null;
    digioStatus: string | null;
    digioVerifiedAt: string | null;
    digioPayload?: { message?: string | null } | null;
    /** Null on a row with no record (N3-B). */
    method: "MANUAL" | "DIGIO" | string | null;
    status: KycRowStatus | null;
    rejectionReason: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedById: string | null;
    reviewNote: string | null;
    assignedToId: string | null;
    assignedAt: string | null;
    escalatedAt?: string | null;
    escalationSource?: KycEscalationSource | null;
    escalationReason?: string | null;
    escalatedToUserId?: string | null;
    escalatedById?: string | null;
    imagesPurgedAt: string | null;
    requestedAt: string | null;
    requestedById: string | null;
    requestedChannel: string | null;
    recordedById: string | null;
    recordedVia: string | null;
    createdAt: string | null;
    /** The partner behind the row, on every read; N3-B: with `createdAt`, the arrival order the awaiting rows sort by. */
    printPartner: { id: string; displayId: string | null; name: string; mobile: string; email: string | null; userId: string; city: string | null; isActive: boolean; kycStatus: KycRowStatus; createdAt?: string | null };
    /** The server's measure against the review SLA; on the case read too, with `slaHours` beside them. */
    ageHours?: number | null;
    slaBreached?: boolean;
    slaHours?: number;
    /** Asked, nothing submitted since — derived by the server. */
    requested?: boolean;
    reviewedBy?: KycPerson | null;
    assignedTo?: KycPerson | null;
    escalatedTo?: KycPerson | null;
    escalatedBy?: KycPerson | null;
    requestedBy?: KycPerson | null;
    recordedBy?: KycPerson | null;
    /** On the case read only. */
    documentReviews?: KycDocumentReview[];
    liveness?: KycLiveness | null;
}

/** `GET /print-partner-kyc` — the advertiser queue's contract: the page object with the counts, the breaches and the SLA on it. */
export interface WirePrintPartnerKycPage {
    items: WirePrintPartnerKyc[];
    total: number;
    page: number;
    pageSize: number;
    /** N3-B: parties per state (+ `awaitingDocuments`), `escalated` and `requested`, each counted with the state facet removed. */
    counts: Record<string, number | undefined>;
    breached: number;
    escalated: number;
    requested: number;
    slaHours: number;
}

export interface PrintPartnerKycDocument {
    field: string;
    label: string;
    fileName: string | null;
    url: string | null;
}

/** The case as the console draws it. */
export interface PrintPartnerKycCase {
    id: string;
    partnerId: string;
    partnerName: string;
    displayId: string | null;
    mobile: string;
    email: string | null;
    city: string | null;
    /** The PARTNER account — who the liveness video or the presence attestation belongs to. */
    userId: string;
    /** N3-B: the party's state as the server derives it, and the record's id (null with no record). */
    state: KycQueueState;
    kycId: string | null;
    /** When the partner arrived; null on a read older than N3-B. */
    createdAt: string | null;
    /** The record's status, else the partner's mirror — the same word, kept in step by the server. */
    status: KycRowStatus;
    method: "MANUAL" | "DIGIO";
    panNumber: string | null;
    govIdType: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedById: string | null;
    reviewNote: string | null;
    rejectionReason: string | null;
    assignedToId: string | null;
    reviewedBy: KycPerson | null;
    assignedTo: KycPerson | null;
    ageHours: number | null;
    slaBreached: boolean;
    slaHoursLeft: number;
    documents: PrintPartnerKycDocument[];
    digio: KycDigio | null;
    documentReviews: KycDocumentReview[];
    liveness: KycLiveness | null;
    imagesPurgedAt: string | null;
    escalation: KycEscalation | null;
    request: KycRequest | null;
    recorded: KycRecorded | null;
}

export interface PrintPartnerKycQueue {
    cases: PrintPartnerKycCase[];
    total: number;
    breached: number;
    slaHours: number;
    /** N3-B: parties per state, the chips' counts. */
    counts: KycStateCounts;
    escalated: number;
    requested: number;
}

/** The queue's facets, exactly as `printPartnerKycQueueQuerySchema` parses them. */
export interface PrintPartnerKycFilter {
    /** N3-B: one of the six party states — the chips. `status` stays as its alias. */
    state?: KycQueueState;
    status?: KycRowStatus;
    requested?: boolean;
    assignedTo?: "me" | "none";
    escalated?: boolean;
    /** The partner's name, display id or mobile. */
    q?: string;
    sort?: "oldest" | "newest";
}

export function buildPrintPartnerKycQuery(filter: PrintPartnerKycFilter = {}): string {
    const params = new URLSearchParams({ pageSize: "100" });
    if (filter.state) params.set("state", filter.state);
    if (filter.status) params.set("status", filter.status);
    if (filter.requested !== undefined) params.set("requested", String(filter.requested));
    if (filter.assignedTo) params.set("assignedTo", filter.assignedTo);
    if (filter.escalated !== undefined) params.set("escalated", String(filter.escalated));
    if (filter.q?.trim()) params.set("q", filter.q.trim());
    if (filter.sort) params.set("sort", filter.sort);
    return params.toString();
}

/** Every document column a partner's row holds, in the order the desk reads them — the `field` is what `PATCH …/documents/:field` names. */
export const PRINT_PARTNER_KYC_FIELDS: { field: string; label: string }[] = [
    { field: "panFrontUrl", label: "PAN card" },
    { field: "panSignatureUrl", label: "PAN signature" },
    { field: "gstUrl", label: "GST certificate" },
    { field: "businessRegCertUrl", label: "Business registration certificate" },
    { field: "businessAddressProofUrl", label: "Business address proof" },
    { field: "directorIdUrl", label: "Director's ID" },
    { field: "govIdFrontUrl", label: "Government ID · front" },
    { field: "govIdBackUrl", label: "Government ID · back" },
    { field: "bankProofUrl", label: "Bank proof" },
    { field: "selfieUrl", label: "Live selfie" },
];

/** The typed facts the partner's desk record takes beside its tiles — the PAN and which government id. */
export const PARTNER_DESK_FACTS = { panNumber: true, govIdType: true } as const;

export function printPartnerKycFieldLabel(field: string): string {
    return PRINT_PARTNER_KYC_FIELDS.find((item) => item.field === field)?.label ?? field;
}

const fileName = (url: string) => url.split("/").pop()?.split("?")[0] ?? url;

export function shapePrintPartnerKyc(row: WirePrintPartnerKyc, slaHours: number = row.slaHours ?? DEFAULT_KYC_SLA_HOURS): PrintPartnerKycCase {
    const ageHours = row.ageHours ?? null;
    const partner = row.printPartner;
    // N3-B: a row with no record spreads every record column as null; the mirror is the status then.
    const hasRecord = Boolean(row.kycId ?? row.status);
    const status: KycRowStatus = row.status ?? partner.kycStatus ?? "PENDING";
    const record = hasRecord ? { status, submittedAt: row.submittedAt, requestedAt: row.requestedAt } : null;
    return {
        id: row.id,
        partnerId: row.printPartnerId,
        partnerName: partner.name,
        displayId: partner.displayId,
        mobile: partner.mobile,
        email: partner.email,
        city: partner.city,
        userId: partner.userId,
        state: kycStateOf(row, record, partner.kycStatus),
        kycId: row.kycId ?? (hasRecord ? row.id : null),
        createdAt: partner.createdAt ?? null,
        status,
        method: row.method === "DIGIO" ? "DIGIO" : "MANUAL",
        panNumber: row.panNumber,
        govIdType: row.govIdType,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
        reviewedById: row.reviewedById,
        reviewNote: row.reviewNote,
        rejectionReason: row.rejectionReason,
        assignedToId: row.assignedToId,
        reviewedBy: row.reviewedBy ?? (row.reviewedById ? { id: row.reviewedById, name: null } : null),
        assignedTo: row.assignedTo ?? (row.assignedToId ? { id: row.assignedToId, name: null } : null),
        ageHours,
        slaBreached: row.slaBreached ?? (ageHours !== null && ageHours > slaHours),
        slaHoursLeft: slaHoursLeftOf(ageHours, slaHours),
        documents: PRINT_PARTNER_KYC_FIELDS.map(({ field, label }) => {
            const url = (row as unknown as Record<string, unknown>)[field];
            const present = typeof url === "string" && url ? url : null;
            return { field, label, fileName: present ? fileName(present) : null, url: present };
        }),
        digio:
            row.method === "DIGIO" || row.digioRequestId
                ? {
                      requestId: row.digioRequestId,
                      referenceId: row.digioReferenceId,
                      status: row.digioStatus,
                      verifiedAt: row.digioVerifiedAt,
                      message: row.digioPayload?.message ?? null,
                  }
                : null,
        documentReviews: row.documentReviews ?? [],
        liveness: row.liveness ?? null,
        imagesPurgedAt: row.imagesPurgedAt,
        escalation: escalationOf(row),
        request: requestOf(row),
        recorded: recordedOf(row),
    };
}

function live() {
    if (!isLive("kyc")) throw new Error("KYC is read from the API; connect the console to the ADX backend first.");
    return http;
}

export const printPartnerKycService = {
    /** The queue: late first unless `sort=newest`; the counts by status, the breaches, the escalated and the requested across it. */
    queue: async (filter: PrintPartnerKycFilter = {}): Promise<PrintPartnerKycQueue> => {
        if (!isLive("kyc")) return { cases: [], total: 0, breached: 0, slaHours: 0, counts: shapeKycStateCounts(null), escalated: 0, requested: 0 };
        const page = await http.get<WirePrintPartnerKycPage>(`/print-partner-kyc?${buildPrintPartnerKycQuery(filter)}`);
        const slaHours = page.slaHours ?? DEFAULT_KYC_SLA_HOURS;
        const cases = (page.items ?? []).map((row) => shapePrintPartnerKyc(row, slaHours));
        const escalated = page.escalated ?? page.counts?.["escalated"] ?? cases.filter((item) => item.escalation).length;
        const requested = page.requested ?? page.counts?.["requested"] ?? cases.filter((item) => item.request?.open).length;
        return {
            cases,
            total: page.total ?? cases.length,
            breached: page.breached ?? cases.filter((item) => item.slaBreached).length,
            slaHours,
            counts: shapeKycStateCounts(page.counts, { escalated, requested }),
            escalated,
            requested,
        };
    },

    /** The case — by the record's id or the partner's. Null when neither names anything (a partner with no record yet answers null too). */
    get: async (id: string): Promise<PrintPartnerKycCase | null> => {
        if (!isLive("kyc")) return null;
        try {
            return shapePrintPartnerKyc(await http.get<WirePrintPartnerKyc>(`/print-partner-kyc/${id}`));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** The desk asks the partner — Digio on their behalf, or by hand; `KYC_REQUESTED`. `id` the record's or the partner's. 409 `KYC_ALREADY_VERIFIED`. */
    request: (id: string, channel: KycRequestChannel, note?: string) =>
        live().post<WirePrintPartnerKyc & { digio: { kycId: string; validTill: string } | null }>(`/print-partner-kyc/${id}/request`, kycRequestBody(channel, note)),

    /** N3-C: the one click — the same route with no body; the server defaults the channel to DIGIO. `id` the record's or the partner's. Behind `kyc.edit`. */
    requestDigio: (id: string) => live().post<WirePrintPartnerKyc & { digio: { kycId: string; validTill: string } | null }>(`/print-partner-kyc/${id}/request`),

    /** The desk records the documents on the partner's behalf — `recordedVia DESK`; answers the case. `id` the record's or the partner's. */
    recordAtDesk: async (id: string, body: KycDeskBody): Promise<PrintPartnerKycCase> =>
        shapePrintPartnerKyc(await live().put<WirePrintPartnerKyc>(`/print-partner-kyc/${id}`, body)),

    /** The decision; the reason travels with a rejection, the note with either. 409 LIVENESS_REQUIRED on a manual-path VERIFIED with no video or attestation. */
    review: (id: string, status: "VERIFIED" | "REJECTED", note?: string) => {
        const trimmed = note?.trim();
        if (status === "REJECTED" && !trimmed) throw new Error("Add a reason before rejecting.");
        return live().patch<WirePrintPartnerKyc>(`/print-partner-kyc/${id}/review`, {
            status,
            ...(status === "REJECTED" ? { rejectionReason: trimmed } : {}),
            ...(trimmed ? { reviewNote: trimmed } : {}),
        });
    },

    reviewDocument: (id: string, field: string, decision: DocumentDecision, note?: string): Promise<KycDocumentReview> =>
        live().patch<KycDocumentReview>(`/print-partner-kyc/${id}/documents/${field}`, documentDecisionBody(decision, note)),

    requestReupload: (id: string, fields: string[], note: string) =>
        live().post<WirePrintPartnerKyc>(`/print-partner-kyc/${id}/request-reupload`, { fields, note: note.trim() }),

    /** Who is working the case — `me`, an admin's id, or null to clear. There is no bulk route; a selection is one call per case. */
    assign: (id: string, adminUserId: string | "me" | null) =>
        live().patch<{ id: string; assignedToId: string | null }>(`/print-partner-kyc/${id}/assign`, { adminUserId }),

    escalate: async (id: string, reason: string) => {
        const trimmed = reason.trim();
        if (!trimmed) throw new Error("Say why the case is being escalated.");
        return live().post<WirePrintPartnerKyc>(`/print-partner-kyc/${id}/escalate`, { reason: trimmed });
    },

    restartDigio: (id: string) =>
        live().post<{ kycId: string; validTill: string; digioStatus: "pending"; notified: boolean }>(`/print-partner-kyc/${id}/digio/restart`, {}),
};
