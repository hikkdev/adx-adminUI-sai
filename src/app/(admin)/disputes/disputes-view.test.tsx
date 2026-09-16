import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The desk deciding a case, live.
 *
 * One case in the queue and an in-memory backend that keeps the disputes
 * module's rules — the thread is read by id, a note is required to move or
 * decide, a credit is recorded pending and released in a second step — so
 * what is walked is what ops does: open the case, read both sides, decide,
 * release. The service and its URLs are real; only the transport is faked.
 */

const { backend } = vi.hoisted(() => {
    const now = "2026-09-11T06:00:00.000Z";
    const base = {
        id: "dsp_1",
        displayId: "DSP-1109-2601",
        raisedByUserId: "usr_adv",
        raisedAs: "ADVERTISER",
        againstParty: "PUBLISHER",
        againstUserId: "usr_pub",
        orderId: "ord_00000341",
        listingId: "lst_1",
        reason: "PROOF_REJECTED",
        detail: "The after photo shows the wrong wall.",
        expectedResolution: "Re-review my proof",
        amountClaimed: "1200.00",
        status: "OPEN",
        statusNote: null,
        slaDueAt: "2026-09-14T06:00:00.000Z",
        reviewStartedAt: null,
        resolvedAt: null,
        outcome: null,
        resolutionNote: null,
        creditedAmount: null,
        creditStatus: "NONE",
        creditReleasedAt: null,
        reopenUntil: null,
        createdAt: "2026-09-10T06:00:00.000Z",
        updatedAt: "2026-09-10T06:00:00.000Z",
        order: { id: "ord_00000341", status: "COMPLETED", campaignName: null, listing: { id: "lst_1", title: "Warehouse Gate 2, Koramangala", address: "Koramangala", city: "Bengaluru" } },
    };
    const backend = {
        dispute: { ...base } as Record<string, unknown>,
        messages: [] as Record<string, unknown>[],
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.dispute = { ...base };
            this.messages = [{ id: "m1", authorUserId: "usr_adv", authorName: "Meera S", isFromOps: false, body: "Please look again.", createdAt: now }];
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path.startsWith("/disputes?")) {
                // E6: the list contract, with the chips counted without the status facet.
                return {
                    items: [{ ...this.dispute, messageCount: this.messages.length, evidenceCount: 0 }],
                    total: 1,
                    page: 1,
                    pageSize: 50,
                    counts: { OPEN: 1, UNDER_REVIEW: 2, AWAITING_RESPONSE: 0, ESCALATED: 3, RESOLVED: 4, REJECTED: 1 },
                };
            }
            if (method === "GET" && path === "/disputes/summary") return { open: 1, valueAtRisk: "1200.00", slaBreaches: 0, avgResolutionDays: 0, creditedThisMonth: "0.00", rejectedThisMonth: 0 };
            if (method === "GET" && path === "/disputes/dsp_1") {
                return {
                    ...this.dispute,
                    raisedBy: { id: "usr_adv", name: "Meera S" },
                    // E7-3: the record the case is against, on the ADMIN read.
                    against: { type: "PUBLISHER", id: "pub_1", displayId: "PUB-0007", name: "Kumar Stores" },
                    messages: this.messages,
                    evidence: [],
                };
            }
            if (method === "POST" && path === "/disputes/dsp_1/messages") {
                const { body: text } = body as { body: string };
                this.messages.push({ id: `m${this.messages.length + 1}`, authorUserId: "usr_admin", authorName: "ADX Ops", isFromOps: true, body: text, createdAt: now });
                return this.messages[this.messages.length - 1];
            }
            if (method === "POST" && path === "/disputes/dsp_1/resolve") {
                const input = body as { outcome: string; note: string; creditAmount?: string };
                Object.assign(this.dispute, { status: input.outcome === "NO_FAULT" ? "REJECTED" : "RESOLVED", outcome: input.outcome, resolutionNote: input.note, resolvedAt: now, creditedAmount: input.creditAmount ?? null, creditStatus: input.creditAmount ? "PENDING" : "NONE" });
                return this.dispute;
            }
            if (method === "POST" && path === "/disputes/dsp_1/credit/release") {
                Object.assign(this.dispute, { creditStatus: "RELEASED", creditReleasedAt: now });
                return this.dispute;
            }
            throw new Error(`No route ${method} ${path}`);
        },
    };
    return { backend };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(500, "INTERNAL", (cause as Error).message);
        }
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

import { disputeService } from "@/services/disputes";
import { DEFAULT_DISPUTE_FACETS, disputeQueryOf, type DisputeFacets } from "./disputes-loader";
import { DisputesView } from "./disputes-view";

beforeEach(() => backend.reset());

async function mount(facets: DisputeFacets = DEFAULT_DISPUTE_FACETS) {
    const [page, summary] = await Promise.all([disputeService.queue(disputeQueryOf(facets)), disputeService.summary()]);
    const onChanged = vi.fn();
    const onFacetsChange = vi.fn();
    const view = render(<DisputesView page={page} summary={summary} facets={facets} onFacetsChange={onFacetsChange} onChanged={onChanged} />);
    await screen.findByText("Please look again.");
    return { ...view, onChanged, onFacetsChange };
}

describe("the desk on a live case", () => {
    it("reads the thread by id, names the order and site, and answers as ADX Ops", async () => {
        await mount();
        expect(backend.calls.some((call) => call.method === "GET" && call.path === "/disputes/dsp_1")).toBe(true);
        expect(screen.getByRole("link", { name: "ORDER #0341" })).toHaveAttribute("href", "/orders/ord_00000341");
        expect(screen.getByText(/Warehouse Gate 2, Koramangala · Filed/)).toBeTruthy();
        expect(screen.getByText("Re-review my proof", { exact: false })).toBeTruthy();

        fireEvent.change(screen.getByPlaceholderText(/reply as adx ops/i), { target: { value: "Send a wider photo." } });
        fireEvent.click(screen.getByRole("button", { name: /send/i }));
        await screen.findByText("Send a wider photo.");
        expect(backend.calls.some((call) => call.method === "POST" && call.path === "/disputes/dsp_1/messages")).toBe(true);
    });

    it("refuses a decision without a note, then records a partial credit pending finance and releases it in a second step", async () => {
        const { onChanged } = await mount();
        fireEvent.click(screen.getByRole("button", { name: /partial credit/i }));
        expect(backend.calls.some((call) => call.path === "/disputes/dsp_1/resolve")).toBe(false);

        fireEvent.change(screen.getByPlaceholderText(/add a note for the case record/i), { target: { value: "Reinstall approved at no cost." } });
        fireEvent.change(screen.getByLabelText(/partial credit amount/i), { target: { value: "450" } });
        fireEvent.click(screen.getByRole("button", { name: /partial credit/i }));
        await waitFor(() => expect(backend.calls.some((call) => call.path === "/disputes/dsp_1/resolve")).toBe(true));
        const resolve = backend.calls.find((call) => call.path === "/disputes/dsp_1/resolve");
        expect(resolve?.body).toEqual({ outcome: "PARTIAL_CREDIT", note: "Reinstall approved at no cost.", creditAmount: "450" });
        await waitFor(() => expect(onChanged).toHaveBeenCalled());

        const release = await screen.findByRole("button", { name: /release credit/i });
        expect(screen.getByText(/credit approved — pending finance release/)).toBeTruthy();
        fireEvent.click(release);
        await waitFor(() => expect(backend.calls.some((call) => call.path === "/disputes/dsp_1/credit/release")).toBe(true));
        await screen.findByText(/released to the wallet/);
    });

    it("says the clock is paused while a party answers, links the re-install to the order's milestone card, and names the open fraud case", async () => {
        Object.assign(backend.dispute, {
            status: "AWAITING_RESPONSE",
            sla: { breached: false, paused: true, dueAt: "2026-09-14T06:00:00.000Z", dueIn: 72 * 3_600_000 },
            reinstallMilestoneId: "mls_1",
            reinstallStatus: "DISPATCHED",
            reinstallPending: true,
            openFraudCase: { id: "frd_1", displayId: "FRD-26-0001", status: "INVESTIGATING" },
        });
        await mount();
        expect(screen.getByTestId("dispute-sla").textContent).toMatch(/SLA paused/);
        expect(screen.getByTestId("dispute-reinstall")).toHaveAttribute("href", "/orders/ord_00000341#milestones");
        expect(screen.getByTestId("dispute-reinstall").textContent).toMatch(/Re-install dispatched — pending/);
        expect(screen.getByTestId("dispute-fraud-case")).toHaveAttribute("href", "/disputes/fraud?case=frd_1");
        expect(screen.queryByRole("button", { name: /open fraud case/i })).toBeNull();
    });

    it("offers to open a fraud case against the other party when none cites the dispute", async () => {
        await mount();
        expect(screen.getByRole("button", { name: /open fraud case/i })).toBeTruthy();
        expect(screen.queryByTestId("dispute-reinstall")).toBeNull();
    });

    it("reads the queue on the list contract, counts the chips off the server, and sends a chip or a search back as facets", async () => {
        const { onFacetsChange } = await mount({ chip: "open", q: "wall", page: 2 });
        const read = backend.calls.find((call) => call.method === "GET" && call.path.startsWith("/disputes?"));
        expect(read?.path).toBe("/disputes?q=wall&status=OPEN%2CUNDER_REVIEW%2CAWAITING_RESPONSE&page=2&pageSize=50");

        const chips = screen.getAllByRole("tab");
        expect(chips.map((chip) => chip.textContent)).toEqual(["Open3", "Escalated3", "Resolved5"]);
        fireEvent.click(screen.getByRole("tab", { name: /escalated/i }));
        expect(onFacetsChange).toHaveBeenLastCalledWith({ chip: "escalated", q: "wall", page: 1 });

        fireEvent.change(screen.getByPlaceholderText(/search by number/i), { target: { value: "gate" } });
        expect(onFacetsChange).toHaveBeenLastCalledWith({ chip: "open", q: "gate", page: 1 });
        expect(screen.queryByTestId("dispute-pager")).toBeNull();
    });

    it("names the record the case is against and pre-fills it, locked, as the fraud case's subject", async () => {
        await mount();
        await waitFor(() => expect(screen.getByTestId("dispute-parties").textContent).toContain("Kumar Stores (publisher) · PUB-0007"));
        fireEvent.click(screen.getByRole("button", { name: /open fraud case/i }));
        const subjectId = await screen.findByLabelText(/publisher id/i);
        expect(subjectId).toHaveValue("pub_1");
        expect(subjectId).toBeDisabled();
    });
});

describe("the desk with nothing in the queue", () => {
    it("draws its empty state and reads no thread, rather than dereferencing a read that never happened", async () => {
        const summary = await disputeService.summary();
        const empty = { items: [], total: 1, page: 1, pageSize: 50, counts: {} };
        backend.calls = [];

        // The by-id read is keyed on the selected case, and the selection is
        // the first row. With no rows there is no id and no read, and the check
        // that a read belonged to the selection was `detail?.id === rowId` —
        // true for `undefined === undefined`, after which `detail.value`
        // dereferenced null and the boundary took the page (ERR-7F3A21C9).
        render(<DisputesView page={empty} summary={summary} facets={DEFAULT_DISPUTE_FACETS} onFacetsChange={vi.fn()} />);

        expect(screen.getByText("No disputes match.")).toBeInTheDocument();
        expect(backend.calls.filter((call) => call.path.startsWith("/disputes/dsp_"))).toEqual([]);
    });
});
