import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Ticket } from "@/types";
import type { TicketQueuePage } from "@/services/support";
import type { QueueFacets } from "./support-loader";

/**
 * The desk answering a ticket, live.
 *
 * One ticket in the queue and an in-memory backend that keeps the support
 * module's rules — the thread is read by id, a reply lands on it signed "ADX
 * Support", an internal note is flagged and never a first response, resolving
 * and pausing are the ops PATCH — so what is walked is what an operator does:
 * open the ticket, read both sides, answer, note, pause, resolve. The service
 * and its URLs are real; only the transport is faked.
 */

const { backend } = vi.hoisted(() => {
    type Message = { id: string; ticketId: string; authorId: string; authorName: string; message: string; internal?: boolean; createdAt: string };
    const backend = {
        status: "OPEN" as "OPEN" | "WAITING" | "CLOSED",
        messages: [] as Message[],
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.status = "OPEN";
            this.calls = [];
            this.messages = [
                { id: "m1", ticketId: "tkt_1", authorId: "usr_owner", authorName: "Ravi Kumar", message: "Still no payout.", createdAt: "2026-09-11T06:12:00.000Z" },
            ];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path === "/support/tickets/tkt_1") {
                return { ...ticket, status: this.status, messages: this.messages };
            }
            if (method === "GET" && path === "/support/tickets/tkt_1/requester") {
                return {
                    user: { id: "usr_owner", name: "Ravi Kumar", mobile: "+919900000001", email: null, isActive: true, createdAt: "2026-08-01T00:00:00.000Z", roles: ["PUBLISHER"], role: "PUBLISHER" },
                    party: { type: "PUBLISHER", id: "pub_1", displayId: "PUB-0007", name: "Ravi Kumar", kycStatus: "VERIFIED" },
                    walletBalance: "1250.50",
                    openOrders: 2,
                    openTickets: 1,
                    recentActivity: [{ action: "PAYOUT_REQUESTED", at: "2026-09-10T06:00:00.000Z" }],
                };
            }
            if (method === "POST" && path === "/support/tickets/tkt_1/reply") {
                const { message, internal } = body as { message: string; internal?: boolean };
                const reply: Message = {
                    id: `m${this.messages.length + 1}`,
                    ticketId: "tkt_1",
                    authorId: "usr_admin",
                    authorName: internal ? "Priya Rao" : "ADX Support",
                    message,
                    internal: internal ?? false,
                    createdAt: "2026-09-11T06:30:00.000Z",
                };
                this.messages.push(reply);
                return reply;
            }
            if (method === "PATCH" && path === "/support/tickets/tkt_1") {
                const patch = body as { status?: "OPEN" | "WAITING" | "CLOSED" };
                if (patch.status) this.status = patch.status;
                return { ...ticket, status: this.status };
            }
            throw new Error(`No route ${method} ${path}`);
        },
    };
    const ticket = {
        id: "tkt_1",
        userId: "usr_owner",
        displayId: "TKT-1109-2601",
        kind: "ISSUE",
        title: "Payout stuck",
        description: "My payout has not arrived.",
        category: "PAYMENT",
        status: "OPEN",
        priority: "HIGH",
        assignedAgentId: null,
        assignedAt: null,
        assignedById: null,
        assignedAdminUserId: null,
        assignedAdminAt: null,
        team: null,
        firstRespondedAt: null,
        relatedOrderId: null,
        attachmentUrls: ["https://cdn.adx.in/u/shot.png"],
        createdAt: "2026-09-11T06:10:00.000Z",
        sla: { firstResponseBreached: false, resolutionBreached: false, paused: false, dueIn: 2 * 3_600_000 + 14 * 60_000, firstResponseDueAt: null, resolutionDueAt: null },
        requester: { userId: "usr_owner", name: "Ravi Kumar", role: "PUBLISHER", displayId: "PUB-0007" },
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

import { SupportConsole, teamChipsOf } from "./support-console";

const ticket: Ticket = {
    id: "tkt_1",
    userId: "usr_owner",
    displayId: "TKT-1109-2601",
    kind: "ISSUE",
    title: "Payout stuck",
    description: "My payout has not arrived.",
    category: "PAYMENT",
    status: "OPEN",
    priority: "HIGH",
    assignedAgentId: null,
    assignedAt: null,
    assignedById: null,
    assignedAdminUserId: null,
    assignedAdminAt: null,
    team: null,
    firstRespondedAt: null,
    relatedOrderId: null,
    attachmentUrls: ["https://cdn.adx.in/u/shot.png"],
    createdAt: "2026-09-11T06:10:00.000Z",
    sla: { firstResponseBreached: false, resolutionBreached: false, paused: false, dueIn: 2 * 3_600_000 + 14 * 60_000, firstResponseDueAt: null, resolutionDueAt: null },
    requester: { userId: "usr_owner", name: "Ravi Kumar", role: "PUBLISHER", displayId: "PUB-0007" },
};

const facets: QueueFacets = { chip: "open", priority: "ALL", breached: false, q: "", kind: "ALL", team: null };

const pageOf = (rows: Ticket[]): TicketQueuePage => ({
    items: rows,
    total: rows.length,
    page: 1,
    pageSize: 100,
    counts: { OPEN: rows.filter((row) => row.status === "OPEN").length, WAITING: rows.filter((row) => row.status === "WAITING").length, CLOSED: rows.filter((row) => row.status === "CLOSED").length },
});

const renderDesk = (rows: Ticket[] = [ticket], onChanged?: () => void) =>
    render(<SupportConsole page={pageOf(rows)} facets={facets} onFacetsChange={() => {}} agents={[]} admins={[]} onChanged={onChanged} />);

beforeEach(() => backend.reset());

describe("the desk on a live ticket", () => {
    it("reads the thread by id, shows the raiser's side, the priority and the SLA countdown", async () => {
        renderDesk();
        await screen.findByText("Still no payout.");
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toContain("GET /support/tickets/tkt_1");
        expect(screen.getAllByText("TKT-1109-2601").length).toBeGreaterThan(0);
        expect(screen.getByRole("link", { name: /attachment 1/i })).toHaveAttribute("href", "https://cdn.adx.in/u/shot.png");
        expect(screen.getAllByText("High").length).toBeGreaterThan(0);
        expect(screen.getAllByText("2h 14m left").length).toBeGreaterThan(0);
        expect(screen.queryByText(/^internal note$/i)).toBeNull();
    });

    it("answers on the thread as ADX Support and re-reads it", async () => {
        renderDesk();
        await screen.findByText("Still no payout.");
        const composer = screen.getByPlaceholderText(/reply as adx support/i);
        fireEvent.change(composer, { target: { value: "We traced the delay to our bank partner." } });
        fireEvent.click(screen.getByRole("button", { name: /send/i }));
        await screen.findByText("We traced the delay to our bank partner.");
        const reply = backend.calls.find((call) => call.path === "/support/tickets/tkt_1/reply");
        expect(reply?.body).toEqual({ message: "We traced the delay to our bank partner." });
        expect(screen.getAllByText(/ADX Support/).length).toBeGreaterThan(0);
        expect((composer as HTMLInputElement).value).toBe("");
    });

    it("posts an internal note with internal: true and draws it as one", async () => {
        renderDesk();
        await screen.findByText("Still no payout.");
        fireEvent.click(screen.getByRole("switch", { name: /internal note/i }));
        const composer = screen.getByPlaceholderText(/internal note/i);
        fireEvent.change(composer, { target: { value: "Flagged to engineering." } });
        fireEvent.click(screen.getByRole("button", { name: /save note/i }));
        await screen.findByText("Flagged to engineering.");
        const note = backend.calls.find((call) => call.path === "/support/tickets/tkt_1/reply");
        expect(note?.body).toEqual({ message: "Flagged to engineering.", internal: true });
        expect(screen.getByText(/^internal note$/i)).toBeTruthy();
    });

    it("pauses the clock with WAITING and resolves through the same PATCH", async () => {
        const onChanged = vi.fn();
        renderDesk([ticket], onChanged);
        await screen.findByText("Still no payout.");
        fireEvent.click(screen.getByRole("button", { name: /waiting on the requester/i }));
        await waitFor(() => expect(backend.status).toBe("WAITING"));
        const waiting = backend.calls.find((call) => call.method === "PATCH");
        expect(waiting?.body).toEqual({ status: "WAITING" });
        fireEvent.click(screen.getByRole("button", { name: /resolve ticket/i }));
        await waitFor(() => expect(backend.status).toBe("CLOSED"));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    });

    it("offers to reopen a closed ticket and shows a paused clock on a waiting one", async () => {
        backend.status = "CLOSED";
        renderDesk([{ ...ticket, status: "CLOSED" }]);
        await screen.findByText("Still no payout.");
        expect(screen.getByRole("button", { name: /reopen ticket/i })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /resolve ticket/i })).toBeNull();
        expect(screen.queryByRole("button", { name: /waiting on the requester/i })).toBeNull();
    });

    it("names the requester on the row and draws the rail from GET /support/tickets/:id/requester", async () => {
        renderDesk();
        await screen.findByText("Still no payout.");
        expect(screen.getByTestId("queue-requester").textContent).toBe("Ravi Kumar · Publisher");
        const rail = screen.getByTestId("requester-rail");
        await waitFor(() => expect(rail.textContent).toContain("PUB-0007"));
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toContain("GET /support/tickets/tkt_1/requester");
        expect(within(rail).getByRole("link", { name: "PUB-0007" })).toHaveAttribute("href", "/publishers/pub_1");
        expect(within(rail).getByRole("link", { name: /view in admin/i })).toHaveAttribute("href", "/publishers/pub_1");
        expect(rail.textContent).toContain("Payout requested");
        expect(within(rail).getByText("2")).toBeTruthy();
        expect(within(rail).getByRole("button", { name: /start audited session/i })).toBeEnabled();
    });

    it("says the clock is paused on a WAITING ticket and offers Resume", async () => {
        backend.status = "WAITING";
        renderDesk([{ ...ticket, status: "WAITING", sla: { ...ticket.sla, paused: true } }]);
        await screen.findByText("Still no payout.");
        expect(screen.getAllByText(/clock paused/i).length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: /^resume$/i })).toBeTruthy();
    });
});

describe("the team chips — E10-1", () => {
    it("come from the queue's teams facet, the whole queue's, not the page's rows", () => {
        expect(teamChipsOf({ teams: ["Payouts", "Billing"], items: [{ team: "Onboarding" }] }, null)).toEqual(["Billing", "Payouts"]);
    });

    it("keep the team in force drawn even when the facet no longer names it", () => {
        expect(teamChipsOf({ teams: ["Billing"], items: [] }, "Payouts")).toEqual(["Billing", "Payouts"]);
    });

    it("fall back to the rows on a page older than the facet", () => {
        expect(teamChipsOf({ items: [{ team: "Payouts" }, { team: null }, { team: "Billing" }] }, null)).toEqual(["Billing", "Payouts"]);
    });
});
