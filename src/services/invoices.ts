import { ApiError, api as http, saveBlob } from "@/lib/api-client";
import type { StatusMeta } from "@/types";
import { financeReadsApi, type Money, type Timestamp } from "./finance";

/**
 * Invoices and the legal entity — Lot B's `invoices` module, mounted under
 * `/finance` behind ADMIN.
 *
 * ADX issues one document per sale from one consecutive series: a TAX_INVOICE
 * once the legal entity carries a GSTIN, a PROFORMA until it does, and a
 * CREDIT_NOTE when one is voided. The module owns the paper, not the money —
 * nothing here moves a rupee, and an issued document is never edited. What
 * the desk can do is read the register, download the PDF, void one (which
 * issues the credit note), keep the legal entity current, and match or
 * reject the invoices GST-registered publishers raise on ADX.
 *
 * No fixtures, for the reason the rest of finance has none: a seeded tax
 * invoice with a consecutive number is indistinguishable from a real one,
 * and the eight `inv_*` rows this console used to draw were exactly that.
 * They are gone rather than kept as a fallback.
 *
 * Money is a decimal string end to end — see `services/finance.ts`.
 */

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "VOID";
export type InvoiceKind = "TAX_INVOICE" | "PROFORMA" | "CREDIT_NOTE";
export type InvoiceLineKind =
    | "MEDIA"
    | "PLATFORM"
    | "INSTALLATION"
    | "PRINTING"
    | "DESIGN"
    | "DISCOUNT"
    | "PACKAGE"
    | "OTHER";

/** In the order the chips draw them. */
export const INVOICE_STATUSES: readonly InvoiceStatus[] = ["DRAFT", "ISSUED", "PAID", "VOID"];
export const INVOICE_KINDS: readonly InvoiceKind[] = ["PROFORMA", "TAX_INVOICE", "CREDIT_NOTE"];

/** One row of `GET /finance/invoices` — the register, without lines. */
export interface InvoiceRow {
    id: string;
    /** INV/2026-27/000018, INV-PRO/… for a proforma, INV-CN/… for a credit note. */
    number: string;
    kind: InvoiceKind;
    status: InvoiceStatus;
    advertiserId: string;
    campaignId: string | null;
    packageSaleId: string | null;
    paymentId: string | null;
    topUpId: string | null;
    /** On a credit note: the invoice it reverses. */
    voidsInvoiceId: string | null;
    issuedAt: Timestamp | null;
    dueAt: Timestamp | null;
    supplierName: string | null;
    supplierGstin: string | null;
    supplierStateCode: string | null;
    recipientName: string;
    recipientGstin: string | null;
    recipientStateCode: string | null;
    recipientAddress: string | null;
    placeOfSupply: string | null;
    taxableValue: Money;
    cgst: Money;
    sgst: Money;
    igst: Money;
    roundOff: Money;
    total: Money;
    /** cgst + sgst + igst, whichever way it was split. */
    gstTotal: Money;
    currency: string;
    pdfFileId: string | null;
    ledgerTransactionId: string | null;
    createdById: string | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface InvoiceLine {
    id: string;
    kind: InvoiceLineKind;
    description: string;
    /** Services Accounting Code printed on the line. */
    sacCode: string | null;
    /** A decimal string; days × spots on a media line, months on a package line. */
    quantity: string;
    unitRate: Money;
    taxableValue: Money;
    /** A fraction as a decimal string: "0.18" is 18%. */
    gstPct: string;
    gstAmount: Money;
    campaignSpotId: string | null;
    sortOrder: number;
}

/** `GET /finance/invoices/:id` — the row with its lines. */
export interface InvoiceDetail extends InvoiceRow {
    lines: InvoiceLine[];
}

/** One page of the designed-list contract. */
export interface ListPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed. */
    counts: Record<string, number>;
}

export type InvoiceSort = "newest" | "oldest";

export interface InvoicesQuery {
    q?: string;
    status?: InvoiceStatus[];
    kind?: InvoiceKind;
    advertiserId?: string;
    /** ISO dates; bound `issuedAt`. */
    from?: string;
    to?: string;
    sort?: InvoiceSort;
    page?: number;
    pageSize?: number;
}

/** What `POST /finance/invoices/:id/void` answers: the note, and the original now VOID. */
export interface VoidResult {
    creditNote: InvoiceDetail;
    original: InvoiceDetail;
}

/** ADX as the supplier on every invoice. One row, created empty on first read. */
export interface LegalEntity {
    id: string;
    legalName: string | null;
    tradeName: string | null;
    gstin: string | null;
    pan: string | null;
    tan: string | null;
    cin: string | null;
    registeredAddress: string | null;
    city: string | null;
    /** Two-digit GST state code; decides CGST+SGST against IGST. */
    stateCode: string | null;
    stateName: string | null;
    invoicePrefix: string;
    /** 4 is April: the financial year 2026-27. */
    financialYearStartMonth: number;
    updatedById: string | null;
    updatedAt: Timestamp;
}

/** The ten clearable text fields; an empty string clears one. */
export const LEGAL_ENTITY_TEXT_FIELDS = [
    "legalName",
    "tradeName",
    "gstin",
    "pan",
    "tan",
    "cin",
    "registeredAddress",
    "city",
    "stateCode",
    "stateName",
] as const;
export type LegalEntityTextField = (typeof LEGAL_ENTITY_TEXT_FIELDS)[number];

/** The body of `PUT /finance/legal-entity`: strict keys, only what changed. */
export type LegalEntityPatch = Partial<Record<LegalEntityTextField, string | null>> & {
    invoicePrefix?: string;
    financialYearStartMonth?: number;
};

export type PublisherInvoiceStatus = "UPLOADED" | "MATCHED" | "REJECTED";
export const PUBLISHER_INVOICE_STATUSES: readonly PublisherInvoiceStatus[] = [
    "UPLOADED",
    "MATCHED",
    "REJECTED",
];

/** One row of `GET /finance/publisher-invoices` — what a publisher billed ADX for a month. */
export interface PublisherInvoice {
    id: string;
    publisherId: string;
    /** "2026-09" */
    period: string;
    fileId: string | null;
    fileUrl: string | null;
    gstin: string | null;
    amount: Money;
    status: PublisherInvoiceStatus;
    note: string | null;
    reviewedById: string | null;
    reviewedAt: Timestamp | null;
    createdAt: Timestamp;
}

export interface PublisherInvoicesQuery {
    q?: string;
    status?: PublisherInvoiceStatus[];
    publisherId?: string;
    period?: string;
    page?: number;
    pageSize?: number;
}

export interface ReviewPublisherInvoiceInput {
    status: "MATCHED" | "REJECTED";
    /** Required on a rejection; the backend refuses one without it. */
    note?: string;
}

/* ------------------------------------------------------------------ */
/* Query builders                                                      */
/* ------------------------------------------------------------------ */

const base = "/finance";

/** `?q=&status=&kind=&advertiserId=&from=&to=&sort=&page=&pageSize=`, only what was asked. */
export function buildInvoicesQuery(query: InvoicesQuery = {}): string {
    const params = new URLSearchParams();
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.kind) params.set("kind", query.kind);
    if (query.advertiserId) params.set("advertiserId", query.advertiserId);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.sort) params.set("sort", query.sort);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    return params.toString();
}

export function buildPublisherInvoicesQuery(query: PublisherInvoicesQuery = {}): string {
    const params = new URLSearchParams();
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.publisherId) params.set("publisherId", query.publisherId);
    if (query.period) params.set("period", query.period);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    return params.toString();
}

/**
 * The patch for the legal-entity form: every field whose value differs from
 * what the server sent, and nothing else.
 *
 * The schema is a strict object, so an unknown key is a 400; and sending
 * every field would make the audit diff claim twelve changes when one was
 * made. Text fields normalise to the wire's own rule — an empty string
 * clears, and a cleared field reads back as null — so a blank input over a
 * null column is not a change.
 */
export function legalEntityPatchOf(
    current: LegalEntity,
    form: Record<LegalEntityTextField, string> & { invoicePrefix: string; financialYearStartMonth: string }
): LegalEntityPatch {
    const patch: LegalEntityPatch = {};
    for (const field of LEGAL_ENTITY_TEXT_FIELDS) {
        const next = form[field].trim();
        const before = current[field] ?? "";
        if (next !== before) patch[field] = next === "" ? null : next;
    }
    const prefix = form.invoicePrefix.trim().toUpperCase();
    if (prefix && prefix !== current.invoicePrefix) patch.invoicePrefix = prefix;
    const month = Number(form.financialYearStartMonth);
    if (Number.isInteger(month) && month !== current.financialYearStartMonth) {
        patch.financialYearStartMonth = month;
    }
    return patch;
}

/**
 * The backend's Zod flatten, one message per field. A refinement that
 * crosses fields (the state code disagreeing with the GSTIN) lands on the
 * field it names, so the form can show it beside the input rather than in a
 * toast that has to be re-read against twelve boxes.
 */
export function fieldMessagesOf(error: unknown): Record<string, string> {
    if (!(error instanceof ApiError)) return {};
    const out: Record<string, string> = {};
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
        const first = messages[0];
        if (first) out[field] = first;
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Live gate                                                           */
/* ------------------------------------------------------------------ */

/** Refuses a write while the API is off — there is nothing to write to. */
function mutable() {
    if (!financeReadsApi()) {
        throw new Error("The finance console is not connected to the ADX backend.");
    }
    return http;
}

/** `INV/2026-27/000018` → `INV-2026-27-000018.pdf`, what the backend names the file. */
export const pdfFilenameOf = (number: string): string => `${number.replace(/\//g, "-")}.pdf`;

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

export const invoicesService = {
    /* ---------------- The register ---------------- */

    list: (query: InvoicesQuery = {}) =>
        http.get<ListPage<InvoiceRow>>(`${base}/invoices?${buildInvoicesQuery(query)}`),

    /** One invoice with its lines. A 404 is "no such invoice", rendered as not-found. */
    get: async (id: string): Promise<InvoiceDetail | null> => {
        try {
            return await http.get<InvoiceDetail>(`${base}/invoices/${id}`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /**
     * Issues a CREDIT_NOTE against it and sets it VOID, in one transaction.
     * Needs `finance.approve`. Idempotent: a second void answers with the note
     * that already stands. Voiding does not move money.
     */
    void: (id: string, reason: string) =>
        mutable().post<VoidResult>(`${base}/invoices/${id}/void`, { reason }),

    /**
     * The A4 PDF, as an authenticated download.
     *
     * Not a link: `GET /finance/invoices/:id/pdf` is behind the bearer token,
     * and an `<a href>` carries no header. The api client's blob mode carries
     * it, refreshes a stale access token and replays, so a download does not
     * fail on the token a page read would have recovered from. The first
     * request streams a fresh render; every later one is a redirect to the
     * stored file, which `fetch` follows. The filename is built from the
     * number rather than read off the response, because the stored file's
     * headers are the storage's.
     */
    downloadPdf: async (invoice: Pick<InvoiceRow, "id" | "number">): Promise<{ filename: string; bytes: number }> => {
        const result = await http.blob(`${base}/invoices/${invoice.id}/pdf`);
        const filename = pdfFilenameOf(invoice.number);
        saveBlob(result.blob, filename);
        return { filename, bytes: result.blob.size };
    },

    /* ---------------- The legal entity ---------------- */

    legalEntity: () => http.get<LegalEntity>(`${base}/legal-entity`),

    /** Strict keys; GSTIN, PAN, TAN and CIN are format-checked and cross-checked server-side. */
    updateLegalEntity: (patch: LegalEntityPatch) =>
        mutable().put<LegalEntity>(`${base}/legal-entity`, patch),

    /* ---------------- Publishers' invoices to ADX ---------------- */

    publisherInvoices: (query: PublisherInvoicesQuery = {}) =>
        http.get<ListPage<PublisherInvoice>>(
            `${base}/publisher-invoices?${buildPublisherInvoicesQuery(query)}`
        ),

    /** Match it against the month's statement, or reject it with a note. */
    reviewPublisherInvoice: (id: string, input: ReviewPublisherInvoiceInput) =>
        mutable().patch<PublisherInvoice>(`${base}/publisher-invoices/${id}`, {
            status: input.status,
            ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        }),
};

/* ------------------------------------------------------------------ */
/* Display metadata                                                    */
/* ------------------------------------------------------------------ */

export const INVOICE_STATUS_META: Record<InvoiceStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    ISSUED: { label: "Issued", tone: "warning" },
    PAID: { label: "Paid", tone: "success" },
    VOID: { label: "Void", tone: "danger" },
};

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
    TAX_INVOICE: "Tax invoice",
    PROFORMA: "Proforma",
    CREDIT_NOTE: "Credit note",
};

export const INVOICE_KIND_META: Record<InvoiceKind, StatusMeta> = {
    TAX_INVOICE: { label: "Tax invoice", tone: "info" },
    PROFORMA: { label: "Proforma", tone: "neutral" },
    CREDIT_NOTE: { label: "Credit note", tone: "warning" },
};

export const LINE_KIND_LABEL: Record<InvoiceLineKind, string> = {
    MEDIA: "Media",
    PLATFORM: "Platform fee",
    INSTALLATION: "Installation",
    PRINTING: "Printing",
    DESIGN: "Design",
    DISCOUNT: "Discount",
    PACKAGE: "Package",
    OTHER: "Other",
};

export const PUBLISHER_INVOICE_STATUS_META: Record<PublisherInvoiceStatus, StatusMeta> = {
    UPLOADED: { label: "Awaiting review", tone: "warning" },
    MATCHED: { label: "Matched", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

/**
 * Which way the GST was split. The table's CHECK is `cgst = sgst = 0 OR
 * igst = 0`, so an invoice is one or the other and the totals block shows
 * only the lines that apply — an IGST row reading ₹0.00 under a CGST/SGST
 * pair is a reading error waiting to happen.
 */
export const taxSplitOf = (
    invoice: Pick<InvoiceRow, "igst">
): "INTRA_STATE" | "INTER_STATE" => (/^-?0(\.0+)?$/.test(invoice.igst.trim()) ? "INTRA_STATE" : "INTER_STATE");

/** "0.18" on the wire → "18%" on the page. */
export function formatGstPct(fraction: string): string {
    const value = Number(fraction) * 100;
    if (!Number.isFinite(value)) return "—";
    return `${Number(value.toFixed(2))}%`;
}

/** "12.0000" → "12"; "1.5000" → "1.5". Quantities are not money and carry four places. */
export const formatQuantity = (quantity: string): string => {
    const trimmed = quantity.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed || "—";
    return trimmed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
};

/** Whether the desk may void this document: issued or paid, and not itself a credit note. */
export const canVoid = (invoice: Pick<InvoiceRow, "status" | "kind">): boolean =>
    invoice.kind !== "CREDIT_NOTE" && (invoice.status === "ISSUED" || invoice.status === "PAID");

/** "2026-09" → "Sep 2026". */
export function periodLabel(period: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!match) return period;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Month names for the FY-start select, 1-indexed like the wire. */
export const MONTHS: readonly { value: number; label: string }[] = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
];
