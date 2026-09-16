import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot B (Q85/Q140) — payout batches, ADX's bank accounts, the queue's new
 * facets and reconciliation, as `financeService` sends them.
 *
 * What is pinned is the wire: the paths and bodies the backend READMEs
 * name, the comma-list facets, the multipart import body, and the four pure
 * helpers the screens lean on. Nothing here renders.
 */

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: undefined as unknown,
        reset() {
            this.calls = [];
            this.answer = undefined;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.answer instanceof Error) throw backend.answer;
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
            blob: (path: string) => wrap("BLOB", path),
        },
        saveBlob: () => undefined,
    };
});

import { ApiError } from "@/lib/api-client";
import {
    PAYOUT_BATCH_STATUSES,
    PAYOUT_BATCH_STATUS_META,
    BANK_LINE_STATUSES,
    BANK_LINE_STATUS_META,
    attachmentFilename,
    beneficiaryOf,
    describeBankAccount,
    financeService,
    payoutBatchesExportFilename,
    payoutBatchesExportQuery,
    preflightProblemLabel,
    reconciliationExportFilename,
    reconciliationExportQuery,
    reservedTotal,
    statementImportBody,
    type BankAccount,
    type Withdrawal,
} from "./finance";

const last = () => backend.calls[backend.calls.length - 1]!;

const withdrawal = (over: Partial<Withdrawal> = {}): Withdrawal => ({
    id: "cl_w1",
    reference: "WDR-2026-000118",
    walletId: "cl_wallet_1",
    partyKind: "PUBLISHER",
    partyName: "Sharma Hoardings",
    amount: "5000.00",
    taxWithheld: "0.00",
    netAmount: "5000.00",
    status: "APPROVED",
    requestedAt: "2026-09-10T08:00:00.000Z",
    decidedAt: null,
    decisionNote: null,
    reservedAt: "2026-09-10T09:00:00.000Z",
    batchId: null,
    rail: null,
    railReference: null,
    paidAt: null,
    failureReason: null,
    method: {
        id: "cl_m1",
        type: "BANK",
        accountHolder: "Sanjay Sharma",
        bankName: "HDFC Bank",
        accountNumberMasked: "•••• 4417",
        ifscCode: "HDFC0001234",
        upiVpa: null,
        isDefault: true,
        status: "VERIFIED",
        verifiedVia: "PENNY_DROP",
        verifiedAt: null,
        nameMatchPct: null,
        rejectionReason: null,
        createdAt: "2026-09-01T00:00:00.000Z",
    },
    ...over,
});

beforeEach(() => backend.reset());

describe("the withdrawal queue's facets", () => {
    it("sends status as a comma list and the four Lot B facets only when set", async () => {
        await financeService.withdrawals({
            status: ["REQUESTED", "APPROVED"],
            q: "  sharma ",
            partyKind: "PRINT_PARTNER",
            from: "2026-09-01T00:00:00.000Z",
            to: "2026-09-30T23:59:59.999Z",
            batchId: "cl_b1",
        });
        const path = last().path;
        expect(path).toContain("/finance/withdrawals?");
        expect(path).toContain("status=REQUESTED%2CAPPROVED");
        expect(path).toContain("q=sharma");
        expect(path).toContain("partyKind=PRINT_PARTNER");
        expect(path).toContain("batchId=cl_b1");
        expect(path).toContain("from=2026-09-01");
    });

    it("omits every facet it was not given", async () => {
        await financeService.withdrawals();
        expect(last().path).toBe("/finance/withdrawals?limit=200");
        await financeService.withdrawalSummary();
        expect(last()).toMatchObject({ method: "GET", path: "/finance/withdrawals/summary" });
    });
});

describe("payout batches", () => {
    it("lists on the list contract, with status as a comma list", async () => {
        await financeService.payoutBatches({ status: ["RELEASING", "RELEASED"], q: "2026", page: 2, pageSize: 25 });
        expect(last().path).toBe("/finance/payout-batches?status=RELEASING%2CRELEASED&q=2026&page=2&pageSize=25");
    });

    it("walks the ladder on the routes the README names", async () => {
        await financeService.createPayoutBatch({ rail: "MANUAL_NEFT", bankAccountId: "cl_acct" });
        expect(last()).toEqual({
            method: "POST",
            path: "/finance/payout-batches",
            body: { rail: "MANUAL_NEFT", bankAccountId: "cl_acct" },
        });

        await financeService.setPayoutBatchLines("cl_b1", ["cl_w1", "cl_w2"]);
        expect(last()).toEqual({
            method: "PUT",
            path: "/finance/payout-batches/cl_b1/lines",
            body: { withdrawalIds: ["cl_w1", "cl_w2"] },
        });

        await financeService.submitPayoutBatch("cl_b1");
        expect(last()).toMatchObject({ method: "POST", path: "/finance/payout-batches/cl_b1/submit" });
        await financeService.approvePayoutBatch("cl_b1");
        expect(last()).toMatchObject({ method: "POST", path: "/finance/payout-batches/cl_b1/approve" });
        await financeService.payoutBatchPreflight("cl_b1");
        expect(last()).toMatchObject({ method: "GET", path: "/finance/payout-batches/cl_b1/preflight" });
        await financeService.releasePayoutBatch("cl_b1");
        expect(last()).toMatchObject({ method: "POST", path: "/finance/payout-batches/cl_b1/release" });
        await financeService.cancelPayoutBatch("cl_b1");
        expect(last()).toMatchObject({ method: "POST", path: "/finance/payout-batches/cl_b1/cancel" });
    });

    it("confirms or fails one line with the body the schema wants", async () => {
        await financeService.markPayoutBatchLinePaid("cl_b1", "cl_w1", "SBIN325104871234");
        expect(last()).toEqual({
            method: "POST",
            path: "/finance/payout-batches/cl_b1/lines/cl_w1/mark-paid",
            body: { utr: "SBIN325104871234" },
        });
        await financeService.failPayoutBatchLine("cl_b1", "cl_w1", "Account closed");
        expect(last()).toEqual({
            method: "POST",
            path: "/finance/payout-batches/cl_b1/lines/cl_w1/fail",
            body: { reason: "Account closed" },
        });
    });

    it("answers null for a batch that does not exist rather than throwing", async () => {
        backend.answer = new ApiError(404, "NOT_FOUND", "Batch not found");
        await expect(financeService.payoutBatch("cl_missing")).resolves.toBeNull();
        backend.answer = new ApiError(500, "INTERNAL", "Boom");
        await expect(financeService.payoutBatch("cl_b1")).rejects.toThrow("Boom");
    });

    it("labels every status the backend can set", () => {
        expect(PAYOUT_BATCH_STATUSES).toHaveLength(9);
        for (const status of PAYOUT_BATCH_STATUSES) {
            expect(PAYOUT_BATCH_STATUS_META[status].label, status).toMatch(/\S/);
        }
    });
});

describe("bank accounts", () => {
    it("creates without an id and updates with one, on the same PUT", async () => {
        await financeService.createBankAccount({ label: "Operating", bankName: "HDFC Bank", ifsc: "HDFC0001234", accountNumber: "50100123456789" });
        expect(last()).toEqual({
            method: "PUT",
            path: "/finance/bank-accounts",
            body: { label: "Operating", bankName: "HDFC Bank", ifsc: "HDFC0001234", accountNumber: "50100123456789" },
        });
        await financeService.updateBankAccount("cl_acct", { label: "Operating", bankName: "HDFC Bank", ifsc: "HDFC0001234", isDefault: true });
        expect(last().body).toEqual({ id: "cl_acct", label: "Operating", bankName: "HDFC Bank", ifsc: "HDFC0001234", isDefault: true });
    });

    it("reads as bank and mask on one line", () => {
        const account: BankAccount = {
            id: "cl_acct",
            label: "Operating",
            bankName: "HDFC Bank",
            accountHolder: null,
            accountNumberMasked: "•••• 8912",
            ifsc: "HDFC0001234",
            isActive: true,
            isDefault: true,
            createdAt: "",
            updatedAt: "",
        };
        expect(describeBankAccount(account)).toBe("HDFC Bank •••• 8912");
    });
});

describe("reconciliation", () => {
    it("lists lines on the list contract with the window and the facet", async () => {
        await financeService.reconciliation.lines({ status: ["UNMATCHED", "DIFFERS"], bankAccountId: "cl_acct", from: "2026-09-01", page: 1 });
        expect(last().path).toBe(
            "/finance/reconciliation/lines?status=UNMATCHED%2CDIFFERS&bankAccountId=cl_acct&from=2026-09-01&page=1&pageSize=50"
        );
        await financeService.reconciliation.summary({ bankAccountId: "cl_acct" });
        expect(last().path).toBe("/finance/reconciliation/summary?bankAccountId=cl_acct");
    });

    it("names exactly one record on a match, and carries the note only when there is one", async () => {
        await financeService.reconciliation.match("cl_l1", { withdrawalId: "cl_w1" });
        expect(last()).toEqual({ method: "POST", path: "/finance/reconciliation/lines/cl_l1/match", body: { withdrawalId: "cl_w1" } });
        await financeService.reconciliation.match("cl_l1", { ledgerTransactionId: "cl_tx" }, "same amount, next day");
        expect(last().body).toEqual({ ledgerTransactionId: "cl_tx", note: "same amount, next day" });
        await financeService.reconciliation.ignore("cl_l1");
        expect(last()).toEqual({ method: "POST", path: "/finance/reconciliation/lines/cl_l1/ignore", body: {} });
        await financeService.reconciliation.unmatch("cl_l1");
        expect(last()).toMatchObject({ method: "POST", path: "/finance/reconciliation/lines/cl_l1/unmatch" });
        await financeService.reconciliation.autoMatch({ bankAccountId: "cl_acct" });
        expect(last()).toEqual({ method: "POST", path: "/finance/reconciliation/auto-match", body: { bankAccountId: "cl_acct" } });
    });

    it("posts the statement as multipart with the account beside it", async () => {
        const file = new File(["Date,Description\n"], "hdfc-sep.csv", { type: "text/csv" });
        const body = statementImportBody({ file, bankAccountId: "cl_acct", profileId: "cl_prof" });
        expect(body).toBeInstanceOf(FormData);
        expect(body.get("bankAccountId")).toBe("cl_acct");
        expect(body.get("profileId")).toBe("cl_prof");
        expect((body.get("file") as File).name).toBe("hdfc-sep.csv");
        expect(statementImportBody({ file, bankAccountId: "cl_acct" }).has("profileId")).toBe(false);

        await financeService.reconciliation.importStatement({ file, bankAccountId: "cl_acct" });
        expect(last().method).toBe("POST");
        expect(last().path).toBe("/finance/reconciliation/imports");
        expect(last().body).toBeInstanceOf(FormData);
    });

    it("labels every line status", () => {
        for (const status of BANK_LINE_STATUSES) {
            expect(BANK_LINE_STATUS_META[status].label, status).toMatch(/\S/);
        }
    });

    it("Lot G (Q125): the export query is the desk's filters with no page, and the schedule read is on its own route", () => {
        expect(reconciliationExportQuery({ status: ["UNMATCHED"], bankAccountId: "cl_acct", importId: "cl_imp", from: "2026-09-01", to: "2026-09-30", q: " utr " })).toBe(
            "?status=UNMATCHED&bankAccountId=cl_acct&importId=cl_imp&from=2026-09-01&to=2026-09-30&q=utr",
        );
        expect(reconciliationExportQuery({})).toBe("");
        expect(reconciliationExportFilename(null, new Date("2026-09-14T10:00:00.000Z"))).toBe("reconciliation-2026-09-14.csv");
        expect(reconciliationExportFilename("hdfc-sep-cl_imp.csv")).toBe("hdfc-sep-cl_imp.csv");
    });

    it("Lot G (Q124): reads the weekly draft's schedule ahead of any batch id", async () => {
        await financeService.payoutSchedule();
        expect(last()).toMatchObject({ method: "GET", path: "/finance/payout-batches/schedule" });
    });

    it("G13-B: exports the list under the chip and the search through the blob helper, ahead of any batch id", async () => {
        expect(payoutBatchesExportQuery({ status: ["DRAFT", "IN_REVIEW"], q: " sep " })).toBe("?status=DRAFT%2CIN_REVIEW&q=sep");
        expect(payoutBatchesExportQuery({})).toBe("");
        expect(payoutBatchesExportFilename(new Date("2026-09-14T10:00:00.000Z"))).toBe("payout-batches-2026-09-14.csv");
        backend.answer = { blob: new Blob(["reference,status\r\n"], { type: "text/csv" }), filename: "payout-batches-2026-09-14.csv", contentType: "text/csv" };
        const outcome = await financeService.exportPayoutBatches({ status: ["COMPLETED"] });
        expect(last()).toMatchObject({ method: "BLOB", path: "/finance/payout-batches/export.csv?status=COMPLETED" });
        expect(outcome.filename).toBe("payout-batches-2026-09-14.csv");
        expect(outcome.bytes).toBeGreaterThan(0);
    });
});

describe("the helpers the screens lean on", () => {
    it("sums only the reserved rows, in paise", () => {
        expect(
            reservedTotal([
                withdrawal({ netAmount: "1000.50" }),
                withdrawal({ id: "w2", netAmount: "0.50" }),
                withdrawal({ id: "w3", status: "PROCESSING", netAmount: "9999.00" }),
                withdrawal({ id: "w4", status: "REQUESTED", netAmount: "9999.00" }),
            ])
        ).toBe("1001.00");
        expect(reservedTotal([])).toBe("0.00");
    });

    it("names the party first, then the payout method, then the wallet", () => {
        expect(beneficiaryOf(withdrawal())).toBe("Sharma Hoardings");
        expect(beneficiaryOf(withdrawal({ partyName: "" }))).toBe("Sanjay Sharma");
        const bare = withdrawal({ partyName: "" });
        bare.method = { ...bare.method, accountHolder: null, upiVpa: null };
        expect(beneficiaryOf(bare)).toBe("Wallet LLET_1");
    });

    it("reads every preflight code, the suffixed one included", () => {
        expect(preflightProblemLabel("KYC_NOT_VERIFIED")).toBe("KYC not verified");
        expect(preflightProblemLabel("PARTNER_INACTIVE")).toBe("Print partner deactivated");
        expect(preflightProblemLabel("NOT_APPROVED:REJECTED")).toBe("Not approved — rejected");
        expect(preflightProblemLabel("SOMETHING_NEW")).toBe("Something new");
    });

    it("takes the filename off a Content-Disposition header", () => {
        expect(attachmentFilename('attachment; filename="BATCH-2026-3.csv"')).toBe("BATCH-2026-3.csv");
        expect(attachmentFilename("attachment; filename=export.csv")).toBe("export.csv");
        expect(attachmentFilename(null)).toBeNull();
    });
});
