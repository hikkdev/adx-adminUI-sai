import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { compareMoney } from "@/lib/format";
import type { KycRowStatus, Order, StatusMeta } from "@/types";
import type { Money, PayoutRailName, Timestamp, WalletSnapshot, WithdrawalStatus } from "./finance";

/**
 * Print partners and their jobs — Lot B (Q50, package B4b), wired to the
 * backend `print-partners` module; Lot H (Q147) grows the desk's other half.
 *
 * A print partner is a **payee**: an account ops creates switched off, a row
 * ops keeps at the desk, and a wallet opened at creation. One job per order;
 * approving the job's cost posts PRINT_COST into the wallet net of TDS under
 * 194C, and the money leaves through the ordinary withdrawal ladder.
 *
 * Lot H: ops **activate** the account and the partner signs in by OTP on
 * their own phone. From the app the partner keeps a **rate card** (a private
 * file and/or structured rows) or opts to receive **quote requests**; ops
 * raise a request from the order's Printing card, the partners in reach quote
 * until the deadline, and the **lowest quote is awarded** unless ops name
 * another with a note. The partner walks the job to handover by scanning the
 * agent's pickup code, raises their own withdrawals and uploads the month's
 * invoice; every one of those moves reads back here.
 *
 * No fixture fallback: there has never been a seeded partner or job, so
 * there is no id to cross with. With the API off the screens say so.
 */

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

/** One line of the partner's rate card: what, per what, at how much. */
export interface RateCardRow {
    material: string;
    sizeClass?: string | null;
    unit: string;
    ratePerUnit: Money;
    minQty?: number | null;
    notes?: string | null;
}

/** `rateCard` on the partner row and `GET /print-partners/:id/rate-card`. */
export interface RateCardState {
    hasRateCard: boolean;
    fileId: string | null;
    /** `/api/v1/files/:id` — private, opened through the private-file viewer. */
    fileUrl: string | null;
    updatedAt: Timestamp | null;
    rows: RateCardRow[];
}

/** A private file of the partner's — the month's invoice on the ledger read. */
export interface PartnerFile {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    /** `/api/v1/files/:id` — private. */
    url: string;
    createdAt: Timestamp;
}

export interface PrintPartner {
    id: string;
    /** PRT-1209-2601, from the identifier series. */
    displayId: string | null;
    /** The PARTNER account — what `POST /finance/payout-methods` names; switched on by activation (Lot H). */
    userId: string;
    name: string;
    legalName: string | null;
    gstin: string | null;
    panNumber: string | null;
    contactName: string | null;
    mobile: string;
    email: string | null;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    capabilities: string[];
    /** Feet, as a decimal string. */
    maxWidthFt: Money | null;
    turnaroundDays: number | null;
    isActive: boolean;
    notes: string | null;
    /** Lot H: when ops switched the account on — the partner signs in by OTP from then. Null until then. */
    activatedAt: Timestamp | null;
    activatedById: string | null;
    /** Lot H: whether an AUTO quote request may reach this shop. The partner's own switch. */
    acceptsQuoteRequests: boolean;
    /** Lot H: the rate card as it stands — the file, the rows, or neither. */
    rateCard: RateCardState;
    /** Lot H: the latest monthly invoice the partner uploaded; every one is on the ledger read. */
    invoiceUploadFileId: string | null;
    /** G13-B: when the partner last signed in to the app — null until they have; on the list rows too. Absent on a server one release behind. */
    lastLoginAt?: Timestamp | null;
    /**
     * Lot N: the KYC mirror on the row, and the record's four facts — null
     * before any record (nothing asked, nothing submitted). Absent on a
     * server older than the print partner's KYC.
     */
    kycStatus?: KycRowStatus;
    kyc?: PartnerKycSummary | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

/** Lot N: what the partner read and the roster rows carry of the KYC record — N3-B: `state` and `kycId` beside the four, never null now (`status` null before a record). */
export interface PartnerKycSummary {
    status: KycRowStatus | null;
    submittedAt: Timestamp | null;
    method: "MANUAL" | "DIGIO" | string | null;
    /** The desk asked; `submittedAt` null beside it means nothing has come back. */
    requestedAt: Timestamp | null;
    requestedChannel?: string | null;
    state?: string | null;
    kycId?: string | null;
}

/** G13-B: an invoice on file with the month it covers and who recorded it — `GET /print-partners/:id/invoices`. */
export interface PartnerInvoice extends PartnerFile {
    /** `YYYY-MM`; null for a file never recorded against a month. */
    month: string | null;
    recordedBy: "PARTNER" | "ADMIN" | null;
}

/** `PUT /print-partners/:id/rate-card` — `rateCardSchema` exactly: a file, rows, or both. */
export interface RateCardInput {
    fileId?: string | null;
    rows: RateCardRow[];
}

/** `POST /print-partners/:id/invoices` — a PARTNER_INVOICE upload and the month it covers. */
export interface PartnerInvoiceInput {
    fileId: string;
    /** `YYYY-MM`. */
    month: string;
}

export const INVOICE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The server's own refusals on a rate card, said before the round trip. */
export function rateCardProblem(input: RateCardInput): string | null {
    if (!input.fileId && input.rows.length === 0) return "A rate card needs a file or at least one row.";
    if (input.rows.length > 200) return "At most 200 rows.";
    for (const [index, row] of input.rows.entries()) {
        if (!row.material.trim()) return `Row ${index + 1} needs a material.`;
        if (!row.unit.trim()) return `Row ${index + 1} needs a unit.`;
        if (!/^\d+(\.\d{1,2})?$/.test(row.ratePerUnit.trim()) || Number(row.ratePerUnit) <= 0) return `Row ${index + 1} needs a rate per unit above zero.`;
    }
    return null;
}

/** G13-B: the roster's Last sign-in column — "never" until the partner has signed in, "—" on a server that does not answer it. */
export function lastSignInLabel(partner: Pick<PrintPartner, "lastLoginAt" | "activatedAt">, format: (iso: string) => string): string {
    if (partner.lastLoginAt === undefined) return "—";
    if (partner.lastLoginAt === null) return partner.activatedAt ? "never" : "not activated";
    return format(partner.lastLoginAt);
}

/** What ops types at the desk. Everything but the name and the mobile is optional. */
export interface PrintPartnerInput {
    name: string;
    mobile: string;
    legalName?: string | null;
    gstin?: string | null;
    panNumber?: string | null;
    contactName?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    capabilities?: string[];
    maxWidthFt?: Money | null;
    turnaroundDays?: number | null;
    notes?: string | null;
}

/** Everything but the mobile — the account's identity — which cannot change. */
/** `PATCH /print-partners/:id` — anything but the mobile; G13-B: `acceptsQuoteRequests` too, for a shop that never activates. */
export type PrintPartnerPatch = Partial<Omit<PrintPartnerInput, "mobile"> & { acceptsQuoteRequests: boolean }>;

export type PrintJobStatus = "REQUESTED" | "ACCEPTED" | "PRINTING" | "READY" | "COLLECTED" | "CANCELLED";

/** The ladder, forward only. A rung may be skipped and never walked back. */
export const PRINT_JOB_LADDER: readonly PrintJobStatus[] = ["REQUESTED", "ACCEPTED", "PRINTING", "READY", "COLLECTED"];

export interface PrintJob {
    id: string;
    orderId: string;
    printPartnerId: string;
    status: PrintJobStatus;
    quotedCost: Money | null;
    actualCost: Money | null;
    specs: Record<string, unknown> | null;
    requestedAt: Timestamp;
    readyAt: Timestamp | null;
    collectedAt: Timestamp | null;
    costApprovedByUserId: string | null;
    costApprovedAt: Timestamp | null;
    ledgerTransactionId: string | null;
    notes: string | null;
    /* Lot H: the partner's own moves from the app. */
    /** The partner tapped accept (REQUESTED → ACCEPTED). */
    partnerAcceptedAt: Timestamp | null;
    /** The partner declined, with the reason ops were told; the job is CANCELLED and an awarded request reopened. */
    partnerDeclinedAt: Timestamp | null;
    declineReason: string | null;
    /** The quote this job was opened on, when it came from a request rather than the desk. */
    awardedQuoteId: string | null;
    /** The partner scanned the agent's pickup code — the shop's own record of the handover. */
    handoverConfirmedAt: Timestamp | null;
    handoverQrId: string | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    /** The shop the agent collects from. On the order's job read, not on the partner's list. */
    partner?: {
        id: string;
        name: string;
        contactName: string | null;
        mobile: string;
        address: string | null;
        city: string | null;
        latitude: number | null;
        longitude: number | null;
    };
}

/** `POST /orders/:id/print-job/approve-cost` — the movement, and its tax split. */
export interface PrintCostApproval {
    job: PrintJob;
    gross: Money;
    taxWithheld: Money;
    taxRatePct: Money;
    taxSection: string;
    net: Money;
    walletId: string;
    /** False when the cost had already been approved and this returned the first movement. */
    posted: boolean;
}

/** `GET /print-partners/:id/ledger` — the partner's money and work in one read. */
export interface PrintPartnerLedger {
    partner: PrintPartner;
    walletId: string | null;
    balances: WalletSnapshot | null;
    entries: {
        id: string;
        type: string;
        amount: Money;
        balanceAfter: Money;
        orderId: string | null;
        reference: string | null;
        note: string | null;
        createdAt: Timestamp;
    }[];
    withdrawals: {
        id: string;
        reference: string;
        amount: Money;
        netAmount: Money;
        status: WithdrawalStatus;
        rail: PayoutRailName | null;
        railReference: string | null;
        requestedAt: Timestamp;
        paidAt: Timestamp | null;
    }[];
    jobs: PrintJob[];
    jobCounts: Partial<Record<PrintJobStatus, number>>;
    /** Lot H: every monthly invoice the partner uploaded, newest first — private files. */
    invoices: PartnerFile[];
}

/* ---------------- Lot H: quote requests ---------------- */

export type PrintQuoteRequestStatus = "OPEN" | "AWARDED" | "CANCELLED" | "EXPIRED";
export type PrintQuoteStatus = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

/** One partner's quote on a request, as the desk reads it — with the partner named and `lowest` marked. */
export interface PrintQuote {
    id: string;
    requestId: string;
    printPartnerId: string;
    amount: Money;
    turnaroundDays: number;
    note: string | null;
    status: PrintQuoteStatus;
    submittedAt: Timestamp;
    partner: {
        id: string;
        displayId: string | null;
        name: string;
        city: string | null;
        /** The "asked first" of the owner's mechanics: a rate-card partner wins a tie. */
        hasRateCard: boolean;
        isActive: boolean;
    };
    /** True on exactly one standing quote — the one the award takes by default. */
    lowest: boolean;
}

/** `GET /orders/:id/print-quote-request` — the latest request, every quote ranked. */
export interface PrintQuoteRequest {
    id: string;
    orderId: string;
    specs: Record<string, unknown>;
    city: string | null;
    deadlineAt: Timestamp;
    status: PrintQuoteRequestStatus;
    inviteMode: "AUTO" | "MANUAL";
    invitedPartnerIds: string[];
    /** The nightly job re-invited once, deadline pushed by 48 h. Null when it never had to. */
    reinvitedAt: Timestamp | null;
    awardedQuoteId: string | null;
    awardNote: string | null;
    /** The standing quote the award takes with no `quoteId`; null with nothing standing. */
    lowestQuoteId: string | null;
    /** Standing quotes ranked first (lowest, shorter turnaround, rate card, first in), then the decided ones. */
    quotes: PrintQuote[];
    createdById: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

/**
 * G13-B: one row of `GET /print-quote-requests` — the desk's list across
 * orders on the list contract, OPEN first and nearest deadline first. The
 * order is joined (null when it is gone), the quotes are counted rather
 * than listed, and the lowest standing one is named.
 */
export interface PrintQuoteRequestRow {
    id: string;
    orderId: string;
    order: { id: string; status: string; campaignName: string | null; site: { id: string; title: string; city: string | null } } | null;
    status: PrintQuoteRequestStatus;
    city: string | null;
    deadlineAt: Timestamp;
    inviteMode: "AUTO" | "MANUAL";
    invitedCount: number;
    reinvitedAt: Timestamp | null;
    standingQuotes: number;
    lowest: { quoteId: string; amount: Money; turnaroundDays: number; partner: { id: string; name: string } } | null;
    awardedQuoteId: string | null;
    /** G13-B: why ops cancelled it; null unless CANCELLED. */
    cancelReason: string | null;
    createdAt: Timestamp;
}

export interface PrintQuoteRequestPage {
    items: PrintQuoteRequestRow[];
    total: number;
    page: number;
    pageSize: number;
    counts: Partial<Record<PrintQuoteRequestStatus, number>>;
}

export interface PrintQuoteRequestQuery {
    status?: readonly PrintQuoteRequestStatus[];
    /** Contains, case-insensitive, on the order id or the city. */
    q?: string;
    page?: number;
    pageSize?: number;
}

/** `?status=&q=&page&pageSize` for `GET /print-quote-requests`, blanks left off. */
export function quoteRequestsPath(query: PrintQuoteRequestQuery = {}): string {
    const params = new URLSearchParams();
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    return `/print-quote-requests?${params.toString()}`;
}

/** Whether the desk offers Cancel: only an OPEN request; an awarded one is undone through the job's decline. */
export const canCancelRequest = (request: Pick<PrintQuoteRequestRow, "status">): boolean => request.status === "OPEN";

/** `POST /orders/:id/print-quote-request` — the request plus who was invited. */
export interface PrintQuoteRequestCreated extends PrintQuoteRequest {
    invited: { id: string; name: string; city: string | null; hasRateCard: boolean }[];
}

export interface QuoteRequestInput {
    specs: Record<string, unknown>;
    /** ISO instant; the backend defaults to now + 48 h. */
    deadlineAt?: string;
    /** AUTO: active partners accepting requests in the city or within 50 km, rate-card partners first. */
    invite: "AUTO" | string[];
}

/** `{}` takes the lowest; a `quoteId` other than the lowest needs the `note`. */
export interface AwardInput {
    quoteId?: string;
    note?: string;
}

export interface AwardResult {
    request: PrintQuoteRequest;
    job: PrintJob;
    quote: PrintQuote;
    /** True when ops passed over the lowest quote. */
    overridden: boolean;
}

/** `GET /print-partners/:id/quotes` — the partner's quote history, newest first. */
export interface PartnerQuoteHistoryRow {
    id: string;
    requestId: string;
    orderId: string;
    amount: Money;
    turnaroundDays: number;
    note: string | null;
    status: PrintQuoteStatus;
    submittedAt: Timestamp;
    request: { status: PrintQuoteRequestStatus; deadlineAt: Timestamp; awarded: boolean };
}

/** The window every request gets when ops name no deadline — the backend's `DEFAULT_QUOTE_WINDOW_HOURS`. */
export const DEFAULT_QUOTE_WINDOW_HOURS = 48;

/** How far an AUTO invite reaches beyond the order's city — the backend's `AUTO_INVITE_RADIUS_KM`. */
export const AUTO_INVITE_RADIUS_KM = 50;

export interface PrintPartnerPage {
    items: PrintPartner[];
    total: number;
    page: number;
    pageSize: number;
    counts: { ACTIVE?: number; INACTIVE?: number };
}

export interface PrintPartnerQuery {
    q?: string;
    city?: string;
    active?: boolean;
    page?: number;
    pageSize?: number;
}

/* ------------------------------------------------------------------ */
/* Live gate                                                           */
/* ------------------------------------------------------------------ */

function mutable() {
    if (!isLive("printPartners")) {
        throw new Error("Print partners read the API; connect the console to the ADX backend before writing.");
    }
    return http;
}

/** The query string `GET /print-partners` takes, with nothing sent that was not asked for. */
export function partnersPath(query: PrintPartnerQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.city?.trim()) params.set("city", query.city.trim());
    if (query.active !== undefined) params.set("active", String(query.active));
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    return `/print-partners?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

export const printPartnerService = {
    list: (query: PrintPartnerQuery = {}) => http.get<PrintPartnerPage>(partnersPath(query)),

    /** A 404 is "no such partner", which the page renders as its own not-found. */
    get: async (id: string): Promise<PrintPartner | null> => {
        try {
            return await http.get<PrintPartner>(`/print-partners/${id}`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    create: (body: PrintPartnerInput) => mutable().post<PrintPartner>("/print-partners", body),

    update: (id: string, patch: PrintPartnerPatch) => mutable().patch<PrintPartner>(`/print-partners/${id}`, patch),

    /** Off the roster: no new job may name it. Jobs already open still run and are still paid. */
    deactivate: (id: string, reason?: string) =>
        mutable().post<PrintPartner>(`/print-partners/${id}/deactivate`, reason?.trim() ? { reason: reason.trim() } : {}),

    reactivate: (id: string) => mutable().post<PrintPartner>(`/print-partners/${id}/reactivate`),

    /**
     * Lot H: the account switched on. The partner is told by SMS that the ADX
     * app now takes this number and signs in by OTP from then. Idempotent —
     * `activated` is false the second time; 409 for a partner off the roster.
     */
    activate: (id: string) => mutable().post<PrintPartner & { activated: boolean }>(`/print-partners/${id}/activate`),

    ledger: (id: string, limit = 100) => http.get<PrintPartnerLedger>(`/print-partners/${id}/ledger?limit=${limit}`),

    /** Lot H: the rate card on its own, for a fresh read after the partner changes it. */
    rateCard: (id: string) => http.get<RateCardState & { partnerId: string }>(`/print-partners/${id}/rate-card`),

    /**
     * G13-B: the desk sets the card on the partner's behalf — for a shop
     * that never activates. `rateCardSchema` exactly; the file the
     * partner's own or the admin's PARTNER_RATE_CARD upload. Audited
     * `PARTNER_RATE_CARD_UPDATED` with `onBehalf: true`.
     */
    setRateCard: (id: string, body: RateCardInput) =>
        mutable().put<RateCardState & { partnerId: string }>(`/print-partners/${id}/rate-card`, body),

    /** G13-B: an invoice recorded on the partner's behalf — a PARTNER_INVOICE upload and its month. 201. */
    recordInvoice: (id: string, body: PartnerInvoiceInput) =>
        mutable().post<{ fileId: string; month: string; url: string }>(`/print-partners/${id}/invoices`, body),

    /** G13-B: every invoice on file with its month — the partner's own and the ones recorded on their behalf. */
    invoicesFor: async (id: string): Promise<PartnerInvoice[]> => (await http.get<PartnerInvoice[]>(`/print-partners/${id}/invoices`)) ?? [],

    /** Lot H: what this shop has quoted, newest first. */
    quotesFor: (id: string) => http.get<PartnerQuoteHistoryRow[]>(`/print-partners/${id}/quotes`),

    /* ---------------- Lot H: the order's quote request ---------------- */

    /** Null rather than 404 when no request was ever raised on this order. */
    quoteRequestForOrder: async (orderId: string): Promise<PrintQuoteRequest | null> => {
        try {
            return await http.get<PrintQuoteRequest>(`/orders/${orderId}/print-quote-request`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** Printable order, no live job, no OPEN request. 409 NO_PARTNERS_IN_REACH when AUTO finds nobody. */
    requestQuotes: (orderId: string, body: QuoteRequestInput) =>
        mutable().post<PrintQuoteRequestCreated>(`/orders/${orderId}/print-quote-request`, body),

    /** The lowest by default; another only with a note (400 NOTE_REQUIRED). Opens the job. */
    award: (orderId: string, body: AwardInput = {}) =>
        mutable().post<AwardResult>(`/orders/${orderId}/print-quote-request/award`, body),

    /**
     * G13-B: the desk's list across orders in one read — `GET
     * /print-quote-requests` on the list contract (ADMIN, behind
     * `partners.quotes`), OPEN first and nearest deadline first. The
     * per-order fan-out this replaced is gone.
     */
    quoteRequests: async (query: PrintQuoteRequestQuery = {}): Promise<PrintQuoteRequestPage> => {
        const page = await http.get<Partial<PrintQuoteRequestPage>>(quoteRequestsPath(query));
        return {
            items: page.items ?? [],
            total: page.total ?? 0,
            page: page.page ?? query.page ?? 1,
            pageSize: page.pageSize ?? query.pageSize ?? 100,
            counts: page.counts ?? {},
        };
    },

    /**
     * G13-B: an OPEN request cancelled with a reason — the quotes stay as
     * the record of who bid, every invited partner is told, and anything
     * but OPEN is a 409 (an awarded request is undone through the job's
     * decline). Audited `PRINT_QUOTE_REQUEST_CANCELLED`.
     */
    cancelQuoteRequest: (orderId: string, reason: string) =>
        mutable().post<PrintQuoteRequest>(`/orders/${orderId}/print-quote-request/cancel`, { reason: reason.trim() }),

    /* ---------------- The order's job ---------------- */

    /** Null rather than 404 when nobody is printing this order. */
    jobForOrder: async (orderId: string): Promise<PrintJob | null> => {
        try {
            return await http.get<PrintJob>(`/orders/${orderId}/print-job`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /** One per order, at a partner on the roster, once the order has reached PENDING_PRINT. */
    openJob: (orderId: string, body: { printPartnerId: string; quotedCost?: Money | null; notes?: string | null }) =>
        mutable().post<PrintJob>(`/orders/${orderId}/print-job`, body),

    /** A rung up the ladder, the actual cost, or a note. Never a rung down. */
    updateJob: (orderId: string, body: { status?: PrintJobStatus; actualCost?: Money | null; notes?: string | null }) =>
        mutable().patch<PrintJob>(`/orders/${orderId}/print-job`, body),

    /** The money: READY or COLLECTED with an actual cost above zero. Idempotent on the job. */
    approveCost: (orderId: string) => mutable().post<PrintCostApproval>(`/orders/${orderId}/print-job/approve-cost`),
};

/* ------------------------------------------------------------------ */
/* Display metadata                                                    */
/* ------------------------------------------------------------------ */

export const PRINT_JOB_STATUS_META: Record<PrintJobStatus, StatusMeta> = {
    REQUESTED: { label: "Requested", tone: "warning" },
    ACCEPTED: { label: "Accepted", tone: "info" },
    PRINTING: { label: "Printing", tone: "info" },
    READY: { label: "Ready to collect", tone: "success" },
    COLLECTED: { label: "Collected", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/**
 * The rungs a job may still move to: everything above where it stands, and
 * CANCELLED until the cost is approved. A CANCELLED job moves nowhere — open
 * a new one.
 */
export function nextJobStatuses(job: Pick<PrintJob, "status" | "costApprovedAt">): PrintJobStatus[] {
    if (job.status === "CANCELLED") return [];
    const at = PRINT_JOB_LADDER.indexOf(job.status);
    const above = PRINT_JOB_LADDER.slice(at + 1);
    return job.costApprovedAt ? above : [...above, "CANCELLED"];
}

/** Whether `approve-cost` would be accepted: READY or COLLECTED, a cost above zero, not yet approved. */
export function canApproveCost(job: Pick<PrintJob, "status" | "actualCost" | "costApprovedAt">): boolean {
    if (job.costApprovedAt) return false;
    if (job.status !== "READY" && job.status !== "COLLECTED") return false;
    return compareMoney(job.actualCost, "0") > 0;
}

/** "Flex, vinyl, backlit" for a chip row; "—" for a shop that listed none. */
export const capabilitiesLine = (partner: Pick<PrintPartner, "capabilities">): string =>
    partner.capabilities.length ? partner.capabilities.join(", ") : "—";

/* ------------------------------------------------------------------ */
/* Lot H: the account                                                  */
/* ------------------------------------------------------------------ */

/**
 * Whether the shop can sign in.
 *
 * INVITED is a partner on the roster whose account ops have not switched on
 * yet — it exists as a payee, and nothing more; ACTIVE is one ops activated
 * (the SMS went out; OTP sign-in answers). OFF is off the roster, sessions
 * ended. The wire carries no last sign-in, so an activated partner reads
 * ACTIVE whether or not they have opened the app yet.
 */
export type SignInState = "ACTIVE" | "INVITED" | "OFF";

export function signInState(partner: Pick<PrintPartner, "isActive" | "activatedAt">): SignInState {
    if (!partner.isActive) return "OFF";
    return partner.activatedAt ? "ACTIVE" : "INVITED";
}

export const SIGN_IN_STATE_META: Record<SignInState, StatusMeta> = {
    ACTIVE: { label: "Active", tone: "success" },
    INVITED: { label: "Invited", tone: "warning" },
    OFF: { label: "Off the roster", tone: "neutral" },
};

/** `POST /print-partners/:id/activate` is accepted: on the roster, not yet activated. */
export const canActivate = (partner: Pick<PrintPartner, "isActive" | "activatedAt">): boolean =>
    partner.isActive && partner.activatedAt === null;

/**
 * Lot N: the 409 activation answers while `kyc.printPartnerActivationRequiresKyc`
 * is on and the partner's KYC is not VERIFIED — the desk records or requests
 * it first. The page explains it rather than toasting a code.
 */
export const isKycRequired = (cause: unknown): cause is ApiError =>
    cause instanceof ApiError && cause.status === 409 && cause.code === "KYC_REQUIRED";

/** What the partner did on the job from the app, as one line for a table cell; null when nothing yet. */
export function partnerMovesLine(
    job: Pick<PrintJob, "partnerAcceptedAt" | "partnerDeclinedAt" | "declineReason" | "handoverConfirmedAt">
): string | null {
    const parts: string[] = [];
    if (job.partnerAcceptedAt) parts.push("accepted");
    if (job.partnerDeclinedAt) parts.push(job.declineReason ? `declined — ${job.declineReason}` : "declined");
    if (job.handoverConfirmedAt) parts.push("handover confirmed by scan");
    return parts.length ? parts.join(" · ") : null;
}

/* ------------------------------------------------------------------ */
/* Lot H: the quote desk                                               */
/* ------------------------------------------------------------------ */

export const QUOTE_REQUEST_STATUS_META: Record<PrintQuoteRequestStatus, StatusMeta> = {
    OPEN: { label: "Open", tone: "warning" },
    AWARDED: { label: "Awarded", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
    EXPIRED: { label: "Expired", tone: "danger" },
};

export const QUOTE_STATUS_META: Record<PrintQuoteStatus, StatusMeta> = {
    SUBMITTED: { label: "Quoted", tone: "info" },
    ACCEPTED: { label: "Awarded", tone: "success" },
    REJECTED: { label: "Passed over", tone: "neutral" },
    WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

/** The quotes still in the running, in the backend's ranking order. */
export const standingQuotes = (request: Pick<PrintQuoteRequest, "quotes">): PrintQuote[] =>
    request.quotes.filter((quote) => quote.status === "SUBMITTED");

/** The quote the award takes with no `quoteId` — the backend's `lowestQuoteId`, else the first standing one. */
export function defaultAward(request: Pick<PrintQuoteRequest, "quotes" | "lowestQuoteId">): PrintQuote | null {
    const standing = standingQuotes(request);
    return standing.find((quote) => quote.id === request.lowestQuoteId) ?? standing[0] ?? null;
}

/**
 * The award rule, the console's copy of the backend's: the lowest needs no
 * note; any other standing quote needs one saying why. `null` when the body
 * would be refused — nothing standing, a quote that is not standing, or a
 * non-lowest quote with no note.
 */
export function awardBody(
    request: Pick<PrintQuoteRequest, "quotes" | "lowestQuoteId">,
    quoteId: string | null,
    note: string
): AwardInput | null {
    const lowest = defaultAward(request);
    if (!lowest) return null;
    const trimmed = note.trim();
    if (quoteId === null || quoteId === lowest.id) return trimmed ? { quoteId: lowest.id, note: trimmed } : { quoteId: lowest.id };
    const named = standingQuotes(request).find((quote) => quote.id === quoteId);
    if (!named) return null;
    if (trimmed.length < 3) return null;
    return { quoteId, note: trimmed };
}

/** Whether naming this quote needs a note: it is standing and it is not the lowest. */
export const awardNeedsNote = (request: Pick<PrintQuoteRequest, "quotes" | "lowestQuoteId">, quoteId: string | null): boolean => {
    const lowest = defaultAward(request);
    return lowest !== null && quoteId !== null && quoteId !== lowest.id;
};

/** Whether the request may still be awarded: OPEN with something standing. The deadline closes quoting, not deciding. */
export const canAward = (request: Pick<PrintQuoteRequest, "status" | "quotes" | "lowestQuoteId">): boolean =>
    request.status === "OPEN" && defaultAward(request) !== null;

/**
 * Whether a new request may be raised over the last one: the backend refuses
 * only an OPEN request (and a live job, which the card gates on its own) —
 * an AWARDED one whose job was since cancelled is raised over like an
 * EXPIRED one.
 */
export const canRequestQuotes = (request: Pick<PrintQuoteRequest, "status"> | null): boolean =>
    request === null || request.status !== "OPEN";

/** "in 3h 20m", "in 2d 4h", "passed 5h ago" — the deadline as the tab reads it. */
export function deadlineCountdown(deadlineAt: string, now: Date = new Date()): { label: string; passed: boolean } {
    const diff = new Date(deadlineAt).getTime() - now.getTime();
    const passed = diff <= 0;
    const abs = Math.abs(diff);
    const minutes = Math.floor(abs / 60_000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const span =
        days >= 1
            ? `${days}d ${hours % 24}h`
            : hours >= 1
              ? `${hours}h ${minutes % 60}m`
              : `${Math.max(minutes, 1)}m`;
    return { label: passed ? `passed ${span} ago` : `in ${span}`, passed };
}

/** The ISO instant 48 hours out, for the deadline field's default — what the backend would pick unasked. */
export const defaultDeadline = (now: Date = new Date()): string =>
    new Date(now.getTime() + DEFAULT_QUOTE_WINDOW_HOURS * 3_600_000).toISOString();

/**
 * The specs a request starts from: the spot's size and material, as the
 * order's listing join carries them, and the artwork when the advertiser
 * attached one. Only what the API sent; the desk edits the rest in the form.
 */
export function specsFromOrder(order: Pick<Order, "spot" | "designUrl" | "campaignName">): Record<string, string | number> {
    const specs: Record<string, string | number> = {};
    const spot = order.spot;
    if (spot?.size) specs.size = spot.size;
    if (spot?.widthFt) specs.widthFt = spot.widthFt;
    if (spot?.heightFt) specs.heightFt = spot.heightFt;
    if (spot?.category) specs.material = spot.subType ? `${spot.category} · ${spot.subType}` : spot.category;
    if (spot?.placement) specs.placement = spot.placement;
    if (order.campaignName) specs.campaign = order.campaignName;
    if (order.designUrl) specs.artworkUrl = order.designUrl;
    return specs;
}

/** "size 10x20 ft, material OUTDOOR · Hoarding" — the first few string/number specs, as the partner's notification reads them. */
export function specsSummary(specs: Record<string, unknown>, limit = 4): string {
    const parts = Object.entries(specs)
        .filter(([, value]) => typeof value === "string" || typeof value === "number")
        .filter(([key]) => key !== "artworkUrl")
        .slice(0, limit)
        .map(([key, value]) => `${key} ${String(value)}`);
    return parts.length ? parts.join(", ") : "Print specs attached";
}
