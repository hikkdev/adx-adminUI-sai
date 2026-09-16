import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lot B (B4b) — print partners, the service half.
 *
 * What this pins: the roster query sends only what was asked for and the
 * active facet as the string the schema parses; a job is read under its
 * order and a missing one is null rather than a failed request; the ladder
 * helpers know a rung above from a rung below and that CANCELLED closes once
 * the cost is approved; and the cost gate is the backend's own — READY or
 * COLLECTED with an actual cost above zero, once.
 */

const { backend } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: null as unknown,
        status: 200,
        reset() {
            this.calls = [];
            this.answer = null;
            this.status = 200;
        },
    };
    return { backend };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return {
        ...actual,
        apiConfig: { ...actual.apiConfig, live: true },
        isLive: () => true,
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.status !== 200) throw new actual.ApiError(backend.status, "NOT_FOUND", "No such thing");
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

import {
    PRINT_JOB_LADDER,
    PRINT_JOB_STATUS_META,
    QUOTE_REQUEST_STATUS_META,
    INVOICE_MONTH_PATTERN,
    QUOTE_STATUS_META,
    SIGN_IN_STATE_META,
    awardBody,
    awardNeedsNote,
    canActivate,
    canApproveCost,
    canAward,
    canCancelRequest,
    canRequestQuotes,
    capabilitiesLine,
    lastSignInLabel,
    quoteRequestsPath,
    rateCardProblem,
    deadlineCountdown,
    defaultAward,
    defaultDeadline,
    nextJobStatuses,
    partnerMovesLine,
    partnersPath,
    printPartnerService,
    signInState,
    specsFromOrder,
    specsSummary,
    type PrintQuote,
    type PrintQuoteRequest,
} from "./print-partners";

beforeEach(() => backend.reset());

describe("the roster query", () => {
    it("sends only what was asked for, and the active facet as the string the schema parses", () => {
        expect(partnersPath()).toBe("/print-partners?pageSize=100");
        expect(partnersPath({ q: " Balaji ", city: "Bengaluru", active: false, page: 2, pageSize: 20 })).toBe(
            "/print-partners?q=Balaji&city=Bengaluru&active=false&page=2&pageSize=20"
        );
        expect(partnersPath({ active: true, page: 1 })).toBe("/print-partners?active=true&pageSize=100");
    });

    it("answers null for a partner that is not there, and throws for anything else", async () => {
        backend.status = 404;
        await expect(printPartnerService.get("prt_missing")).resolves.toBeNull();
        backend.status = 500;
        await expect(printPartnerService.get("prt_1")).rejects.toThrow();
    });

    it("writes the partner routes the README lists", async () => {
        backend.answer = { id: "prt_1" };
        await printPartnerService.create({ name: "Balaji Prints", mobile: "9845012345", capabilities: ["flex"] });
        await printPartnerService.update("prt_1", { city: "Bengaluru" });
        await printPartnerService.deactivate("prt_1", "  ");
        await printPartnerService.deactivate("prt_1", "Closed down");
        await printPartnerService.reactivate("prt_1");
        await printPartnerService.ledger("prt_1");
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "POST /print-partners",
            "PATCH /print-partners/prt_1",
            "POST /print-partners/prt_1/deactivate",
            "POST /print-partners/prt_1/deactivate",
            "POST /print-partners/prt_1/reactivate",
            "GET /print-partners/prt_1/ledger?limit=100",
        ]);
        expect(backend.calls[2]?.body).toEqual({});
        expect(backend.calls[3]?.body).toEqual({ reason: "Closed down" });
    });
});

describe("the order's job", () => {
    it("is read under the order, and a missing one is null", async () => {
        backend.status = 404;
        await expect(printPartnerService.jobForOrder("ord_1")).resolves.toBeNull();
        expect(backend.calls[0]?.path).toBe("/orders/ord_1/print-job");
    });

    it("opens, moves and approves at the order's path with the schemas' bodies", async () => {
        backend.answer = { id: "pj_1" };
        await printPartnerService.openJob("ord_1", { printPartnerId: "prt_1", quotedCost: "1200.00", notes: null });
        await printPartnerService.updateJob("ord_1", { status: "READY" });
        await printPartnerService.updateJob("ord_1", { actualCost: "1350.00" });
        await printPartnerService.approveCost("ord_1");
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "POST /orders/ord_1/print-job",
            "PATCH /orders/ord_1/print-job",
            "PATCH /orders/ord_1/print-job",
            "POST /orders/ord_1/print-job/approve-cost",
        ]);
        expect(backend.calls[0]?.body).toEqual({ printPartnerId: "prt_1", quotedCost: "1200.00", notes: null });
        expect(backend.calls[3]?.body).toBeUndefined();
    });
});

describe("the ladder", () => {
    it("is the README's five rungs, in order, each labelled", () => {
        expect(PRINT_JOB_LADDER).toEqual(["REQUESTED", "ACCEPTED", "PRINTING", "READY", "COLLECTED"]);
        for (const rung of [...PRINT_JOB_LADDER, "CANCELLED" as const]) expect(PRINT_JOB_STATUS_META[rung].label).toMatch(/\S/);
    });

    it("offers only the rungs above, plus CANCELLED until the cost is approved", () => {
        expect(nextJobStatuses({ status: "REQUESTED", costApprovedAt: null })).toEqual([
            "ACCEPTED",
            "PRINTING",
            "READY",
            "COLLECTED",
            "CANCELLED",
        ]);
        expect(nextJobStatuses({ status: "READY", costApprovedAt: "2026-09-12T00:00:00Z" })).toEqual(["COLLECTED"]);
        expect(nextJobStatuses({ status: "COLLECTED", costApprovedAt: null })).toEqual(["CANCELLED"]);
        expect(nextJobStatuses({ status: "CANCELLED", costApprovedAt: null })).toEqual([]);
    });

    it("gates the money the way the backend does", () => {
        expect(canApproveCost({ status: "READY", actualCost: "1350.00", costApprovedAt: null })).toBe(true);
        expect(canApproveCost({ status: "COLLECTED", actualCost: "0.01", costApprovedAt: null })).toBe(true);
        expect(canApproveCost({ status: "PRINTING", actualCost: "1350.00", costApprovedAt: null })).toBe(false);
        expect(canApproveCost({ status: "READY", actualCost: null, costApprovedAt: null })).toBe(false);
        expect(canApproveCost({ status: "READY", actualCost: "0.00", costApprovedAt: null })).toBe(false);
        expect(canApproveCost({ status: "READY", actualCost: "1350.00", costApprovedAt: "2026-09-12T00:00:00Z" })).toBe(false);
    });
});

describe("the row", () => {
    it("prints what a shop can do, or a dash for a shop that listed nothing", () => {
        expect(capabilitiesLine({ capabilities: ["flex", "vinyl"] })).toBe("flex, vinyl");
        expect(capabilitiesLine({ capabilities: [] })).toBe("—");
    });
});

/* ------------------------------------------------------------------ */
/* Lot H (Q147): the desk's other half                                 */
/* ------------------------------------------------------------------ */

describe("activation", () => {
    it("switches the account on at the activate route, and reads the rate card and the quote history", async () => {
        backend.answer = { id: "prt_1", activated: true };
        await printPartnerService.activate("prt_1");
        await printPartnerService.rateCard("prt_1");
        await printPartnerService.quotesFor("prt_1");
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "POST /print-partners/prt_1/activate",
            "GET /print-partners/prt_1/rate-card",
            "GET /print-partners/prt_1/quotes",
        ]);
        expect(backend.calls[0]?.body).toBeUndefined();
    });

    it("reads the sign-in state off the roster switch and the activation stamp", () => {
        expect(signInState({ isActive: true, activatedAt: null })).toBe("INVITED");
        expect(signInState({ isActive: true, activatedAt: "2026-09-14T09:00:00Z" })).toBe("ACTIVE");
        expect(signInState({ isActive: false, activatedAt: "2026-09-14T09:00:00Z" })).toBe("OFF");
        expect(signInState({ isActive: false, activatedAt: null })).toBe("OFF");
        for (const state of ["ACTIVE", "INVITED", "OFF"] as const) expect(SIGN_IN_STATE_META[state].label).toMatch(/\S/);
    });

    it("offers activation only to a partner on the roster whose account is still off", () => {
        expect(canActivate({ isActive: true, activatedAt: null })).toBe(true);
        expect(canActivate({ isActive: true, activatedAt: "2026-09-14T09:00:00Z" })).toBe(false);
        expect(canActivate({ isActive: false, activatedAt: null })).toBe(false);
    });

    it("lines up the partner's own moves on a job", () => {
        const none = { partnerAcceptedAt: null, partnerDeclinedAt: null, declineReason: null, handoverConfirmedAt: null };
        expect(partnerMovesLine(none)).toBeNull();
        expect(partnerMovesLine({ ...none, partnerAcceptedAt: "2026-09-14T09:00:00Z" })).toBe("accepted");
        expect(partnerMovesLine({ ...none, partnerDeclinedAt: "2026-09-14T09:00:00Z", declineReason: "Machine down" })).toBe(
            "declined — Machine down"
        );
        expect(
            partnerMovesLine({ ...none, partnerAcceptedAt: "2026-09-14T09:00:00Z", handoverConfirmedAt: "2026-09-15T09:00:00Z" })
        ).toBe("accepted · handover confirmed by scan");
    });
});

const quote = (id: string, amount: string, extra: Partial<PrintQuote> = {}): PrintQuote => ({
    id,
    requestId: "pqr_1",
    printPartnerId: `prt_${id}`,
    amount,
    turnaroundDays: 3,
    note: null,
    status: "SUBMITTED",
    submittedAt: "2026-09-14T09:00:00Z",
    partner: { id: `prt_${id}`, displayId: null, name: `Shop ${id}`, city: "Bengaluru", hasRateCard: false, isActive: true },
    lowest: false,
    ...extra,
});

const request = (quotes: PrintQuote[], extra: Partial<PrintQuoteRequest> = {}): PrintQuoteRequest => ({
    id: "pqr_1",
    orderId: "ord_1",
    specs: { size: "10x20 ft" },
    city: "Bengaluru",
    deadlineAt: "2026-09-16T09:00:00Z",
    status: "OPEN",
    inviteMode: "AUTO",
    invitedPartnerIds: quotes.map((row) => row.printPartnerId),
    reinvitedAt: null,
    awardedQuoteId: null,
    awardNote: null,
    lowestQuoteId: quotes.find((row) => row.lowest)?.id ?? null,
    quotes,
    createdById: "usr_ops",
    createdAt: "2026-09-14T09:00:00Z",
    updatedAt: "2026-09-14T09:00:00Z",
    ...extra,
});

describe("the quote desk", () => {
    it("reads the order's request as null when none was raised, and raises and awards at the order's path", async () => {
        backend.status = 404;
        await expect(printPartnerService.quoteRequestForOrder("ord_1")).resolves.toBeNull();
        backend.reset();
        backend.answer = { id: "pqr_1" };
        await printPartnerService.requestQuotes("ord_1", { specs: { size: "10x20 ft" }, invite: "AUTO" });
        await printPartnerService.requestQuotes("ord_1", { specs: { size: "10x20 ft" }, invite: ["prt_a"], deadlineAt: "2026-09-16T09:00:00Z" });
        await printPartnerService.award("ord_1");
        await printPartnerService.award("ord_1", { quoteId: "pq_b", note: "Closer to the site" });
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "POST /orders/ord_1/print-quote-request",
            "POST /orders/ord_1/print-quote-request",
            "POST /orders/ord_1/print-quote-request/award",
            "POST /orders/ord_1/print-quote-request/award",
        ]);
        expect(backend.calls[0]?.body).toEqual({ specs: { size: "10x20 ft" }, invite: "AUTO" });
        expect(backend.calls[1]?.body).toEqual({ specs: { size: "10x20 ft" }, invite: ["prt_a"], deadlineAt: "2026-09-16T09:00:00Z" });
        expect(backend.calls[2]?.body).toEqual({});
        expect(backend.calls[3]?.body).toEqual({ quoteId: "pq_b", note: "Closer to the site" });
    });

    it("takes the lowest by default — the backend's own pick, not the first row", () => {
        const lowest = quote("pq_b", "900.00", { lowest: true });
        const higher = quote("pq_a", "1200.00");
        expect(defaultAward(request([lowest, higher]))?.id).toBe("pq_b");
        // The lowest is marked but no longer standing (withdrawn after the read): the first standing one stands in.
        expect(
            defaultAward(request([quote("pq_b", "900.00", { lowest: true, status: "WITHDRAWN" }), higher], { lowestQuoteId: "pq_b" }))?.id
        ).toBe("pq_a");
        expect(defaultAward(request([]))).toBeNull();
    });

    it("needs no note for the lowest, and a note of at least three characters for any other standing quote", () => {
        const lowest = quote("pq_b", "900.00", { lowest: true });
        const higher = quote("pq_a", "1200.00");
        const rejected = quote("pq_c", "800.00", { status: "REJECTED" });
        const open = request([lowest, higher, rejected]);

        expect(awardNeedsNote(open, null)).toBe(false);
        expect(awardNeedsNote(open, "pq_b")).toBe(false);
        expect(awardNeedsNote(open, "pq_a")).toBe(true);

        expect(awardBody(open, null, "")).toEqual({ quoteId: "pq_b" });
        expect(awardBody(open, "pq_b", "  ")).toEqual({ quoteId: "pq_b" });
        expect(awardBody(open, "pq_b", "Their turnaround")).toEqual({ quoteId: "pq_b", note: "Their turnaround" });
        expect(awardBody(open, "pq_a", "")).toBeNull();
        expect(awardBody(open, "pq_a", "ok")).toBeNull();
        expect(awardBody(open, "pq_a", " Closer to the site ")).toEqual({ quoteId: "pq_a", note: "Closer to the site" });
        // A decided quote cannot be awarded, note or not.
        expect(awardBody(open, "pq_c", "Cheapest of all")).toBeNull();
        // Nothing standing: no body at all.
        expect(awardBody(request([rejected]), null, "")).toBeNull();
    });

    it("awards only an OPEN request with something standing, and raises anew over anything but an OPEN request", () => {
        const lowest = quote("pq_b", "900.00", { lowest: true });
        expect(canAward(request([lowest]))).toBe(true);
        expect(canAward(request([lowest], { status: "AWARDED" }))).toBe(false);
        expect(canAward(request([]))).toBe(false);
        // The deadline closes quoting, not deciding: a past deadline still awards.
        expect(canAward(request([lowest], { deadlineAt: "2020-01-01T00:00:00Z" }))).toBe(true);

        expect(canRequestQuotes(null)).toBe(true);
        expect(canRequestQuotes({ status: "EXPIRED" })).toBe(true);
        expect(canRequestQuotes({ status: "CANCELLED" })).toBe(true);
        expect(canRequestQuotes({ status: "OPEN" })).toBe(false);
        // Awarded, and the job since cancelled: the card shows the button only with no live job, and the backend takes it.
        expect(canRequestQuotes({ status: "AWARDED" })).toBe(true);
    });

    it("counts down to the deadline and says when it passed", () => {
        const now = new Date("2026-09-14T09:00:00Z");
        expect(deadlineCountdown("2026-09-16T11:30:00Z", now)).toEqual({ label: "in 2d 2h", passed: false });
        expect(deadlineCountdown("2026-09-14T12:20:00Z", now)).toEqual({ label: "in 3h 20m", passed: false });
        expect(deadlineCountdown("2026-09-14T09:05:00Z", now)).toEqual({ label: "in 5m", passed: false });
        expect(deadlineCountdown("2026-09-14T04:00:00Z", now)).toEqual({ label: "passed 5h 0m ago", passed: true });
        expect(defaultDeadline(now)).toBe("2026-09-16T09:00:00.000Z");
    });

    it("prefills the specs from the spot the order's listing join carries, and nothing it did not", () => {
        expect(
            specsFromOrder({
                spot: { size: "10x20 ft", widthFt: "10.00", heightFt: "20.00", category: "OUTDOOR", subType: "Hoarding", placement: "Rooftop" },
                designUrl: "https://cdn.adx.in/art.pdf",
                campaignName: "Diwali",
            })
        ).toEqual({
            size: "10x20 ft",
            widthFt: "10.00",
            heightFt: "20.00",
            material: "OUTDOOR · Hoarding",
            placement: "Rooftop",
            campaign: "Diwali",
            artworkUrl: "https://cdn.adx.in/art.pdf",
        });
        expect(specsFromOrder({ spot: null, designUrl: null, campaignName: null })).toEqual({});
        expect(
            specsFromOrder({
                spot: { size: null, widthFt: null, heightFt: null, category: "INDOOR", subType: null, placement: null },
                designUrl: null,
                campaignName: null,
            })
        ).toEqual({ material: "INDOOR" });
    });

    it("summarises the specs the way the partner's notification does, leaving the artwork link out", () => {
        expect(specsSummary({ size: "10x20 ft", material: "OUTDOOR", artworkUrl: "https://x", nested: { a: 1 }, qty: 2 })).toBe(
            "size 10x20 ft, material OUTDOOR, qty 2"
        );
        expect(specsSummary({})).toBe("Print specs attached");
    });

    it("G13-B: reads the desk's list in one call under its filters, and cancels an OPEN request with a reason", async () => {
        expect(quoteRequestsPath({ status: ["OPEN", "AWARDED"], q: " Pune ", page: 2, pageSize: 50 })).toBe("/print-quote-requests?status=OPEN%2CAWARDED&q=Pune&page=2&pageSize=50");
        expect(quoteRequestsPath()).toBe("/print-quote-requests?pageSize=100");
        backend.reset();
        backend.answer = { items: [], total: 0, page: 1, pageSize: 100, counts: { OPEN: 0 } };
        const page = await printPartnerService.quoteRequests({ status: ["OPEN"] });
        expect(backend.calls[0]).toMatchObject({ method: "GET", path: "/print-quote-requests?status=OPEN&pageSize=100" });
        expect(page.counts).toEqual({ OPEN: 0 });
        backend.answer = request([], { id: "pqr_1", orderId: "ord_1", status: "CANCELLED" });
        await printPartnerService.cancelQuoteRequest("ord_1", "  Publisher withdrew the site ");
        expect(backend.calls[1]).toEqual({ method: "POST", path: "/orders/ord_1/print-quote-request/cancel", body: { reason: "Publisher withdrew the site" } });
        expect(canCancelRequest({ status: "OPEN" })).toBe(true);
        expect(canCancelRequest({ status: "AWARDED" })).toBe(false);
    });

    it("G13-B: sets the rate card and records an invoice on the partner's behalf, and lists the invoices with their months", async () => {
        backend.reset();
        backend.answer = { partnerId: "pp_1", hasRateCard: true, fileId: null, fileUrl: null, updatedAt: null, rows: [] };
        const rows = [{ material: "Flex", unit: "sq ft", ratePerUnit: "18.00" }];
        expect(rateCardProblem({ rows: [] })).toMatch(/file or at least one row/);
        expect(rateCardProblem({ rows: [{ material: "Flex", unit: "sq ft", ratePerUnit: "0" }] })).toMatch(/above zero/);
        expect(rateCardProblem({ fileId: "file_1", rows: [] })).toBeNull();
        expect(rateCardProblem({ rows })).toBeNull();
        await printPartnerService.setRateCard("pp_1", { rows });
        await printPartnerService.recordInvoice("pp_1", { fileId: "file_9", month: "2026-08" });
        backend.answer = [{ id: "file_9", filename: "aug.pdf", mimeType: "application/pdf", sizeBytes: 10, url: "/api/v1/files/file_9", createdAt: "2026-09-01T00:00:00Z", month: "2026-08", recordedBy: "ADMIN" }];
        const invoices = await printPartnerService.invoicesFor("pp_1");
        expect(backend.calls.map((call) => [call.method, call.path])).toEqual([
            ["PUT", "/print-partners/pp_1/rate-card"],
            ["POST", "/print-partners/pp_1/invoices"],
            ["GET", "/print-partners/pp_1/invoices"],
        ]);
        expect(backend.calls[0]?.body).toEqual({ rows });
        expect(backend.calls[1]?.body).toEqual({ fileId: "file_9", month: "2026-08" });
        expect(invoices[0]).toMatchObject({ month: "2026-08", recordedBy: "ADMIN" });
        expect(INVOICE_MONTH_PATTERN.test("2026-08")).toBe(true);
        expect(INVOICE_MONTH_PATTERN.test("2026-13")).toBe(false);
        const stamp = (iso: string) => `at ${iso}`;
        expect(lastSignInLabel({ lastLoginAt: "2026-09-13T04:00:00Z", activatedAt: "2026-09-01T00:00:00Z" }, stamp)).toBe("at 2026-09-13T04:00:00Z");
        expect(lastSignInLabel({ lastLoginAt: null, activatedAt: "2026-09-01T00:00:00Z" }, stamp)).toBe("never");
        expect(lastSignInLabel({ lastLoginAt: null, activatedAt: null }, stamp)).toBe("not activated");
        expect(lastSignInLabel({ activatedAt: null }, stamp)).toBe("—");
    });

    it("labels every request and quote status", () => {
        for (const status of ["OPEN", "AWARDED", "CANCELLED", "EXPIRED"] as const) expect(QUOTE_REQUEST_STATUS_META[status].label).toMatch(/\S/);
        for (const status of ["SUBMITTED", "ACCEPTED", "REJECTED", "WITHDRAWN"] as const) expect(QUOTE_STATUS_META[status].label).toMatch(/\S/);
    });
});
