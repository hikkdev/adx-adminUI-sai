import { describe, expect, it, vi } from "vitest";

/**
 * The operator's own feed as the bell, the drawer and the centre read it.
 *
 * What is pinned is the part a click-through cannot catch: the routes and
 * bodies (a mark-read that hits the wrong path marks nothing), the record a
 * notice opens, the time line, and the matrix's shape — every kind on every
 * channel, mandatory cells drawn as Required rather than switched off.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string, answer: unknown = {}) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return answer;
    };
    return {
        ...actual,
        api: {
            get: record("GET", { notifications: [], unreadCount: 0 }),
            post: record("POST"),
            patch: record("PATCH"),
            put: record("PUT"),
            delete: record("DELETE"),
        },
    };
});
vi.mock("@/lib/api-config", () => ({ isLive: () => true, apiConfig: { live: true } }));

import {
    NOTIFICATION_CHANNELS,
    NOTIFICATION_TYPES,
    feedPath,
    notificationHref,
    notificationService,
    preferenceMatrix,
    relativeTime,
    shapeFeed,
    shapeNotification,
    type PreferenceRow,
    type WireNotification,
} from "./notifications";

const wire = (over: Partial<WireNotification> = {}): WireNotification => ({
    id: "ntf_cuid",
    type: "DISPUTE",
    title: "Dispute breaches SLA in 6 hours",
    message: "₹4,80,000 at risk on Hebbal Flyover.",
    read: false,
    createdAt: "2026-09-13T06:36:00.000Z",
    ...over,
});

const NOW = new Date("2026-09-13T07:00:00.000Z");

describe("shapeNotification", () => {
    it("draws the kind's tone, the subtitle ahead of the message, and the time line", () => {
        const row = shapeNotification(wire({ subtitle: "Hindustan Paints Ltd" }), NOW);
        expect(row.tone).toBe("danger");
        expect(row.body).toBe("Hindustan Paints Ltd · ₹4,80,000 at risk on Hebbal Flyover.");
        expect(row.time).toBe("24 minutes ago");
        expect(row.read).toBe(false);
    });

    it("opens the record the notice is about, and nothing when there is none", () => {
        expect(shapeNotification(wire({ relatedType: "ORDER", relatedId: "ord_1" }), NOW).href).toBe("/orders/ord_1");
        expect(shapeNotification(wire({ relatedType: "CAMPAIGN", relatedId: "cmp_1" }), NOW).href).toBe("/campaigns/cmp_1");
        expect(shapeNotification(wire({ relatedType: "PUBLISHER", relatedId: "pub_1" }), NOW).href).toBe("/publishers/pub_1");
        expect(shapeNotification(wire(), NOW).href).toBeNull();
        expect(notificationHref("SOMETHING_NEW", "x")).toBeNull();
        expect(notificationHref("ORDER", null)).toBeNull();
    });

    it("folds a kind this console does not know onto SYSTEM rather than crashing the tone lookup", () => {
        const row = shapeNotification(wire({ type: "FUTURE" as WireNotification["type"] }), NOW);
        expect(row.type).toBe("SYSTEM");
        expect(row.tone).toBe("warning");
    });

    it("carries the unread count beside the rows", () => {
        const feed = shapeFeed({ notifications: [wire(), wire({ id: "b", read: true })], unreadCount: 7 }, NOW);
        expect(feed.items).toHaveLength(2);
        expect(feed.unreadCount).toBe(7);
    });

    it("carries the read count beside the unread one (E10-1), and null on a feed older than it", () => {
        expect(shapeFeed({ notifications: [], unreadCount: 7, readCount: 12 }, NOW).readCount).toBe(12);
        expect(shapeFeed({ notifications: [], unreadCount: 7 }, NOW).readCount).toBeNull();
    });
});

describe("relativeTime", () => {
    it("counts minutes, hours and days, then prints the date", () => {
        expect(relativeTime("2026-09-13T06:59:40.000Z", NOW)).toBe("just now");
        expect(relativeTime("2026-09-13T06:59:00.000Z", NOW)).toBe("1 minute ago");
        expect(relativeTime("2026-09-13T05:00:00.000Z", NOW)).toBe("2 hours ago");
        expect(relativeTime("2026-09-12T06:00:00.000Z", NOW)).toMatch(/^Yesterday, /);
        expect(relativeTime("2026-09-10T07:00:00.000Z", NOW)).toBe("3 days ago");
        expect(relativeTime("2026-08-01T07:00:00.000Z", NOW)).toMatch(/Aug 2026/);
    });
});

describe("feedPath", () => {
    it("sends only what was asked, on the names the README gives", () => {
        expect(feedPath()).toBe("/notifications");
        expect(feedPath({ limit: 20 })).toBe("/notifications?limit=20");
        expect(feedPath({ limit: 100, unreadOnly: true, type: "KYC" })).toBe(
            "/notifications?limit=100&unreadOnly=true&type=KYC"
        );
        expect(feedPath({ unreadOnly: false, offset: 0 })).toBe("/notifications");
    });
});

describe("preferenceMatrix", () => {
    const rows: PreferenceRow[] = NOTIFICATION_TYPES.flatMap((type) =>
        NOTIFICATION_CHANNELS.map((channel) => ({
            type,
            channel,
            enabled: channel === "IN_APP",
            mandatory: (type === "SYSTEM" && channel !== "IN_APP" && channel !== "PUSH") || (type === "ANNOUNCEMENT" && channel === "SMS"),
        }))
    );

    it("groups every kind over its four channels, in the enum's order", () => {
        const groups = preferenceMatrix(rows);
        expect(groups.map((group) => group.type)).toEqual([...NOTIFICATION_TYPES]);
        expect(groups[0].channels.map((cell) => cell.channel)).toEqual([...NOTIFICATION_CHANNELS]);
    });

    it("keeps the server's Required flag on the cell rather than deciding it here", () => {
        const system = preferenceMatrix(rows).find((group) => group.type === "SYSTEM")!;
        expect(system.channels.find((cell) => cell.channel === "SMS")?.mandatory).toBe(true);
        expect(system.channels.find((cell) => cell.channel === "PUSH")?.mandatory).toBe(false);
    });

    it("draws only the cells the API sent, never an invented one", () => {
        const groups = preferenceMatrix(rows.filter((row) => row.type === "KYC" && row.channel === "EMAIL"));
        expect(groups).toHaveLength(1);
        expect(groups[0].channels).toHaveLength(1);
    });
});

describe("notificationService", () => {
    it("reads the feed, marks one and all read, and writes the matrix on the README's routes", async () => {
        calls.length = 0;
        await notificationService.list({ limit: 20 });
        await notificationService.markRead("ntf_1");
        await notificationService.markAllRead();
        await notificationService.preferences();
        await notificationService.savePreferences([{ type: "KYC", channel: "EMAIL", enabled: false }]);
        expect(calls).toEqual([
            { method: "GET", path: "/notifications?limit=20", body: undefined },
            { method: "PATCH", path: "/notifications/ntf_1/read", body: undefined },
            { method: "PATCH", path: "/notifications/read-all", body: undefined },
            { method: "GET", path: "/notifications/preferences", body: undefined },
            {
                method: "PUT",
                path: "/notifications/preferences",
                body: [{ type: "KYC", channel: "EMAIL", enabled: false }],
            },
        ]);
    });
});
