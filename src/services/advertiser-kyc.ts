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
import {
    ADVERTISER_KYC_REQUIREMENTS,
    ADVERTISER_KYC_TYPE_META,
    type AdvertiserKycCase,
    type AdvertiserKycDocument,
    type AdvertiserKycStatus,
    type AdvertiserKycType,
    type KycDocumentReview,
    type KycEscalationSource,
    type KycLiveness,
    type KycRequestChannel,
} from "@/types";

/**
 * The advertiser KYC tab, on `/advertiser-kyc`.
 *
 * `GET /advertiser-kyc` is one row per advertiser with a column per document
 * — the four-per-type set the module was born with, and the DR 08 set the
 * self-service ladder writes (which government ID, its two sides, the PAN
 * number and signature, the address proof, the selfie). The console draws the
 * type's required documents and lets a DR 08 capture stand in for the legacy
 * column that asks for the same paper, so a self-onboarded advertiser is not
 * reported as missing a document they uploaded under a newer name.
 *
 * Lot D: the desk decides per tile, asks for the flagged ones again
 * (NEEDS_INFO), keeps the reviewer's note, and filters by who is working what.
 *
 * Lot N: KYC from the desk. `POST /advertiser-kyc/:id/request { channel,
 * note? }` asks the advertiser — `:id` the KYC row id, or the advertiser's
 * user id when no row exists yet (the row is keyed by it); the stamps land
 * on the row and the queue's `?requested=true` facet lists the asks nothing
 * has come back for. `PUT /advertiser-kyc/:id` records the documents on
 * their behalf with `recordedVia DESK` — N2-B: `:id` resolves the same
 * way (row id first, then the advertiser's user id), and a PUT over a user
 * id with no row creates one. `GET /advertiser-kyc?advertiserId=` reads
 * the one advertiser's row for the party page.
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): the queue lists PARTIES — every
 * Advertiser profile not yet verified plus every one with a record — each
 * row carrying a server-derived `state`, `kycId` (null with no record) and
 * `party` (the PROFILE slice: id, displayId, name, companyName, email,
 * mobile, city, userId, kycStatus, type, createdAt; `advertiser` is the
 * same object under the queue's old name). The record belongs to the
 * profile: `:id` on the request, the desk's PUT and the case read is the
 * KYC row id, then the profile id, then the user id — so the console
 * records and asks over the PROFILE id, and a console-created advertiser
 * with no app account is on the queue and can be asked (Digio's link goes
 * to the profile's contact; `notified: false` says no ADX notice went).
 * The one click is `POST /advertiser-kyc/:id/request` with no body.
 *
 * The seeded `akyc_*` cases are gone: their ids were never issued by the
 * backend, and the fields they carried — a city, a monthly spend, a risk
 * flag — do not exist on `AdvertiserKyc`. With the API off the tab says so.
 */

/** N3-B: the Advertiser PROFILE slice every queue row carries as `party` (and as `advertiser`, the old name). */
export interface WireAdvertiserParty {
    id: string;
    displayId?: string | null;
    name: string | null;
    companyName?: string | null;
    email: string | null;
    mobile: string;
    city?: string | null;
    userId?: string | null;
    kycStatus?: AdvertiserKycStatus | string | null;
    type?: string | null;
    createdAt?: string | null;
}

export interface WireAdvertiserKyc {
    id: string;
    /** The legacy USER key — N3-B: nullable, a record the desk made for a profile with no app account. */
    advertiserId: string | null;
    /** N3-B: the profile the record belongs to; absent from a server one release behind. */
    advertiserProfileId?: string | null;
    /** N3-B: the party's state, and the record's id — null on a row that is the party alone. */
    state?: string | null;
    kycId?: string | null;
    /** N3-B: the profile behind the row, on every queue row. */
    party?: WireAdvertiserParty | null;
    /** Null on a row with no record (N3-B). */
    kycType: string | null;
    nationalIdUrl: string | null;
    panCardUrl: string | null;
    utilityBillUrl: string | null;
    drivingLicenseUrl: string | null;
    commercialIncCertUrl: string | null;
    commercialAssociationArticleUrl: string | null;
    commercialPanIdUrl: string | null;
    commercialGstCertUrl: string | null;
    ngoRegCertUrl: string | null;
    ngo80gCertUrl: string | null;
    ngoFcraRegUrl: string | null;
    agencyAuthLetterUrl: string | null;
    agencyGovtIdUrl: string | null;
    govIdType: string | null;
    govIdFrontUrl: string | null;
    govIdBackUrl: string | null;
    panNumber: string | null;
    panSignatureUrl: string | null;
    addressProofType: string | null;
    addressProofUrl: string | null;
    selfieUrl: string | null;
    /** Null on a row with no record (N3-B). */
    status: AdvertiserKycStatus | null;
    rejectionReason: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedById?: string | null;
    reviewNote?: string | null;
    assignedToId?: string | null;
    imagesPurgedAt?: string | null;
    /** Lot G (Q127/142): the five escalation columns; null while not escalated. */
    escalatedAt?: string | null;
    escalationSource?: KycEscalationSource | null;
    escalationReason?: string | null;
    escalatedToUserId?: string | null;
    escalatedById?: string | null;
    /** Lot N: the desk's ask and the recorder — null until either happens; `requested` derived by the server (asked, nothing submitted). */
    requestedAt?: string | null;
    requestedById?: string | null;
    requestedChannel?: string | null;
    recordedById?: string | null;
    recordedVia?: string | null;
    requested?: boolean;
    requestedBy?: { id: string; name: string | null } | null;
    /** Null on a row with no record (N3-B) — the party's own `createdAt` is on `party`. */
    createdAt: string | null;
    /** The listing joins the party — N3-B: the profile slice, the same object as `party`; the by-id read never has. */
    advertiser?: WireAdvertiserParty | null;
    /* U7, demand side: the Digio columns, on rows since the advertiser's own path landed. */
    method?: "MANUAL" | "DIGIO" | string;
    digioRequestId?: string | null;
    digioReferenceId?: string | null;
    digioStatus?: string | null;
    digioVerifiedAt?: string | null;
    digioPayload?: { message?: string | null } | null;
    /** Lot A (Q31): on the list, measured by the server; E7-3: on the case read too, with `slaHours` beside them. */
    ageHours?: number | null;
    slaBreached?: boolean;
    slaHours?: number;
    /** E7-3: the people on the case by name, on the case read; E10-1: `assignedTo` on every queue row too. */
    reviewedBy?: { id: string; name: string | null } | null;
    assignedTo?: { id: string; name: string | null } | null;
    recordedBy?: { id: string; name: string | null } | null;
    /** G11-1: the escalation's two people by name, on every queue row and the case read — null while not escalated. */
    escalatedTo?: { id: string; name: string | null } | null;
    escalatedBy?: { id: string; name: string | null } | null;
    /** Lot D: on the case read only; E10-1: each row carries `reviewedBy { id, name }`. */
    documentReviews?: KycDocumentReview[];
    liveness?: KycLiveness | null;
}

/** `GET /advertiser-kyc` — E7-3: `data` is the publisher queue's shape, the page object with the SLA and the breach count on it. */
export interface WireAdvertiserKycPage {
    items: WireAdvertiserKyc[];
    total: number;
    page: number;
    pageSize: number;
    /** N3-B: parties per state (+ `awaitingDocuments`), counted with the state facet removed; `escalated` and `requested` beside them. */
    counts: Record<string, number | undefined>;
    /** Across the whole queue, not the page. */
    breached: number;
    /** Lot G: escalated cases across the queue with that facet removed. */
    escalated?: number;
    /** Lot N: the desk's asks with nothing submitted yet, across the queue with that facet removed. */
    requested?: number;
    slaHours: number;
}

export interface AdvertiserKycQueue {
    cases: AdvertiserKycCase[];
    total: number;
    breached: number;
    slaHours: number;
    /** N3-B: parties per state, from the server, counted without the state facet. */
    counts: KycStateCounts;
    /** Lot G: escalated cases across the queue, whatever facet is applied. */
    escalated: number;
    /** Lot N: requested-and-not-submitted across the queue, whatever facet is applied. */
    requested: number;
}

export interface AdvertiserKycFilter {
    /** N3-B: one of the six party states — the chips. `status` stays as its alias. */
    state?: KycQueueState;
    status?: AdvertiserKycStatus;
    /** N3-B: the party's name, company, display id, email or mobile. */
    q?: string;
    /** Lot D (Q119): who is working the case. */
    assignedTo?: "me" | "none";
    /** Lot G (Q127/142): only the escalated (true) or none of them (false). */
    escalated?: boolean;
    /** Lot N: only the desk's asks with nothing submitted yet (true), or none of them (false). */
    requested?: boolean;
    /** Absent means late first; `newest` is the arrival order. */
    sort?: "newest";
}

export function buildAdvertiserKycQuery(filter: AdvertiserKycFilter = {}): string {
    const params = new URLSearchParams({ pageSize: "100" });
    if (filter.state) params.set("state", filter.state);
    if (filter.status) params.set("status", filter.status);
    if (filter.q?.trim()) params.set("q", filter.q.trim());
    if (filter.assignedTo) params.set("assignedTo", filter.assignedTo);
    if (filter.escalated !== undefined) params.set("escalated", String(filter.escalated));
    if (filter.requested !== undefined) params.set("requested", String(filter.requested));
    if (filter.sort) params.set("sort", filter.sort);
    return params.toString();
}

const fileName = (url: string) => url.split("/").pop()?.split("?")[0] ?? url;

/** Which DR 08 capture answers a legacy per-type column asking for the same paper. */
function standIn(row: WireAdvertiserKyc, field: string): string | null {
    switch (field) {
        case "nationalIdUrl":
            return row.govIdFrontUrl;
        case "panCardUrl":
            return row.panSignatureUrl;
        case "utilityBillUrl":
            return row.addressProofUrl;
        case "drivingLicenseUrl":
            return row.govIdType === "DRIVING_LICENCE" ? row.govIdFrontUrl : null;
        default:
            return null;
    }
}

const DR08_EXTRAS: { field: keyof WireAdvertiserKyc; label: string }[] = [
    { field: "govIdBackUrl", label: "Government ID · back" },
    { field: "selfieUrl", label: "Live selfie" },
];

const hoursSince = (iso: string, now: Date = new Date()) => Math.max(0, (now.getTime() - new Date(iso).getTime()) / 3_600_000);

export function shapeAdvertiserKyc(row: WireAdvertiserKyc, slaHours: number = row.slaHours ?? DEFAULT_KYC_SLA_HOURS, now: Date = new Date()): AdvertiserKycCase {
    // N3-B: the profile behind the row, under either name; a case read carries neither.
    const party = row.party ?? row.advertiser ?? null;
    // A row with no record has no `kycType`; the profile's entity type is what the desk records under.
    const typeWord = row.kycType ?? party?.type ?? "INDIVIDUAL";
    const kycType = (typeWord in ADVERTISER_KYC_TYPE_META ? typeWord : "INDIVIDUAL") as AdvertiserKycType;
    const filedAt = row.submittedAt ?? row.createdAt ?? party?.createdAt ?? "";
    const hasRecord = Boolean(row.kycId ?? (row.status ? row.id : null));
    // The record's status, else the profile's mirror — the same word, kept in step by the server on every status write.
    const status: AdvertiserKycStatus = row.status ?? ((party?.kycStatus as AdvertiserKycStatus | null | undefined) ?? "PENDING");
    const record = hasRecord ? { status, submittedAt: row.submittedAt, requestedAt: row.requestedAt ?? null } : null;
    const document = (field: string, label: string, url: string | null): AdvertiserKycDocument => ({
        field,
        label,
        fileName: url ? fileName(url) : null,
        uploadedAt: url ? filedAt : null,
        url,
    });
    const documents = ADVERTISER_KYC_REQUIREMENTS[kycType].map((requirement) => {
        const legacy = row[requirement.field as keyof WireAdvertiserKyc] as string | null | undefined;
        return document(requirement.field, requirement.label, legacy ?? standIn(row, requirement.field));
    });
    for (const extra of DR08_EXTRAS) {
        const url = row[extra.field] as string | null;
        if (url) documents.push(document(extra.field, extra.label, url));
    }
    const account = party;
    // The list carries the server's measure; the case read does not, and a
    // decided record has no age — the clock stopped when a reviewer answered.
    // N3-B: a party with nothing submitted has no clock running.
    const open = hasRecord && row.submittedAt !== null && (status === "PENDING" || status === "NEEDS_INFO");
    const ageHours = row.ageHours !== undefined ? row.ageHours : open ? hoursSince(filedAt, now) : null;
    const userId = row.advertiserId ?? party?.userId ?? null;
    return {
        id: row.id,
        advertiserId: userId,
        profileId: row.advertiserProfileId ?? party?.id ?? null,
        userId,
        state: kycStateOf(row, record, party?.kycStatus ?? null),
        kycId: row.kycId ?? (hasRecord ? row.id : null),
        displayId: party?.displayId ?? null,
        city: party?.city ?? null,
        createdAt: party?.createdAt ?? row.createdAt ?? null,
        advertiser: account?.companyName ?? account?.name ?? account?.mobile ?? userId ?? row.id,
        contact: account?.mobile ?? "—",
        email: account?.email ?? "—",
        kycType,
        status,
        submittedAt: filedAt,
        reviewedAt: row.reviewedAt,
        reviewedById: row.reviewedById ?? null,
        rejectionReason: row.rejectionReason,
        reviewNote: row.reviewNote ?? null,
        assignedToId: row.assignedToId ?? null,
        reviewedBy: row.reviewedBy ?? (row.reviewedById ? { id: row.reviewedById, name: null } : null),
        assignedTo: row.assignedTo ?? (row.assignedToId ? { id: row.assignedToId, name: null } : null),
        ageHours,
        slaBreached: row.slaBreached ?? (ageHours !== null && ageHours > slaHours),
        slaHoursLeft: slaHoursLeftOf(ageHours, slaHours),
        documents,
        panNumber: row.panNumber,
        method: row.method === "DIGIO" ? "DIGIO" : "MANUAL",
        digio:
            row.method === "DIGIO" || row.digioRequestId
                ? {
                      requestId: row.digioRequestId ?? null,
                      referenceId: row.digioReferenceId ?? null,
                      status: row.digioStatus ?? null,
                      verifiedAt: row.digioVerifiedAt ?? null,
                      message: row.digioPayload?.message ?? null,
                  }
                : null,
        documentReviews: row.documentReviews ?? [],
        liveness: row.liveness ?? null,
        imagesPurgedAt: row.imagesPurgedAt ?? null,
        escalation: escalationOf(row),
        request: requestOf(row),
        recorded: recordedOf(row),
    };
}

/**
 * Lot N: the tiles the desk records for an advertiser of a type — the
 * type's own documents, then the DR 08 captures the self-service ladder
 * writes (which government ID and its two sides, the PAN signature, the
 * address proof, the selfie). The columns are the schema's own names.
 */
export const ADVERTISER_DESK_EXTRAS: { field: string; label: string }[] = [
    { field: "govIdFrontUrl", label: "Government ID · front" },
    { field: "govIdBackUrl", label: "Government ID · back" },
    { field: "panSignatureUrl", label: "PAN signature" },
    { field: "addressProofUrl", label: "Address proof" },
    { field: "selfieUrl", label: "Live selfie" },
];

/** The typed facts the advertiser's desk record takes beside its tiles. */
export const ADVERTISER_DESK_FACTS = { panNumber: true, govIdType: true, addressProofType: true } as const;

export function advertiserDeskTiles(kycType: AdvertiserKycType): { field: string; label: string }[] {
    const own = ADVERTISER_KYC_REQUIREMENTS[kycType];
    return [...own, ...ADVERTISER_DESK_EXTRAS.filter((extra) => !own.some((item) => item.field === extra.field))];
}

/** The label a field is drawn under, for a review row whose tile may since have been purged. */
export function advertiserKycFieldLabel(field: string): string {
    for (const requirements of Object.values(ADVERTISER_KYC_REQUIREMENTS)) {
        const hit = requirements.find((item) => item.field === field);
        if (hit) return hit.label;
    }
    return DR08_EXTRAS.find((item) => item.field === field)?.label ?? field;
}

function live() {
    if (!isLive("kyc")) throw new Error("KYC is read from the API; connect the console to the ADX backend first.");
    return http;
}

export const advertiserKycService = {
    /**
     * The queue: late first unless `sort=newest`. E7-3: `data` is the page
     * object — `{ items, total, page, pageSize, counts, breached, slaHours }`
     * — so the SLA the server measured against and the breach count across
     * the whole queue come with the rows rather than from a settings read.
     */
    queue: async (filter: AdvertiserKycFilter = {}): Promise<AdvertiserKycQueue> => {
        if (!isLive("kyc")) return { cases: [], total: 0, breached: 0, slaHours: 0, counts: shapeKycStateCounts(null), escalated: 0, requested: 0 };
        const page = await http.get<WireAdvertiserKycPage>(`/advertiser-kyc?${buildAdvertiserKycQuery(filter)}`);
        const slaHours = page.slaHours ?? DEFAULT_KYC_SLA_HOURS;
        const cases = (page.items ?? []).map((row) => shapeAdvertiserKyc(row, slaHours));
        const escalated = page.escalated ?? page.counts?.escalated ?? cases.filter((item) => item.escalation).length;
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

    list: async (filter: AdvertiserKycFilter = {}): Promise<AdvertiserKycCase[]> => (await advertiserKycService.queue(filter)).cases,

    /** The case as the workbench draws it: the row, every tile's decision, the liveness video, and (E7-3) its own age against the SLA and the people on it by name. Null when the id names nobody. */
    get: async (id: string): Promise<AdvertiserKycCase | null> => {
        if (!isLive("kyc")) return null;
        try {
            return shapeAdvertiserKyc(await http.get<WireAdvertiserKyc>(`/advertiser-kyc/${id}`));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** The desk asks Digio again for this row; the advertiser is told to open the app. 409 once verified; 503 while the provider is off. */
    restartDigio: (id: string) =>
        live().post<{ kycId: string; validTill: string; digioStatus: "pending"; notified: boolean }>(
            `/advertiser-kyc/${id}/digio/restart`,
            {}
        ),

    /** The decision; the reason travels with a rejection, the note with either. 409 LIVENESS_REQUIRED on a manual-path VERIFIED with no video. */
    review: async (id: string, status: "VERIFIED" | "REJECTED", note?: string): Promise<WireAdvertiserKyc> => {
        const trimmed = note?.trim();
        if (status === "REJECTED" && !trimmed) throw new Error("Add a reason before rejecting.");
        return live().patch<WireAdvertiserKyc>(`/advertiser-kyc/${id}/review`, {
            status,
            ...(status === "REJECTED" ? { rejectionReason: trimmed } : {}),
            ...(trimmed ? { reviewNote: trimmed } : {}),
        });
    },

    /** Lot D (Q42): one tile approved or flagged, with what the reviewer said. */
    reviewDocument: (id: string, field: string, decision: DocumentDecision, note?: string): Promise<KycDocumentReview> =>
        live().patch<KycDocumentReview>(`/advertiser-kyc/${id}/documents/${field}`, documentDecisionBody(decision, note)),

    /** Lot D (Q42): the flagged fields are asked for again; the case goes NEEDS_INFO and the advertiser is told which. */
    requestReupload: (id: string, fields: string[], note: string) =>
        live().post<WireAdvertiserKyc & { flagged: { field: string; note: string | null }[] }>(`/advertiser-kyc/${id}/request-reupload`, {
            fields,
            note: note.trim(),
        }),

    /** Lot D (Q119): who is working the case — `me`, an admin's id, or null to clear. */
    assign: (id: string, adminUserId: string | "me" | null): Promise<WireAdvertiserKyc> =>
        live().patch<WireAdvertiserKyc>(`/advertiser-kyc/${id}/assign`, { adminUserId }),

    /** Lot G (Q127/142): the reviewer hands the case to Compliance with a reason; they are told. `KYC_ESCALATED`. 409 decided or already escalated. */
    escalate: async (id: string, reason: string): Promise<WireAdvertiserKyc> => {
        const trimmed = reason.trim();
        if (!trimmed) throw new Error("Say why the case is being escalated.");
        return live().post<WireAdvertiserKyc>(`/advertiser-kyc/${id}/escalate`, { reason: trimmed });
    },

    /**
     * Lot N: the desk asks the advertiser for their KYC. `id` is the KYC row
     * id, or the advertiser's user id when there is no row yet — the server
     * tries the row first. 409 `KYC_ALREADY_VERIFIED`.
     */
    request: (id: string, channel: KycRequestChannel, note?: string) =>
        live().post<{ kyc: WireAdvertiserKyc; digio: { kycId: string; validTill: string } | null; notified: boolean }>(
            `/advertiser-kyc/${id}/request`,
            kycRequestBody(channel, note)
        ),

    /**
     * N3-C: the one click — the same route with no body; the server
     * defaults the channel to DIGIO. `id` is the KYC row id, the PROFILE id
     * or the user id; `notified: false` for an advertiser with no app
     * account (the Digio link still goes to the profile's contact). Behind
     * `kyc.edit`.
     */
    requestDigio: (id: string) =>
        live().post<{ kyc: WireAdvertiserKyc; digio: { kycId: string; validTill: string } | null; notified: boolean }>(`/advertiser-kyc/${id}/request`),

    /**
     * Lot N: the desk records the documents on the advertiser's behalf —
     * `recordedVia DESK`, `submittedAt` set where it was null. N2-B: `id`
     * is the KYC row id, or the advertiser's user id — over a user id with
     * no row the server creates one (PENDING, `kycType` from the body or
     * the advertiser's entity type). 409 `KYC_ALREADY_VERIFIED`.
     */
    recordAtDesk: (id: string, body: KycDeskBody & { kycType?: AdvertiserKycType }): Promise<WireAdvertiserKyc> =>
        live().put<WireAdvertiserKyc>(`/advertiser-kyc/${id}`, body),

    /**
     * Lot N / N2-B / N3-B: the advertiser's queue row for the party page —
     * `GET /advertiser-kyc?advertiserId=`, the PROFILE id or the user id,
     * one row at most. N3-B: every advertiser is on the queue, so the row
     * comes back even before any record (state AWAITING_DOCUMENTS, `kycId`
     * null); null only when the id names nobody the queue lists — a
     * verified profile with no record, or nobody at all.
     */
    findForAdvertiser: async (id: string): Promise<AdvertiserKycCase | null> => {
        if (!isLive("kyc")) return null;
        const params = new URLSearchParams({ advertiserId: id, pageSize: "1" });
        const page = await http.get<WireAdvertiserKycPage>(`/advertiser-kyc?${params.toString()}`);
        const row = (page.items ?? []).find((item) => item.advertiserId === id || item.party?.id === id || item.advertiser?.id === id || item.advertiserProfileId === id);
        return row ? shapeAdvertiserKyc(row, page.slaHours ?? DEFAULT_KYC_SLA_HOURS) : null;
    },

    /** The same read by the account's user id — kept for the callers that hold one; the profile id is the key now. */
    findForUser: (userId: string): Promise<AdvertiserKycCase | null> => advertiserKycService.findForAdvertiser(userId),
};
