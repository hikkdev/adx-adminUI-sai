import { describe, expect, it, vi } from "vitest";

/**
 * The desk's reading of a ticket.
 *
 * The wire says who wrote each message; the console needs which side it sits
 * on. The raiser is the ticket's `userId`, anybody else who could post is ADX,
 * and an internal note is ADX talking to ADX — the backend's own rules,
 * pinned here with the SLA badge the row prints and the queue's query string.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return { ok: true };
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

import { SUPPORT_AUTHOR, activityLabel, formatDuration, shapeRequesterRail, shapeThread, slaBadge, supportService, ticketQueuePath, type WireRequesterRail } from "./support";
import type { TicketSla } from "@/types";

describe("which side a message sits on", () => {
    it("is the raiser when the author is the ticket's user, ADX otherwise, and internal when flagged", () => {
        const shaped = shapeThread({
            userId: "usr_owner",
            messages: [
                { id: "m1", ticketId: "t1", authorId: "usr_owner", authorName: "Ravi Kumar", message: "Still stuck", createdAt: "2026-09-11T06:12:00.000Z" },
                { id: "m2", ticketId: "t1", authorId: "usr_admin", authorName: SUPPORT_AUTHOR, message: "On it", createdAt: "2026-09-11T06:20:00.000Z" },
                { id: "m3", ticketId: "t1", authorId: "usr_admin", authorName: "Priya Rao", message: "Flagged to engineering", internal: true, createdAt: "2026-09-11T06:25:00.000Z" },
            ],
        });
        expect(shaped.map((m) => m.kind)).toEqual(["requester", "support", "internal"]);
        expect(shaped[0]).toMatchObject({ id: "m1", from: "Ravi Kumar", body: "Still stuck" });
        expect(shaped[1].from).toBe("ADX Support");
        expect(shaped[1].at).not.toBe("2026-09-11T06:20:00.000Z");
    });

    it("keeps an empty thread empty rather than inventing the opening message", () => {
        expect(shapeThread({ userId: "u", messages: [] })).toEqual([]);
    });
});

describe("the SLA badge", () => {
    const sla = (over: Partial<TicketSla> = {}): TicketSla => ({
        firstResponseBreached: false,
        resolutionBreached: false,
        paused: false,
        dueIn: 2 * 3_600_000 + 14 * 60_000,
        firstResponseDueAt: null,
        resolutionDueAt: null,
        ...over,
    });

    it("counts down, turns amber inside the hour, and says breached in red", () => {
        expect(slaBadge(sla(), "OPEN")).toEqual({ label: "2h 14m left", tone: "success" });
        expect(slaBadge(sla({ dueIn: 20 * 60_000 }), "OPEN")).toEqual({ label: "20m left", tone: "warning" });
        expect(slaBadge(sla({ firstResponseBreached: true, dueIn: -3 * 3_600_000 }), "OPEN")).toEqual({
            label: "First response breached 3h 0m ago",
            tone: "danger",
        });
        expect(slaBadge(sla({ resolutionBreached: true, dueIn: -26 * 3_600_000 }), "OPEN")?.label).toBe("Resolution breached 1d 2h ago");
    });

    it("says the clock is paused on a WAITING ticket and shows nothing once closed", () => {
        expect(slaBadge(sla({ paused: true }), "WAITING")?.tone).toBe("info");
        expect(slaBadge(sla({ resolutionBreached: true }), "CLOSED")).toBeNull();
        expect(slaBadge(sla({ dueIn: null }), "OPEN")).toBeNull();
    });

    it("prints durations in the two largest units", () => {
        expect(formatDuration(12 * 60_000)).toBe("12m");
        expect(formatDuration(3 * 24 * 3_600_000 + 4 * 3_600_000)).toBe("3d 4h");
    });
});

describe("the queue's query string", () => {
    it("sends only the facets in force, with flags only when true", () => {
        expect(ticketQueuePath()).toBe("/support/tickets/queue?sort=OLDEST&pageSize=100");
        expect(ticketQueuePath({ q: "payout", status: ["OPEN", "WAITING"], mine: true, breached: false, priority: "HIGH" })).toBe(
            "/support/tickets/queue?q=payout&status=OPEN%2CWAITING&sort=OLDEST&pageSize=100&priority=HIGH&mine=true"
        );
    });
});

describe("the requester rail (E7-3)", () => {
    const wire = (over: Partial<WireRequesterRail> = {}): WireRequesterRail => ({
        user: { id: "usr_1", name: "Ravi Kumar", mobile: "+919900000001", email: null, isActive: true, createdAt: "2026-08-01T00:00:00.000Z", roles: ["PUBLISHER"], role: "PUBLISHER" },
        party: { type: "PUBLISHER", id: "pub_1", displayId: "PUB-0007", name: "Kumar Stores", kycStatus: "VERIFIED" },
        walletBalance: "1250.50",
        openOrders: 2,
        openTickets: 1,
        recentActivity: [{ action: "PAYOUT_REQUESTED", at: "2026-09-10T06:00:00.000Z" }],
        ...over,
    });

    it("names the party first, links its page, and keeps the money as the decimal string", () => {
        const rail = shapeRequesterRail(wire());
        expect(rail).toMatchObject({ userId: "usr_1", name: "Kumar Stores", role: "PUBLISHER", roleLabel: "Publisher", walletBalance: "1250.50", openOrders: 2, openTickets: 1 });
        expect(rail.party).toEqual({ type: "PUBLISHER", id: "pub_1", displayId: "PUB-0007", kycStatus: "VERIFIED", href: "/publishers/pub_1" });
        expect(rail.adminHref).toBe("/publishers/pub_1");
        expect(rail.recentActivity).toEqual([{ action: "PAYOUT_REQUESTED", label: "Payout requested", at: "2026-09-10T06:00:00.000Z" }]);
    });

    it("falls back to the account, then the mobile, and links the account when there is no record", () => {
        const noRecord = shapeRequesterRail(wire({ party: null, walletBalance: null, user: { ...wire().user!, name: null, role: "ADMIN" } }));
        expect(noRecord).toMatchObject({ name: "+919900000001", role: "ADMIN", roleLabel: "ADX staff", walletBalance: null, party: null, adminHref: "/users/usr_1" });
        const gone = shapeRequesterRail(wire({ user: null, party: null, recentActivity: [] }));
        expect(gone).toMatchObject({ userId: null, name: "Unknown requester", roleLabel: "No role", adminHref: null, recentActivity: [] });
        expect(activityLabel("SUPPORT_TICKET_NOTE_ADDED")).toBe("Support ticket note added");
    });

    it("reads the rail on the ticket's own route", async () => {
        calls.length = 0;
        await supportService.requester("tkt_1").catch(() => null);
        expect(calls[0]).toMatchObject({ method: "GET", path: "/support/tickets/tkt_1/requester" });
    });
});

describe("the calls the desk makes on a thread", () => {
    it("reads, replies (publicly and internally), pauses, moves and resolves on the ops routes", async () => {
        calls.length = 0;
        await supportService.ticket("tkt_1");
        await supportService.reply("tkt_1", "We traced it.");
        await supportService.reply("tkt_1", "Engineering is on it.", true);
        await supportService.waitOnRequester("tkt_1");
        await supportService.patch("tkt_1", { priority: "URGENT", assignedAdminUserId: "usr_admin", team: "Payments" });
        await supportService.close("tkt_1");
        await supportService.reopen("tkt_1");
        expect(calls).toEqual([
            { method: "GET", path: "/support/tickets/tkt_1", body: undefined },
            { method: "POST", path: "/support/tickets/tkt_1/reply", body: { message: "We traced it." } },
            { method: "POST", path: "/support/tickets/tkt_1/reply", body: { message: "Engineering is on it.", internal: true } },
            { method: "PATCH", path: "/support/tickets/tkt_1", body: { status: "WAITING" } },
            { method: "PATCH", path: "/support/tickets/tkt_1", body: { priority: "URGENT", assignedAdminUserId: "usr_admin", team: "Payments" } },
            { method: "PATCH", path: "/support/tickets/tkt_1", body: { status: "CLOSED" } },
            { method: "PATCH", path: "/support/tickets/tkt_1", body: { status: "OPEN" } },
        ]);
    });
});
