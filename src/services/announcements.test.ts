import { describe, expect, it, vi } from "vitest";

/**
 * Announcements as the console sends them — Lot E (Q64, Q130).
 *
 * The one rule the composer enforces before the server would is that SMS
 * goes only with a CRITICAL announcement: the checkbox is disabled for a
 * NORMAL one and the body never carries SMS, whatever was ticked before the
 * importance changed. A broadcast reaches thousands of phones, so the
 * routes and bodies are pinned exactly.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return {
        ...actual,
        api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") },
    };
});

import {
    announcementProblem,
    announcementsQuery,
    announcementsService,
    canCancel,
    canSend,
    channelsFor,
    deliveredCounts,
    smsAllowed,
    type AnnouncementInput,
} from "./announcements";

const input = (over: Partial<AnnouncementInput> = {}): AnnouncementInput => ({
    title: "Scheduled maintenance on Sunday",
    body: "ADX will be unavailable from 1:00 AM to 4:00 AM IST while the booking engine is upgraded.",
    audience: "ALL",
    city: null,
    channels: ["IN_APP", "EMAIL"],
    importance: "NORMAL",
    ...over,
});

describe("the SMS gate (Q130)", () => {
    it("allows SMS only with a CRITICAL announcement", () => {
        expect(smsAllowed("CRITICAL")).toBe(true);
        expect(smsAllowed("NORMAL")).toBe(false);
    });

    it("always adds in-app and drops SMS from a NORMAL announcement, whatever was ticked", () => {
        expect(channelsFor(["EMAIL", "SMS"], "NORMAL")).toEqual(["IN_APP", "EMAIL"]);
        expect(channelsFor(["EMAIL", "SMS"], "CRITICAL")).toEqual(["IN_APP", "EMAIL", "SMS"]);
        expect(channelsFor([], "CRITICAL")).toEqual(["IN_APP"]);
        expect(channelsFor(["IN_APP", "IN_APP"], "NORMAL")).toEqual(["IN_APP"]);
        // G10/G11-2: push rides on any importance — the dispatcher's push rail carries it.
        expect(channelsFor(["PUSH"], "NORMAL")).toEqual(["IN_APP", "PUSH"]);
    });

    it("refuses a body that asks for SMS on a NORMAL announcement, and lets a CRITICAL one through", () => {
        expect(announcementProblem(input({ channels: ["IN_APP", "SMS"] }))).toMatch(/CRITICAL/);
        expect(announcementProblem(input({ channels: ["IN_APP", "SMS"], importance: "CRITICAL" }))).toBeNull();
    });

    it("never posts SMS for a NORMAL announcement even when the caller passes it", async () => {
        calls.length = 0;
        await announcementsService.create(input({ channels: ["IN_APP", "EMAIL", "SMS"] }));
        expect(calls[0].body).toMatchObject({ channels: ["IN_APP", "EMAIL"], importance: "NORMAL" });
        await announcementsService.create(input({ channels: ["IN_APP", "EMAIL", "SMS"], importance: "CRITICAL" }));
        expect(calls[1].body).toMatchObject({ channels: ["IN_APP", "EMAIL", "SMS"], importance: "CRITICAL" });
    });
});

describe("the composer's other refusals", () => {
    it("wants a title and a body within the server's bounds", () => {
        expect(announcementProblem(input({ title: "Hi" }))).toMatch(/title/);
        expect(announcementProblem(input({ title: "x".repeat(141) }))).toMatch(/title/);
        expect(announcementProblem(input({ body: "  " }))).toMatch(/message/);
        expect(announcementProblem(input({ body: "x".repeat(4001) }))).toMatch(/message/);
        expect(announcementProblem(input())).toBeNull();
    });
});

describe("reading a row", () => {
    it("can be sent from DRAFT or SCHEDULED, and cancelled while not yet SENT", () => {
        expect(canSend("DRAFT")).toBe(true);
        expect(canSend("SCHEDULED")).toBe(true);
        expect(canSend("SENDING")).toBe(false);
        expect(canCancel("SENDING")).toBe(true);
        expect(canCancel("SENT")).toBe(false);
        expect(canCancel("CANCELLED")).toBe(false);
    });

    it("counts the marks that reached someone per channel, skips aside", () => {
        const counts = deliveredCounts({
            deliveredByChannel: { IN_APP: { DELIVERED: 4218 }, EMAIL: { QUEUED: 3900, SKIPPED: 318 }, SMS: { DELIVERED: 10, FAILED: 2 } },
        });
        expect(counts.total).toBe(4218 + 3900 + 10);
        expect(counts.byChannel).toEqual([
            { channel: "IN_APP", reached: 4218, skipped: 0 },
            { channel: "EMAIL", reached: 3900, skipped: 318 },
            { channel: "SMS", reached: 10, skipped: 2 },
        ]);
        expect(deliveredCounts({ deliveredByChannel: null })).toEqual({ total: 0, byChannel: [] });
    });
});

describe("the routes", () => {
    it("lists, drafts, previews, sends, schedules and cancels where the module mounts them", async () => {
        calls.length = 0;
        await announcementsService.list({ status: ["SCHEDULED"], audience: "AGENTS", sort: "newest" });
        await announcementsService.create(input({ city: " Bengaluru " }));
        await announcementsService.get("ann_1");
        await announcementsService.previewCount("ann_1");
        await announcementsService.previewDraft({ audience: "PUBLISHERS", city: " Pune ", channels: ["IN_APP", "SMS"], importance: "NORMAL" });
        await announcementsService.send("ann_1");
        await announcementsService.send("ann_1", "2026-09-20T03:30:00.000Z");
        await announcementsService.cancel("ann_1");
        expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
            "GET /announcements?status=SCHEDULED&audience=AGENTS&sort=newest&page=1&pageSize=20",
            "POST /announcements",
            "GET /announcements/ann_1",
            "GET /announcements/ann_1/preview-count",
            "POST /announcements/preview-count",
            "POST /announcements/ann_1/send",
            "POST /announcements/ann_1/send",
            "POST /announcements/ann_1/cancel",
        ]);
        expect(calls[1].body).toMatchObject({ city: "Bengaluru", audience: "ALL" });
        // The draft preview carries only what decides the audience — trimmed city, the resolved channels — never the words.
        expect(calls[4].body).toEqual({ audience: "PUBLISHERS", city: "Pune", channels: ["IN_APP"], importance: "NORMAL" });
        expect(calls[5].body).toEqual({});
        expect(calls[6].body).toEqual({ scheduledAt: "2026-09-20T03:30:00.000Z" });
        expect(announcementsQuery()).toBe("page=1&pageSize=20");
    });
});
