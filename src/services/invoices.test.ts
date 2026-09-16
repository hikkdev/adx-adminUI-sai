import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot B — invoices and the legal entity over `/finance`.
 *
 * What this pins is the wire, the things the screens get wrong if nobody is
 * watching:
 *
 * 1. The register's query is the list contract's — `q`, a comma-joined
 *    `status`, `kind`, `advertiserId`, the date bounds — and nothing that was
 *    not asked for. A `status=undefined` on the wire is a 400.
 *
 * 2. A void sends `{ reason }` and answers with the credit note beside the
 *    original; a publisher-invoice review sends `status` and only a non-empty
 *    `note`.
 *
 * 3. The legal-entity patch is a diff. The schema is strict, so a stray key
 *    is refused; and clearing a field sends `null`, not `""`, while a blank
 *    input over a null column is not a change at all.
 *
 * 4. The GST split is read off the row: IGST zero means CGST + SGST, and a
 *    negative credit-note IGST is still inter-state.
 */

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: undefined as unknown,
        /** Thrown by the next call instead of answering, then cleared. */
        fail: null as Error | null,
        reset() {
            this.calls = [];
            this.answer = undefined;
            this.fail = null;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.fail) {
            const error = backend.fail;
            backend.fail = null;
            throw error;
        }
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { ApiError } from "@/lib/api-client";
import {
    INVOICE_KIND_META,
    INVOICE_KINDS,
    INVOICE_STATUS_META,
    INVOICE_STATUSES,
    LINE_KIND_LABEL,
    PUBLISHER_INVOICE_STATUSES,
    PUBLISHER_INVOICE_STATUS_META,
    buildInvoicesQuery,
    buildPublisherInvoicesQuery,
    canVoid,
    fieldMessagesOf,
    formatGstPct,
    formatQuantity,
    invoicesService,
    legalEntityPatchOf,
    pdfFilenameOf,
    periodLabel,
    taxSplitOf,
    type LegalEntity,
} from "./invoices";

beforeEach(() => backend.reset());

const entity: LegalEntity = {
    id: "default",
    legalName: "Keysquare Technologies Pvt Ltd",
    tradeName: null,
    gstin: null,
    pan: null,
    tan: null,
    cin: null,
    registeredAddress: null,
    city: "Bengaluru",
    stateCode: null,
    stateName: null,
    invoicePrefix: "INV",
    financialYearStartMonth: 4,
    updatedById: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
};

const formOf = (over: Partial<Record<string, string>> = {}) => ({
    legalName: entity.legalName ?? "",
    tradeName: "",
    gstin: "",
    pan: "",
    tan: "",
    cin: "",
    registeredAddress: "",
    city: "Bengaluru",
    stateCode: "",
    stateName: "",
    invoicePrefix: "INV",
    financialYearStartMonth: "4",
    ...over,
});

describe("the register's query", () => {
    it("sends only the facets that were asked for, status comma-joined", () => {
        const query = buildInvoicesQuery({
            q: "  zomato ",
            status: ["ISSUED", "PAID"],
            kind: "TAX_INVOICE",
            advertiserId: "adv_1",
            from: "2026-04-01",
            page: 2,
            pageSize: 50,
        });
        const params = new URLSearchParams(query);
        expect(params.get("q")).toBe("zomato");
        expect(params.get("status")).toBe("ISSUED,PAID");
        expect(params.get("kind")).toBe("TAX_INVOICE");
        expect(params.get("advertiserId")).toBe("adv_1");
        expect(params.get("from")).toBe("2026-04-01");
        expect(params.has("to")).toBe(false);
        expect(params.get("page")).toBe("2");
        expect(params.get("pageSize")).toBe("50");
    });

    it("never writes an undefined facet or an empty search onto the wire", () => {
        const params = new URLSearchParams(buildInvoicesQuery({ q: "   ", status: [] }));
        expect([...params.keys()]).toEqual(["pageSize"]);
        expect(params.get("pageSize")).toBe("100");
    });

    it("reads the list through GET /finance/invoices", async () => {
        backend.answer = { items: [], total: 0, page: 1, pageSize: 100, counts: {} };
        await invoicesService.list({ advertiserId: "adv_1" });
        expect(backend.calls[0]?.method).toBe("GET");
        expect(backend.calls[0]?.path).toBe("/finance/invoices?advertiserId=adv_1&pageSize=100");
    });

    it("builds the publisher-invoice query the same way", () => {
        const params = new URLSearchParams(
            buildPublisherInvoicesQuery({ status: ["UPLOADED"], period: "2026-08", publisherId: "pub_1" })
        );
        expect(params.get("status")).toBe("UPLOADED");
        expect(params.get("period")).toBe("2026-08");
        expect(params.get("publisherId")).toBe("pub_1");
        expect(params.has("q")).toBe(false);
    });
});

describe("one invoice", () => {
    it("answers null for a 404 and rethrows anything else", async () => {
        backend.fail = new ApiError(404, "NOT_FOUND", "Invoice not found");
        await expect(invoicesService.get("inv_1")).resolves.toBeNull();
        backend.fail = new ApiError(500, "INTERNAL", "boom");
        await expect(invoicesService.get("inv_1")).rejects.toBeInstanceOf(ApiError);
        expect(backend.calls.map((call) => call.path)).toEqual([
            "/finance/invoices/inv_1",
            "/finance/invoices/inv_1",
        ]);
    });

    it("voids with a reason and hands back the credit note beside the original", async () => {
        backend.answer = {
            creditNote: { id: "cn_1", number: "INV-CN/2026-27/000001", total: "-1180.00" },
            original: { id: "inv_1", status: "VOID" },
        };
        const result = await invoicesService.void("inv_1", "Wrong recipient");
        expect(backend.calls[0]).toEqual({
            method: "POST",
            path: "/finance/invoices/inv_1/void",
            body: { reason: "Wrong recipient" },
        });
        expect(result.creditNote.number).toContain("-CN/");
        expect(result.original.status).toBe("VOID");
    });

    it("names the PDF the way the backend does: slashes become dashes", () => {
        expect(pdfFilenameOf("INV/2026-27/000018")).toBe("INV-2026-27-000018.pdf");
    });

    it("may be voided only while issued or paid, and never if it is itself a credit note", () => {
        expect(canVoid({ status: "ISSUED", kind: "TAX_INVOICE" })).toBe(true);
        expect(canVoid({ status: "PAID", kind: "PROFORMA" })).toBe(true);
        expect(canVoid({ status: "VOID", kind: "TAX_INVOICE" })).toBe(false);
        expect(canVoid({ status: "DRAFT", kind: "TAX_INVOICE" })).toBe(false);
        expect(canVoid({ status: "ISSUED", kind: "CREDIT_NOTE" })).toBe(false);
    });
});

describe("the tax split", () => {
    it("is intra-state when IGST is zero, however the zero is written", () => {
        expect(taxSplitOf({ igst: "0.00" })).toBe("INTRA_STATE");
        expect(taxSplitOf({ igst: "0" })).toBe("INTRA_STATE");
        expect(taxSplitOf({ igst: "-0.00" })).toBe("INTRA_STATE");
    });

    it("is inter-state otherwise, a credit note's negative IGST included", () => {
        expect(taxSplitOf({ igst: "180.00" })).toBe("INTER_STATE");
        expect(taxSplitOf({ igst: "-180.00" })).toBe("INTER_STATE");
    });

    it("prints a line's fraction as a percentage and a quantity without its padding", () => {
        expect(formatGstPct("0.18")).toBe("18%");
        expect(formatGstPct("0.05")).toBe("5%");
        expect(formatGstPct("0.125")).toBe("12.5%");
        expect(formatQuantity("12.0000")).toBe("12");
        expect(formatQuantity("1.5000")).toBe("1.5");
        expect(formatQuantity("3")).toBe("3");
    });
});

describe("the legal entity", () => {
    it("reads and writes /finance/legal-entity", async () => {
        backend.answer = entity;
        await invoicesService.legalEntity();
        await invoicesService.updateLegalEntity({ gstin: "29ABCDE1234F1Z5" });
        expect(backend.calls.map((call) => [call.method, call.path])).toEqual([
            ["GET", "/finance/legal-entity"],
            ["PUT", "/finance/legal-entity"],
        ]);
        expect(backend.calls[1]?.body).toEqual({ gstin: "29ABCDE1234F1Z5" });
    });

    it("patches only what changed", () => {
        const patch = legalEntityPatchOf(entity, formOf({ gstin: " 29abcde1234f1z5 ", tradeName: "ADX" }));
        expect(patch).toEqual({ gstin: "29abcde1234f1z5", tradeName: "ADX" });
    });

    it("is empty when nothing changed — a blank input over a null column is not a change", () => {
        expect(legalEntityPatchOf(entity, formOf())).toEqual({});
    });

    it("clears a field with null rather than an empty string, and never sends an empty prefix", () => {
        const patch = legalEntityPatchOf(entity, formOf({ city: "", invoicePrefix: "  " }));
        expect(patch).toEqual({ city: null });
    });

    it("upper-cases the prefix and coerces the month", () => {
        const patch = legalEntityPatchOf(entity, formOf({ invoicePrefix: "adx", financialYearStartMonth: "1" }));
        expect(patch).toEqual({ invoicePrefix: "ADX", financialYearStartMonth: 1 });
    });

    it("surfaces the backend's field messages beside the field they name", () => {
        const error = new ApiError(400, "VALIDATION_ERROR", "Invalid request", {
            formErrors: [],
            fieldErrors: {
                gstin: ["A GSTIN is 15 characters: 29ABCDE1234F1Z5"],
                stateCode: ["The state code does not match the GSTIN"],
            },
        });
        expect(fieldMessagesOf(error)).toEqual({
            gstin: "A GSTIN is 15 characters: 29ABCDE1234F1Z5",
            stateCode: "The state code does not match the GSTIN",
        });
        expect(fieldMessagesOf(new Error("network"))).toEqual({});
    });
});

describe("publisher invoices", () => {
    it("matches with status alone and rejects with the note", async () => {
        backend.answer = { id: "pi_1", status: "MATCHED" };
        await invoicesService.reviewPublisherInvoice("pi_1", { status: "MATCHED", note: "  " });
        await invoicesService.reviewPublisherInvoice("pi_1", { status: "REJECTED", note: "Amount differs" });
        expect(backend.calls[0]).toEqual({
            method: "PATCH",
            path: "/finance/publisher-invoices/pi_1",
            body: { status: "MATCHED" },
        });
        expect(backend.calls[1]?.body).toEqual({ status: "REJECTED", note: "Amount differs" });
    });

    it("labels a period as a month", () => {
        expect(periodLabel("2026-09")).toMatch(/^Sept? 2026$/);
        expect(periodLabel("2026-01")).toBe("Jan 2026");
        expect(periodLabel("garbage")).toBe("garbage");
    });
});

describe("the vocabulary", () => {
    it("labels every status and kind the backend declares", () => {
        for (const status of INVOICE_STATUSES) expect(INVOICE_STATUS_META[status].label).toMatch(/\S/);
        for (const kind of INVOICE_KINDS) expect(INVOICE_KIND_META[kind].label).toMatch(/\S/);
        for (const status of PUBLISHER_INVOICE_STATUSES) {
            expect(PUBLISHER_INVOICE_STATUS_META[status].label).toMatch(/\S/);
        }
        expect(Object.keys(LINE_KIND_LABEL).sort()).toEqual(
            ["DESIGN", "DISCOUNT", "INSTALLATION", "MEDIA", "OTHER", "PACKAGE", "PLATFORM", "PRINTING"]
        );
    });
});
