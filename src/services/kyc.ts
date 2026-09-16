import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { kycStateOf, shapeKycStateCounts, type KycQueueState, type KycStateCounts } from "./kyc-state";
import type {
    KycCase,
    KycCheck,
    KycDigio,
    KycDocument,
    KycDocumentReview,
    KycEscalation,
    KycEscalationSource,
    KycLiveness,
    KycPerson,
    KycRecorded,
    KycRequest,
    KycRequestChannel,
    KycRowStatus,
    StatusMeta,
} from "@/types";

/**
 * The publisher KYC desk, wired to `/publishers/kyc-queue` (D7, Lot A, Lot D).
 *
 * One function per endpoint, one return type. The API sends the row as the
 * database holds it — one column per document — and the console draws a
 * list of documents, a status in its own vocabulary, the review SLA the
 * server measured against the number ops set, and who brought the publisher
 * in. Self-onboarded publishers (DR 08) arrive with no agent at all; the
 * queue names them as such rather than leaving the column blank.
 *
 * Lot D turned one verdict over the whole record into a decision per tile,
 * a re-upload ask for exactly the flagged ones (NEEDS_INFO), a memory of who
 * decided and what they said, and a filter for who is working what. The
 * decision itself refuses VERIFIED on a manual-path row until the publisher
 * has recorded the liveness video (409 `LIVENESS_REQUIRED`).
 *
 * Lot G (Q127/142, package CG2): an escalation is a flag on an open case —
 * stamped by the nightly age sweep (AGE), by a fraud case opened against
 * the party (FRAUD_LINK) or by the reviewer's own button (REVIEWER,
 * `POST /publishers/kyc-queue/:id/escalate { reason }`) — handed to a
 * member of the Compliance pool and cleared by the decision. The queue
 * takes `?escalated=true` and answers `escalated` / `counts.escalated`
 * across the queue whatever facet is applied.
 *
 * Lot N (owner, 14 Sep 2026): KYC from the desk. The desk may ASK a
 * publisher for their KYC — `POST /publishers/kyc-queue/:id/request
 * { channel, note? }`, a Digio session opened on their behalf or a notice
 * to upload by hand, stamped `requestedAt / requestedById / requestedChannel`
 * on the row (REQUESTED is derived: asked and nothing submitted since, the
 * queue's `?requested=true` facet) — or RECORD it on their behalf —
 * `PUT /publishers/kyc-queue/:id` with the same body the agent's on-behalf
 * submission takes, stamped `recordedVia DESK` and who. The row names who
 * requested and who recorded (`requestedBy` / `recordedBy`) on every read.
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): the queue lists PARTIES — every
 * publisher not yet verified plus every one with a record — each row with
 * a server-derived `state` (AWAITING_DOCUMENTS from the moment the account
 * exists, then REQUESTED / PENDING / NEEDS_INFO / REJECTED / VERIFIED) and
 * `kycId` (null with no record); `?state=` is the facet, `counts` carries
 * the six states beside `escalated` and `requested`. The one click is
 * `POST /publishers/kyc-queue/:id/request` with no body — the server
 * defaults the channel to DIGIO — behind `kyc.edit`.
 *
 * There are no fixtures. The `kyc_*` seeds the queue used to draw are gone:
 * their ids were never issued by the backend, and a fixture id handed to a
 * live endpoint is a 404 on every row. With the API off the screens say so.
 */

/** `GET /publishers/kyc-queue`, one row, as the API sends it. */
export interface WireKycRow {
    id: string;
    displayId: string | null;
    name: string;
    mobile: string;
    email: string | null;
    type: "INDIVIDUAL" | "BUSINESS" | "NGO" | "POLITICAL";
    contactName: string | null;
    city: string | null;
    /**
     * N3-B: the party's KYC state (AWAITING_DOCUMENTS … VERIFIED), derived by
     * the server — it spreads over the publisher's address-state column of
     * the same name on every queue row, so the console never reads a
     * geography here. A server one release behind still sends the address.
     */
    state: string | null;
    gstin: string | null;
    userId?: string | null;
    kycStatus: KycRowStatus;
    onboardingStatus: string;
    createdAt: string;
    agent: { id: string; displayId: string | null; user: { name: string | null } } | null;
    /** Lot A (Q31): measured by the server against `kyc.reviewSlaHours`; E7-3: on the case read too, with `slaHours` beside them. */
    ageHours?: number | null;
    slaBreached?: boolean;
    slaHours?: number;
    /** E7-3: the people on the case by name, on the case read; E10-1: `assignedTo` on every queue row too. */
    reviewedBy?: KycPerson | null;
    assignedTo?: KycPerson | null;
    /** G11-1: the escalation's two people by name, on every queue row and the case read — null while not escalated. */
    escalatedTo?: KycPerson | null;
    escalatedBy?: KycPerson | null;
    /** Lot N: who asked for the KYC from the desk, and who recorded the documents — by name, on every row and the case read. */
    requestedBy?: KycPerson | null;
    recordedBy?: KycPerson | null;
    /** N3-B: the record's id, null with no record. Absent from a server one release behind. */
    kycId?: string | null;
    kyc: {
        id: string;
        status: KycRowStatus;
        method: "MANUAL" | "DIGIO" | string;
        submittedAt: string | null;
        reviewedAt: string | null;
        reviewedById?: string | null;
        reviewNote?: string | null;
        rejectionReason: string | null;
        assignedToId?: string | null;
        assignedAt?: string | null;
        imagesPurgedAt?: string | null;
        /** Lot G (Q127/142): the five escalation columns; null while not escalated. */
        escalatedAt?: string | null;
        escalationSource?: KycEscalationSource | null;
        escalationReason?: string | null;
        escalatedToUserId?: string | null;
        escalatedById?: string | null;
        /** Lot N: the desk's ask and the recorder — null until either happens. */
        requestedAt?: string | null;
        requestedById?: string | null;
        requestedChannel?: KycRequestChannel | string | null;
        recordedById?: string | null;
        recordedVia?: string | null;
        govIdType: string | null;
        govIdFrontUrl: string | null;
        govIdBackUrl: string | null;
        panNumber: string | null;
        panFrontUrl: string | null;
        panSignatureUrl: string | null;
        addressProofType: string | null;
        addressProofUrl: string | null;
        selfieUrl: string | null;
        aadhaarFrontUrl: string | null;
        aadhaarBackUrl: string | null;
        panBackUrl: string | null;
        gstUrl: string | null;
        bankStatement: string | null;
        businessRegCertUrl?: string | null;
        directorIdUrl?: string | null;
        businessAddressProofUrl?: string | null;
        adAuthLetterUrl?: string | null;
        ngoRegCertUrl?: string | null;
        ngoAddressProofUrl?: string | null;
        ngoTaxExemptionCertUrl?: string | null;
        ngoOperationalOverviewUrl?: string | null;
        digioStatus: string | null;
        digioVerifiedAt: string | null;
        digioRequestId?: string | null;
        digioReferenceId?: string | null;
        /** The webhook as Digio sent it; the message is what the desk reads. */
        digioPayload?: { message?: string | null } | null;
    } | null;
    /** Lot D: on the case read only; E10-1: each row carries `reviewedBy { id, name }`. */
    documentReviews?: KycDocumentReview[];
    liveness?: KycLiveness | null;
}

/** `GET /publishers/kyc-queue` — `{ items, total, breached, slaHours }` since Lot A; Lot G adds `escalated` and `counts.escalated`. */
export interface WireKycQueue {
    items: WireKycRow[];
    total: number;
    breached: number;
    slaHours: number;
    /** Lot G: escalated cases across the queue with the escalated facet removed. */
    escalated?: number;
    /** Lot N: the desk's asks with nothing submitted yet — outside the submitted queue, counted with the facet forced on. */
    requested?: number;
    /** N3-B: the six states (+ `awaitingDocuments`), `escalated` and `requested`, each counted with the state facet removed. */
    counts?: Record<string, number | undefined>;
}

export interface KycQueue {
    cases: KycCase[];
    total: number;
    /** Across the whole queue the filter returned, not the page. */
    breached: number;
    /** The review SLA in hours, as ops set it. */
    slaHours: number;
    /** Lot G: escalated cases across the queue, whatever facet is applied — the chip's count. */
    escalated: number;
    /** Lot N: requested-and-not-submitted across the queue, whatever facet is applied — the chip's count. */
    requested: number;
    /** N3-B: parties per state, the chips' counts, whatever facet is applied. */
    counts: KycStateCounts;
}

/** The queue's facets, exactly as `kycQueueQuerySchema` parses them. */
export interface KycQueueFilter {
    /** N3-B: one of the six party states — the chips. `status` stays as its alias. */
    state?: KycQueueState;
    status?: KycRowStatus;
    /** N3-B: the publisher's name, display id, mobile, email or contact mobile. */
    q?: string;
    /** Only the self-onboarded: nobody from ADX has met them. */
    unassigned?: boolean;
    /** Lot D (Q119): who is working the case. */
    assignedTo?: "me" | "none";
    /** Lot D (Q129): the Digio facets — `stuck` is initiated over 24 h ago with no webhook. */
    method?: "MANUAL" | "DIGIO";
    digioStatus?: "pending" | "stuck";
    /** Lot G (Q127/142): only the escalated (true) or none of them (false). */
    escalated?: boolean;
    /** Lot N: only the desk's asks with nothing submitted yet (true) — rows outside the submitted queue — or none of them (false). */
    requested?: boolean;
    sort?: "oldest" | "newest";
}

export function buildKycQueueQuery(filter: KycQueueFilter = {}): string {
    const params = new URLSearchParams();
    if (filter.state) params.set("state", filter.state);
    if (filter.status) params.set("status", filter.status);
    if (filter.q?.trim()) params.set("q", filter.q.trim());
    if (filter.unassigned) params.set("unassigned", "true");
    if (filter.assignedTo) params.set("assignedTo", filter.assignedTo);
    if (filter.method) params.set("method", filter.method);
    if (filter.digioStatus) params.set("digioStatus", filter.digioStatus);
    if (filter.escalated !== undefined) params.set("escalated", String(filter.escalated));
    if (filter.requested !== undefined) params.set("requested", String(filter.requested));
    if (filter.sort) params.set("sort", filter.sort);
    return params.toString();
}

/* ------------------------------------------------------------------ */
/* Escalation — Lot G (Q127/142)                                        */
/* ------------------------------------------------------------------ */

export const ESCALATION_SOURCE_LABEL: Record<KycEscalationSource, string> = {
    AGE: "Age",
    FRAUD_LINK: "Fraud link",
    REVIEWER: "Reviewer",
};

/** The five escalation columns as the row carries them — on `kyc` for a publisher, on the row itself for an advertiser. */
export interface WireEscalationColumns {
    escalatedAt?: string | null;
    escalationSource?: KycEscalationSource | null;
    escalationReason?: string | null;
    escalatedToUserId?: string | null;
    escalatedById?: string | null;
}

/** G11-1: the two people the read names beside those columns. */
export interface WireEscalationPeople {
    escalatedTo?: KycPerson | null;
    escalatedBy?: KycPerson | null;
}

/**
 * A person as the desk prints them: the read's name, else the id — never
 * nothing for somebody who is on the case. Null for nobody.
 */
export function personLabel(person: KycPerson | null | undefined): string | null {
    if (!person) return null;
    return person.name?.trim() || person.id;
}

/**
 * The five columns as one object, or null while the case is not escalated.
 * Shared with the advertiser twin. G11-1: the people come from the read's
 * own `escalatedTo` / `escalatedBy` (`{ id, name }`); a row written before
 * the names were served still yields `{ id, name: null }` from the id
 * columns, so the chip prints the id rather than nothing.
 */
export function escalationOf(row: WireEscalationColumns | null | undefined, people: WireEscalationPeople | null | undefined = row as WireEscalationPeople | null | undefined): KycEscalation | null {
    if (!row?.escalatedAt) return null;
    const person = (named: KycPerson | null | undefined, id: string | null | undefined): KycPerson | null =>
        named ? { id: named.id, name: named.name ?? null } : id ? { id, name: null } : null;
    return {
        at: row.escalatedAt,
        source: row.escalationSource ?? "REVIEWER",
        reason: row.escalationReason ?? "",
        to: person(people?.escalatedTo, row.escalatedToUserId),
        by: person(people?.escalatedBy, row.escalatedById),
    };
}

/**
 * The "Escalated" pill on a queue row: the source, and who it went to —
 * named by the read (G11-1), the id when the label lookup found no name.
 * Null while not escalated, so the column can draw nothing.
 */
export function escalationChip(escalation: KycEscalation | null): StatusMeta | null {
    if (!escalation) return null;
    const source = ESCALATION_SOURCE_LABEL[escalation.source] ?? escalation.source;
    const who = personLabel(escalation.to);
    return { label: who ? `Escalated · ${source} → ${who}` : `Escalated · ${source}`, tone: "danger" };
}

/**
 * The hour at which the nightly sweep escalates a PENDING case on its own:
 * `kyc.escalationSlaMultiplier × kyc.reviewSlaHours` (Lot G, default 2 ×
 * 48). Null when the multiplier was not read, so the column says nothing
 * rather than guessing.
 */
export function autoEscalationHours(slaHours: number, multiplier: number | null | undefined): number | null {
    if (multiplier === null || multiplier === undefined || !Number.isFinite(multiplier) || multiplier < 1) return null;
    return Math.round(slaHours * multiplier);
}

/* ------------------------------------------------------------------ */
/* KYC from the desk — Lot N                                           */
/* ------------------------------------------------------------------ */

/** The columns the desk's ask and the recorder leave on a row — on `kyc` for a publisher, on the row itself for an advertiser or a print partner. */
export interface WireDeskColumns {
    requestedAt?: string | null;
    requestedById?: string | null;
    requestedChannel?: string | null;
    recordedById?: string | null;
    recordedVia?: string | null;
    submittedAt?: string | null;
}

/** The two people the reads name beside those columns. */
export interface WireDeskPeople {
    requestedBy?: KycPerson | null;
    recordedBy?: KycPerson | null;
}

const namedPerson = (named: KycPerson | null | undefined, id: string | null | undefined): KycPerson | null =>
    named ? { id: named.id, name: named.name ?? null } : id ? { id, name: null } : null;

/**
 * The desk's ask as one object, or null while nobody has asked. `open` is
 * REQUESTED as the server derives it — asked, nothing submitted since — so
 * a row that was asked for and then answered keeps the history but is no
 * longer "requested".
 */
export function requestOf(row: WireDeskColumns | null | undefined, people: WireDeskPeople | null | undefined = row as WireDeskPeople | null | undefined): KycRequest | null {
    if (!row?.requestedAt) return null;
    return {
        at: row.requestedAt,
        by: namedPerson(people?.requestedBy, row.requestedById),
        channel: row.requestedChannel === "DIGIO" ? "DIGIO" : "MANUAL",
        open: !row.submittedAt,
    };
}

/** Who recorded the documents and from where, or null before any submission (a row that was only asked for). */
export function recordedOf(row: WireDeskColumns | null | undefined, people: WireDeskPeople | null | undefined = row as WireDeskPeople | null | undefined): KycRecorded | null {
    if (!row || (!row.recordedVia && !row.recordedById)) return null;
    return { via: row.recordedVia ?? "SELF", by: namedPerson(people?.recordedBy, row.recordedById) };
}

export const REQUEST_CHANNEL_LABEL: Record<KycRequestChannel, string> = { DIGIO: "Digio", MANUAL: "manual" };

export const RECORDED_VIA_LABEL: Record<string, string> = {
    SELF: "Themselves, on the phone",
    AGENT: "An agent",
    DESK: "The desk",
    DIGIO: "Digio",
};

/** "KYC requested on 12 Sep 2026 by Priya (Digio)" — the line the party pages and the workbench headers print. */
export function requestLine(request: KycRequest | null, format: (iso: string) => string = formatDateTime): string | null {
    if (!request) return null;
    const who = personLabel(request.by);
    return `KYC requested on ${format(request.at)}${who ? ` by ${who}` : ""} (${REQUEST_CHANNEL_LABEL[request.channel]})`;
}

/** "The desk · Priya" — who put the documents on the row. */
export function recordedLine(recorded: KycRecorded | null): string | null {
    if (!recorded) return null;
    const who = personLabel(recorded.by);
    const via = RECORDED_VIA_LABEL[recorded.via] ?? recorded.via;
    return recorded.via === "SELF" ? via : who ? `${via} · ${who}` : via;
}

/** `POST …/request` — the channel and, trimmed, the note when there is one. */
export function kycRequestBody(channel: KycRequestChannel, note?: string): { channel: KycRequestChannel; note?: string } {
    const trimmed = note?.trim();
    return trimmed ? { channel, note: trimmed } : { channel };
}

/** What the party receives for each channel — the confirm names it before the desk commits. */
export function requestOutcome(channel: KycRequestChannel, party: string, hasAccount: boolean): string {
    const notice = hasAccount
        ? `${party} is told by email, SMS and a push that opens their KYC screen`
        : `${party} has no app account yet, so nobody is told — reach them another way`;
    return channel === "DIGIO"
        ? `A Digio identity check is opened on ${party}'s behalf and the link goes to them; ${notice}. Digio's answer lands on ADX's webhook.`
        : `${notice}, asking them to upload their documents in the app. The case reaches the queue when they do.`;
}

/** The 409 the request and the desk's recording answer once the party is verified. */
export const isAlreadyVerified = (cause: unknown): cause is ApiError =>
    cause instanceof ApiError && cause.status === 409 && cause.code === "KYC_ALREADY_VERIFIED";

/** The Digio session off the row, or null when nobody ever started one. */
function digioOf(kyc: NonNullable<WireKycRow["kyc"]> | null): KycDigio | null {
    if (!kyc || (kyc.method !== "DIGIO" && !kyc.digioRequestId)) return null;
    return {
        requestId: kyc.digioRequestId ?? null,
        referenceId: kyc.digioReferenceId ?? null,
        status: kyc.digioStatus ?? null,
        verifiedAt: kyc.digioVerifiedAt ?? null,
        message: kyc.digioPayload?.message ?? null,
    };
}

const GOV_ID: Record<string, string> = { AADHAAR: "Aadhaar", PASSPORT: "Passport", DRIVING_LICENCE: "Driving licence" };
const ADDRESS_PROOF: Record<string, string> = {
    UTILITY_BILL: "Utility bill",
    RENT_AGREEMENT: "Rent agreement",
    BANK_STATEMENT: "Bank statement",
};

/**
 * Every document column a publisher's row can hold, in the order the desk
 * reads them, with the name each is drawn under. The `field` is what
 * `PATCH …/documents/:field` and the re-upload ask name.
 */
export const PUBLISHER_KYC_FIELDS: { field: string; label: string }[] = [
    { field: "govIdFrontUrl", label: "Government ID · front" },
    { field: "aadhaarFrontUrl", label: "Aadhaar · front" },
    { field: "govIdBackUrl", label: "Government ID · back" },
    { field: "aadhaarBackUrl", label: "Aadhaar · back" },
    { field: "panFrontUrl", label: "PAN card" },
    { field: "panBackUrl", label: "PAN card · back" },
    { field: "panSignatureUrl", label: "PAN signature" },
    { field: "addressProofUrl", label: "Address proof" },
    { field: "gstUrl", label: "GST certificate" },
    { field: "bankStatement", label: "Bank statement" },
    { field: "selfieUrl", label: "Live selfie" },
    { field: "businessRegCertUrl", label: "Business registration certificate" },
    { field: "directorIdUrl", label: "Director's ID" },
    { field: "businessAddressProofUrl", label: "Business address proof" },
    { field: "adAuthLetterUrl", label: "Advertising authorisation letter" },
    { field: "ngoRegCertUrl", label: "NGO registration certificate" },
    { field: "ngoAddressProofUrl", label: "NGO address proof" },
    { field: "ngoTaxExemptionCertUrl", label: "NGO tax exemption certificate" },
    { field: "ngoOperationalOverviewUrl", label: "NGO operational overview" },
];

/** Lot N: the typed facts the publisher's desk record takes beside its tiles. */
export const PUBLISHER_DESK_FACTS = { panNumber: true, govIdType: true, addressProofType: true } as const;

/** What a field is called on the desk — for a review row whose tile may since have been purged. */
export function kycFieldLabel(field: string): string {
    return PUBLISHER_KYC_FIELDS.find((item) => item.field === field)?.label ?? field;
}

/** Hours left of the SLA the server measured: `slaHours - ageHours`. Negative once breached, 0 with nothing submitted. */
export function slaHoursLeftOf(ageHours: number | null | undefined, slaHours: number): number {
    if (ageHours === null || ageHours === undefined) return 0;
    return Math.floor(slaHours - ageHours);
}

const fileName = (url: string) => url.split("/").pop()?.split("?")[0] ?? url;

/** The SLA the row was measured against: the read's own since E7-3, else the queue's, else the platform default. */
export const DEFAULT_KYC_SLA_HOURS = 48;

export function shapeKycCase(row: WireKycRow, slaHours: number = row.slaHours ?? DEFAULT_KYC_SLA_HOURS): KycCase {
    const kyc = row.kyc;
    const uploaded = kyc?.submittedAt ? formatDateTime(kyc.submittedAt) : "—";

    const documents: KycDocument[] = [];
    if (kyc) {
        const govId = kyc.govIdType ? (GOV_ID[kyc.govIdType] ?? kyc.govIdType) : null;
        const proof = kyc.addressProofType ? (ADDRESS_PROOF[kyc.addressProofType] ?? kyc.addressProofType) : null;
        for (const { field, label } of PUBLISHER_KYC_FIELDS) {
            const url = (kyc as Record<string, unknown>)[field];
            if (typeof url !== "string" || !url) continue;
            const type =
                field === "govIdFrontUrl" && govId
                    ? `${label} (${govId})`
                    : field === "addressProofUrl" && proof
                      ? `${label} (${proof})`
                      : label;
            documents.push({ id: field, field, type, fileName: fileName(url), uploadedAt: uploaded, url });
        }
    }

    const checks: KycCheck[] = [];
    if (kyc?.panNumber) checks.push({ label: "PAN number", detail: kyc.panNumber, result: "manual" });
    if (row.gstin) checks.push({ label: "GSTIN", detail: row.gstin, result: "manual" });
    if (kyc?.method === "DIGIO") {
        checks.push({
            label: "Digio",
            detail: kyc.digioStatus ?? "pending",
            result: kyc.digioStatus === "approved" ? "pass" : kyc.digioStatus === "rejected" ? "fail" : "manual",
        });
    }
    if (kyc?.rejectionReason) checks.push({ label: "Previous rejection", detail: kyc.rejectionReason, result: "fail" });

    const rowStatus: KycRowStatus = kyc?.status ?? row.kycStatus;
    const ageHours = row.ageHours ?? null;

    return {
        id: row.id,
        publisherId: row.id,
        state: kycStateOf(row, kyc, row.kycStatus),
        kycId: row.kycId ?? kyc?.id ?? null,
        createdAt: row.createdAt,
        userId: row.userId ?? null,
        applicant: row.name,
        owner: row.contactName ?? row.name,
        businessType: row.type === "INDIVIDUAL" ? "Individual" : "Company",
        entityType: row.type,
        city: row.city ?? "—",
        submittedAt: uploaded,
        ageHours,
        slaBreached: row.slaBreached ?? (ageHours !== null && ageHours > slaHours),
        slaHoursLeft: slaHoursLeftOf(ageHours, slaHours),
        status: rowStatus,
        kycStatus: rowStatus,
        method: kyc?.method === "DIGIO" ? "DIGIO" : "MANUAL",
        digio: digioOf(kyc),
        documents,
        checks,
        agent: row.agent ? { name: row.agent.user.name, displayId: row.agent.displayId } : null,
        selfOnboarded: row.agent === null,
        rejectionReason: kyc?.rejectionReason ?? null,
        reviewNote: kyc?.reviewNote ?? null,
        reviewedById: kyc?.reviewedById ?? null,
        reviewedAt: kyc?.reviewedAt ?? null,
        assignedToId: kyc?.assignedToId ?? null,
        assignedAt: kyc?.assignedAt ?? null,
        reviewedBy: row.reviewedBy ?? (kyc?.reviewedById ? { id: kyc.reviewedById, name: null } : null),
        assignedTo: row.assignedTo ?? (kyc?.assignedToId ? { id: kyc.assignedToId, name: null } : null),
        documentReviews: row.documentReviews ?? [],
        liveness: row.liveness ?? null,
        imagesPurgedAt: kyc?.imagesPurgedAt ?? null,
        escalation: escalationOf(kyc, row),
        request: requestOf(kyc, row),
        recorded: recordedOf(kyc, row),
        mobile: row.mobile,
        displayId: row.displayId,
    };
}

/** The fields a case's reviews have flagged, with the note — what a re-upload asks for. */
export function flaggedFields(reviews: KycDocumentReview[]): { field: string; note: string | null }[] {
    return reviews.filter((review) => review.decision === "FLAGGED").map((review) => ({ field: review.field, note: review.note }));
}

export type DocumentDecision = "APPROVED" | "FLAGGED";

/** `PATCH …/documents/:field` — a flag must say why; the server refuses one without a note. */
export function documentDecisionBody(decision: DocumentDecision, note?: string): { decision: DocumentDecision; note?: string } {
    const trimmed = note?.trim();
    if (decision === "FLAGGED" && !trimmed) throw new Error("Say what is wrong with the document when flagging it.");
    return trimmed ? { decision, note: trimmed } : { decision };
}

/** `POST /publishers/:id/kyc/review` — the reason travels with a rejection, the note with either. */
export function reviewBody(status: "VERIFIED" | "REJECTED", note?: string): Record<string, string> {
    const trimmed = note?.trim();
    if (status === "REJECTED" && !trimmed) throw new Error("Add a reviewer note before rejecting.");
    return {
        status,
        ...(status === "REJECTED" ? { rejectionReason: trimmed! } : {}),
        ...(trimmed ? { reviewNote: trimmed } : {}),
    };
}

/** The 409 the liveness gate answers, so the desk can explain it rather than toast it. */
export const isLivenessRequired = (cause: unknown): cause is ApiError =>
    cause instanceof ApiError && cause.status === 409 && cause.code === "LIVENESS_REQUIRED";

function live() {
    if (!isLive("kyc")) {
        throw new Error("KYC is read from the API; connect the console to the ADX backend first.");
    }
    return http;
}

/**
 * `PUT /publishers/kyc-queue/:publisherId` — the desk's recording: the
 * document columns as `/files/:id` URLs the admin uploaded under purpose
 * KYC on the publisher's behalf, and the three typed facts. Every field is
 * optional; only what is sent is written.
 */
export interface KycDeskBody {
    panNumber?: string;
    govIdType?: string;
    addressProofType?: string;
    [documentField: string]: string | undefined;
}

export const kycService = {
    /** The queue, breaches first unless a sort is named. */
    queue: async (filter: KycQueueFilter = {}): Promise<KycQueue> => {
        if (!isLive("kyc")) return { cases: [], total: 0, breached: 0, slaHours: 0, escalated: 0, requested: 0, counts: shapeKycStateCounts(null) };
        const query = buildKycQueueQuery(filter);
        const page = await http.get<WireKycQueue>(`/publishers/kyc-queue${query ? `?${query}` : ""}`);
        const cases = page.items.map((row) => shapeKycCase(row, page.slaHours));
        const escalated = page.escalated ?? page.counts?.escalated ?? cases.filter((item) => item.escalation).length;
        const requested = page.requested ?? page.counts?.requested ?? cases.filter((item) => item.request?.open).length;
        return {
            cases,
            total: page.total,
            breached: page.breached,
            slaHours: page.slaHours,
            escalated,
            requested,
            counts: shapeKycStateCounts(page.counts, { escalated, requested }),
        };
    },

    /** The queue as a flat list, for the screens that only need the rows. */
    list: async (filter: KycQueueFilter = {}): Promise<KycCase[]> => (await kycService.queue(filter)).cases,

    /**
     * One case for the workbench, or null when the id names nobody. E7-3:
     * the read carries its own `ageHours`, `slaBreached` and `slaHours`,
     * measured by the server on the queue's rule, so nothing is read beside it.
     */
    get: async (publisherId: string): Promise<KycCase | null> => {
        if (!isLive("kyc")) return null;
        try {
            return shapeKycCase(await http.get<WireKycRow>(`/publishers/kyc-queue/${publisherId}`));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** The desk asks Digio again for this publisher; they are told to open the app. 409 once verified; 503 while the provider is off. */
    restartDigio: (publisherId: string) =>
        live().post<{ kycId: string; validTill: string; digioStatus: "pending"; notified: boolean }>(
            `/publishers/kyc-queue/${publisherId}/digio/restart`,
            {}
        ),

    /** The decision. The note is kept on the record beside who made it; 409 LIVENESS_REQUIRED on a manual-path VERIFIED with no video. */
    review: (publisherId: string, status: "VERIFIED" | "REJECTED", note?: string) =>
        live().post<unknown>(`/publishers/${publisherId}/kyc/review`, reviewBody(status, note)),

    /** Lot D (Q42): one tile approved or flagged, with what the reviewer said. */
    reviewDocument: (publisherId: string, field: string, decision: DocumentDecision, note?: string): Promise<KycDocumentReview> =>
        live().patch<KycDocumentReview>(`/publishers/kyc-queue/${publisherId}/documents/${field}`, documentDecisionBody(decision, note)),

    /** Lot D (Q42): the flagged fields are asked for again; the case goes NEEDS_INFO and the publisher is told which. */
    requestReupload: (publisherId: string, fields: string[], note: string) =>
        live().post<{ status: KycRowStatus; flagged: { field: string; note: string | null }[] }>(
            `/publishers/kyc-queue/${publisherId}/request-reupload`,
            { fields, note: note.trim() }
        ),

    /** Lot D (Q119): who is working the case — `me`, an admin's id, or null to clear. */
    assign: (publisherId: string, adminUserId: string | "me" | null) =>
        live().patch<{ publisherId: string; assignedToId: string | null }>(`/publishers/kyc-queue/${publisherId}/assign`, { adminUserId }),

    /** The same, over a selection. */
    assignMany: (ids: string[], adminUserId: string | "me" | null) =>
        live().post<{ assigned: number; adminUserId: string | null }>("/publishers/kyc-queue/assign", { ids, adminUserId }),

    /** Lot G (Q127/142): the reviewer hands the case to Compliance with a reason; they are told. `KYC_ESCALATED`. 409 decided or already escalated. */
    escalate: async (publisherId: string, reason: string): Promise<KycCase> => {
        const trimmed = reason.trim();
        if (!trimmed) throw new Error("Say why the case is being escalated.");
        return shapeKycCase(await live().post<WireKycRow>(`/publishers/kyc-queue/${publisherId}/escalate`, { reason: trimmed }));
    },

    /**
     * Lot N: the desk asks the publisher for their KYC — DIGIO opens a
     * session on their behalf, MANUAL only tells them; `KYC_REQUESTED` when
     * they have an app account (`notified`). 409 `KYC_ALREADY_VERIFIED`.
     */
    request: (publisherId: string, channel: KycRequestChannel, note?: string) =>
        live().post<{ kyc: unknown; digio: { kycId: string; validTill: string } | null; notified: boolean }>(
            `/publishers/kyc-queue/${publisherId}/request`,
            kycRequestBody(channel, note)
        ),

    /** N3-C: the one click — the same route with no body; the server defaults the channel to DIGIO. Behind `kyc.edit`. */
    requestDigio: (publisherId: string) =>
        live().post<{ kyc: unknown; digio: { kycId: string; validTill: string } | null; notified: boolean }>(`/publishers/kyc-queue/${publisherId}/request`),

    /** Lot N: the desk records the documents on the publisher's behalf — PENDING, `recordedVia DESK`. 409 `KYC_ALREADY_VERIFIED`; 400 `EMPTY_RESUBMISSION` while NEEDS_INFO with no tile sent. */
    recordAtDesk: (publisherId: string, body: KycDeskBody) =>
        live().put<{ id: string; status: KycRowStatus }>(`/publishers/kyc-queue/${publisherId}`, body),
};

/**
 * Round-robin: the selected cases dealt across the reviewers in turn, so
 * "Assign reviewers" is one bulk call per admin rather than one per case.
 * Pure, so the test can pin the dealing.
 */
export function dealCases(caseIds: string[], reviewerIds: string[]): { adminUserId: string; ids: string[] }[] {
    if (reviewerIds.length === 0 || caseIds.length === 0) return [];
    const hands = new Map<string, string[]>(reviewerIds.map((id) => [id, []]));
    caseIds.forEach((caseId, index) => hands.get(reviewerIds[index % reviewerIds.length])!.push(caseId));
    return [...hands.entries()].filter(([, ids]) => ids.length > 0).map(([adminUserId, ids]) => ({ adminUserId, ids }));
}
