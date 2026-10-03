import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Finance › Ledger (2 Oct 2026).
 *
 * What is pinned: the page reads `GET /finance/ledger?paged=1` a server page
 * at a time — Rows per page 20 / 50 / 100, Next sends the page's
 * `nextCursor`, Previous steps back through the cursors already used, and
 * the foot says "Showing 21–40 of 548"; every filter in the one bar (search,
 * wallet, kind, dates, amount) reaches the query and starts again from the
 * newest page; a row opens onto its legs with the Reverse action and its
 * confirm; the totals line says the debit once across every match, and in
 * the danger tone when the credits differ; Export CSV downloads the filtered
 * set and shows the server's sentence when it refuses (422).
 */

const { backend, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        exportError: null as Error | null,
        /** Holds the export open until the test lets it go, so "Exporting…" can be seen. */
        exportGate: null as Promise<void> | null,
        totals: { debit: "482500.00", credit: "482500.00" },
        reset() {
            this.calls = [];
            this.exportError = null;
            this.exportGate = null;
            this.totals = { debit: "482500.00", credit: "482500.00" };
        },
        ledgerCalls() {
            return this.calls.filter((call) => call.method === "GET" && call.path.startsWith("/finance/ledger?"));
        },
        lastLedger() {
            const calls = this.ledgerCalls();
            return new URLSearchParams(calls[calls.length - 1]!.path.split("?")[1]);
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path.startsWith("/finance/ledger/verify")) return { unbalanced: [], drift: [], healthy: true };
            if (method === "GET" && path.startsWith("/finance/wallets")) {
                return [
                    { id: "wal_1", kind: "PUBLISHER", owner: "Sharma Hoardings", displayId: "PUB-0001", sizeBand: null, balance: "0.00", goodwill: "0.00", lastActivityAt: null },
                ];
            }
            if (method === "GET" && path.startsWith("/finance/ledger?")) {
                const params = new URLSearchParams(path.split("?")[1]);
                const cursor = params.get("cursor");
                const limit = Number(params.get("limit"));
                const prefix = cursor === "c2" ? "p2" : "p1";
                return {
                    rows: [
                        row(`${prefix}_a`, { kind: "PUBLISHER_EARNING" }),
                        row(`${prefix}_b`, { kind: "REVERSAL", reversesId: "x", reversesReference: "LGR-2026-000100" }),
                        row(`${prefix}_c`, { reversedBy: { id: "y", reference: "LGR-2026-000300" } }),
                    ].slice(0, limit),
                    total: 548,
                    nextCursor: cursor === "c2" ? "c3" : "c2",
                    totals: this.totals,
                };
            }
            if (method === "POST" && path.endsWith("/reverse")) return { id: "rev_1", reference: "LGR-2026-000999" };
            if (method === "BLOB") {
                if (this.exportGate) await this.exportGate;
                if (this.exportError) throw this.exportError;
                return { blob: new Blob(["reference\r\n"]), filename: "ledger-2026-10-02.csv" };
            }
            return {};
        },
    },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/finance/ledger",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = (method: string) => (path: string, body?: unknown) => backend.handle(method, path, body);
    return {
        ...actual,
        api: { get: wrap("GET"), post: wrap("POST"), patch: wrap("PATCH"), put: wrap("PUT"), delete: wrap("DELETE"), blob: wrap("BLOB") },
        saveBlob: () => undefined,
    };
});

import { ApiError } from "@/lib/api-client";
import { ledgerQuery, type LedgerPageRow } from "@/services/finance";
import { LedgerLoader } from "./ledger-loader";

function row(id: string, over: Partial<LedgerPageRow> = {}): LedgerPageRow {
    return {
        id,
        reference: `LGR-${id}`,
        kind: "PUBLISHER_EARNING",
        occurredAt: "2026-09-09T10:00:00.000Z",
        note: `Note for ${id}`,
        reversesId: null,
        legs: [
            { accountCode: "platform:payables", accountName: "Payable to parties", amount: "-1250.00", note: null },
            { accountCode: "wallet:wal_1", accountName: "Sharma Hoardings' wallet", amount: "1250.00", note: "Day 3" },
        ],
        debit: "1250.00",
        reversesReference: null,
        reversedBy: null,
        ...over,
    };
}

async function renderPage() {
    render(<LedgerLoader />);
    await screen.findByText("LGR-p1_a");
}

beforeEach(() => {
    backend.reset();
    vi.clearAllMocks();
});

describe("the ledger page", () => {
    it("puts the header and its Export first, then the balance banner, then the table", async () => {
        await renderPage();
        const heading = screen.getByRole("heading", { name: "Ledger" });
        const banner = screen.getByText("The books balance");
        const table = screen.getByRole("table");
        expect(heading.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(banner.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole("button", { name: /Export CSV/ })).toBeInTheDocument();
        expect(screen.queryByText("Filter")).toBeNull();
        expect(screen.getByRole("button", { name: /Columns/ })).toBeInTheDocument();
    });

    it("reads a page at a time and steps forward and back by cursor", async () => {
        await renderPage();
        let params = backend.lastLedger();
        expect(params.get("paged")).toBe("1");
        expect(params.get("limit")).toBe("20");
        expect(params.get("cursor")).toBeNull();
        expect(screen.getByText("Showing 1–3 of 548")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        await screen.findByText("LGR-p2_a");
        params = backend.lastLedger();
        expect(params.get("cursor")).toBe("c2");
        expect(screen.getByText("Showing 21–23 of 548")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Previous" }));
        await screen.findByText("LGR-p1_a");
        expect(screen.getByText("Showing 1–3 of 548")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    });

    it("changes the rows per page and starts again from the newest", async () => {
        await renderPage();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        await screen.findByText("LGR-p2_a");
        fireEvent.click(screen.getByRole("combobox", { name: "Rows per page" }));
        fireEvent.click(await screen.findByRole("option", { name: "50" }));
        await waitFor(() => expect(backend.lastLedger().get("limit")).toBe("50"));
        expect(backend.lastLedger().get("cursor")).toBeNull();
    });

    it("sends the search, dates and amount to the query", async () => {
        await renderPage();
        fireEvent.change(screen.getByLabelText("Search"), { target: { value: "LGR-2026" } });
        await waitFor(() => expect(backend.lastLedger().get("q")).toBe("LGR-2026"));

        fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-01" } });
        fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-30" } });
        await waitFor(() => expect(backend.lastLedger().get("to")).toBe("2026-09-30T23:59:59.999+05:30"));
        expect(backend.lastLedger().get("from")).toBe("2026-09-01T00:00:00.000+05:30");

        fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1250" } });
        await waitFor(() => expect(backend.lastLedger().get("amount")).toBe("1250"));
    });

    it("sends the wallet and the kinds to the query, and Clear takes them off", async () => {
        await renderPage();
        fireEvent.click(document.getElementById("ledger-wallet")!);
        fireEvent.click(within(await screen.findByRole("listbox")).getByText("Sharma Hoardings"));
        await waitFor(() => expect(backend.lastLedger().get("walletId")).toBe("wal_1"));

        fireEvent.pointerDown(screen.getByRole("button", { name: "Kind" }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Top-up" }));
        fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Payout" }));
        await waitFor(() => expect(backend.lastLedger().get("kind")).toBe("TOPUP,PAYOUT"));
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

        fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
        await waitFor(() => expect(backend.lastLedger().get("walletId")).toBeNull());
        expect(backend.lastLedger().get("kind")).toBeNull();
    });

    it("writes every filter onto the wire the same way for the read and the export", () => {
        expect(
            ledgerQuery(
                { q: " sharma ", walletId: "wal_1", kind: ["TOPUP", "PROMOTION_SPEND"], from: "2026-09-01", to: "2026-09-02", amount: "99.50" },
                { limit: 20, cursor: "c2", paged: true }
            )
        ).toBe(
            "?q=sharma&walletId=wal_1&kind=TOPUP%2CPROMOTION_SPEND&from=2026-09-01T00%3A00%3A00.000%2B05%3A30&to=2026-09-02T23%3A59%3A59.999%2B05%3A30&amount=99.50&limit=20&cursor=c2&paged=1"
        );
        expect(ledgerQuery({})).toBe("");
    });

    it("shows the columns and the reversal markers", async () => {
        await renderPage();
        expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
            "Reference",
            "Kind",
            "Date",
            "Description",
            "Amount",
            "Reversal",
        ]);
        expect(screen.getByText("Reverses LGR-2026-000100")).toBeInTheDocument();
        expect(screen.getByText("Reversed by LGR-2026-000300")).toBeInTheDocument();
        expect(screen.getAllByText("₹1,250.00").length).toBeGreaterThan(0);
    });

    it("opens a row onto its legs, debit and credit per account", async () => {
        await renderPage();
        expect(screen.queryByText("Payable to parties")).toBeNull();
        fireEvent.click(screen.getByText("LGR-p1_a"));
        const account = await screen.findByText("Payable to parties");
        const legs = account.closest("table")!;
        expect(within(legs).getByText("Debit")).toBeInTheDocument();
        expect(within(legs).getByText("Credit")).toBeInTheDocument();
        expect(within(legs).getByText("Sharma Hoardings' wallet")).toBeInTheDocument();
        expect(within(legs).getAllByText("₹1,250.00")).toHaveLength(2);
        fireEvent.click(screen.getByText("LGR-p1_a"));
        await waitFor(() => expect(screen.queryByText("Payable to parties")).toBeNull());
    });

    it("reverses from the open row through the confirm, with a reason", async () => {
        await renderPage();
        fireEvent.click(screen.getByText("LGR-p1_a"));
        fireEvent.click(await screen.findByRole("button", { name: "Reverse" }));
        const confirm = await screen.findByRole("button", { name: "Post the reversal" });
        expect(confirm).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Posted twice" } });
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(backend.calls).toContainEqual({ method: "POST", path: "/finance/ledger/p1_a/reverse", body: { reason: "Posted twice" } })
        );
        expect(toast.success).toHaveBeenCalledWith("LGR-p1_a reversed", expect.anything());
    });

    it("offers no Reverse on a reversal or on one already reversed", async () => {
        await renderPage();
        fireEvent.click(screen.getByText("LGR-p1_b"));
        expect(await screen.findByText(/A reversal cannot itself be reversed/)).toBeInTheDocument();
        fireEvent.click(screen.getByText("LGR-p1_c"));
        expect(await screen.findByText(/Already reversed by LGR-2026-000300/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Reverse" })).toBeNull();
    });

    it("says the debit once across every match", async () => {
        await renderPage();
        const line = screen.getByText(/debited across/);
        expect(line).toHaveTextContent("₹4,82,500.00 debited across 548 transactions");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("flags debits and credits that differ in the danger tone", async () => {
        backend.totals = { debit: "482500.00", credit: "482000.00" };
        await renderPage();
        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("₹4,82,500.00 debited but ₹4,82,000.00 credited across 548 transactions");
        expect(alert.className).toContain("text-danger");
    });

    it("exports the filtered set as a CSV", async () => {
        await renderPage();
        fireEvent.change(screen.getByLabelText("Search"), { target: { value: "sharma" } });
        await waitFor(() => expect(backend.lastLedger().get("q")).toBe("sharma"));
        fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved ledger-2026-10-02.csv", expect.anything()));
        expect(backend.calls).toContainEqual({ method: "BLOB", path: "/finance/ledger/export.csv?q=sharma", body: undefined });
    });

    it("shows the server's sentence when the export is too large", async () => {
        const sentence =
            "These filters match 60,000 ledger lines, more than the 50,000 one file can hold. Narrow the date range or add a filter, then export again.";
        backend.exportError = new ApiError(422, "VALIDATION_ERROR", sentence);
        let release!: () => void;
        backend.exportGate = new Promise<void>((resolve) => {
            release = resolve;
        });
        await renderPage();
        fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
        expect(await screen.findByRole("button", { name: /Exporting/ })).toBeDisabled();
        release();
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(sentence));
        expect(screen.getByRole("button", { name: /Export CSV/ })).toBeEnabled();
    });
});
