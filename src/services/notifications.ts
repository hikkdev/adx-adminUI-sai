import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { Tone } from "@/types";

/**
 * The operator's own notification feed — `GET /notifications`, the two
 * mark-read routes and the preference matrix — DR 10's drawer (`5102:20032`)
 * and centre (`5102:39414`).
 *
 * Every route here is scoped to the calling user by the backend: the bell
 * counts what ADX has told *this* operator, and the Preferences card writes
 * *their* matrix. There is no admin view over somebody else's feed, and none
 * is drawn.
 *
 * No fixture fallback. The six seeded `ntf_*` rows are gone rather than
 * kept: their ids were never issued by the backend, their "severity" was
 * prose nobody computed, and Mark all read on them changed a `useState`.
 * With the API off the bell shows nothing and the centre says so.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** `NotificationType`, exactly the backend's enum. */
export const NOTIFICATION_TYPES = [
    "ORDER",
    "BOOKING",
    "PAYOUT",
    "KYC",
    "MESSAGE",
    "SYSTEM",
    "DISPUTE",
    "ANNOUNCEMENT",
    /* Lot AA: a work task assigned, due, blocked or awaiting review. */
    "WORK",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
    ORDER: "Orders",
    BOOKING: "Bookings",
    PAYOUT: "Payouts",
    KYC: "KYC",
    MESSAGE: "Messages",
    SYSTEM: "System",
    DISPUTE: "Disputes",
    ANNOUNCEMENT: "Announcements",
    WORK: "Work",
};

/**
 * The dot beside a row. The frame draws a traffic light per notice; the API
 * carries no severity, so the tone is the kind's — a dispute is the one
 * thing on the feed with a clock on it, a payout is money that moved.
 */
export const NOTIFICATION_TYPE_TONE: Record<NotificationType, Tone> = {
    DISPUTE: "danger",
    KYC: "warning",
    SYSTEM: "warning",
    PAYOUT: "success",
    ORDER: "info",
    BOOKING: "info",
    MESSAGE: "info",
    ANNOUNCEMENT: "neutral",
    WORK: "info",
};

/** `NotificationChannel` — where a kind may be delivered (DR 07 wave 5, decision 5). */
export const NOTIFICATION_CHANNELS = ["IN_APP", "PUSH", "EMAIL", "SMS"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = {
    IN_APP: "In-app",
    PUSH: "Push",
    EMAIL: "Email",
    SMS: "SMS",
};

/* ------------------------------------------------------------------ */
/* The feed                                                            */
/* ------------------------------------------------------------------ */

/** A notification exactly as the API sends it. */
export interface WireNotification {
    id: string;
    userId?: string;
    type: NotificationType;
    title: string;
    subtitle?: string | null;
    message: string;
    suggestedAction?: string | null;
    relatedId?: string | null;
    /** Lot E7: what `relatedId` names — ORDER | PUBLISHER | ADVERTISER | CAMPAIGN | STATEMENT | WITHDRAWAL | TICKET … */
    relatedType?: string | null;
    payload?: unknown;
    read: boolean;
    createdAt: string;
}

/** `{ notifications, unreadCount, readCount }` — the feed with the bell's number beside it; E10-1: `readCount` too, both over the whole feed. */
export interface WireFeed {
    notifications: WireNotification[];
    unreadCount: number;
    readCount?: number;
}

/** One row of the drawer or the centre, as the console draws it. */
export interface NotificationRow {
    id: string;
    type: NotificationType;
    tone: Tone;
    title: string;
    /** The message, with the subtitle ahead of it when the API sent one. */
    body: string;
    /** "24 minutes ago" — the frame's time line, from `createdAt`. */
    time: string;
    createdAt: string;
    read: boolean;
    /** The console page for the record the notice is about, when it has one. */
    href: string | null;
}

export interface NotificationFeed {
    items: NotificationRow[];
    unreadCount: number;
    /** E10-1: the read notices across the whole feed, whatever the page holds. Null on a feed older than the count. */
    readCount: number | null;
}

/**
 * The console route for what a notice is about. Null when `relatedType` is
 * something this console has no page for, or when the API sent none: a row
 * without an Open link is the honest state, not a link to `/`.
 */
export function notificationHref(
    relatedType: string | null | undefined,
    relatedId: string | null | undefined
): string | null {
    if (!relatedId) return null;
    const id = encodeURIComponent(relatedId);
    switch ((relatedType ?? "").toUpperCase()) {
        case "ORDER":
            return `/orders/${id}`;
        case "PUBLISHER":
            return `/publishers/${id}`;
        case "ADVERTISER":
            return `/advertisers/${id}`;
        case "AGENT":
            return `/agents/${id}`;
        case "CAMPAIGN":
            return `/campaigns/${id}`;
        case "LISTING":
            return `/listings/${id}`;
        case "CREATIVE":
            return `/moderation/${id}`;
        case "TICKET":
            return `/support?ticket=${id}`;
        case "DISPUTE":
            return `/disputes?case=${id}`;
        case "INVOICE":
            return `/finance/invoices/${id}`;
        case "STATEMENT":
            return "/finance/ledger";
        case "WITHDRAWAL":
            return "/finance";
        default:
            return null;
    }
}

/**
 * "just now", "24 minutes ago", "Yesterday, 6:05 PM", "2 days ago" — the
 * frame's time line. Past a week the date is printed rather than counted,
 * because "34 days ago" is arithmetic the reader has to undo.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
    const at = new Date(iso);
    const ms = now.getTime() - at.getTime();
    if (!Number.isFinite(ms)) return "";
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) {
        const clock = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).format(at);
        return `Yesterday, ${clock}`;
    }
    if (days < 7) return `${days} days ago`;
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(at);
}

export function shapeNotification(wire: WireNotification, now: Date = new Date()): NotificationRow {
    const type = NOTIFICATION_TYPES.includes(wire.type) ? wire.type : "SYSTEM";
    const subtitle = wire.subtitle?.trim();
    return {
        id: wire.id,
        type,
        tone: NOTIFICATION_TYPE_TONE[type],
        title: wire.title,
        body: subtitle ? `${subtitle} · ${wire.message}` : wire.message,
        time: relativeTime(wire.createdAt, now),
        createdAt: wire.createdAt,
        read: wire.read,
        href: notificationHref(wire.relatedType, wire.relatedId),
    };
}

export function shapeFeed(wire: WireFeed, now: Date = new Date()): NotificationFeed {
    return {
        items: (wire.notifications ?? []).map((row) => shapeNotification(row, now)),
        unreadCount: wire.unreadCount ?? 0,
        readCount: typeof wire.readCount === "number" ? wire.readCount : null,
    };
}

/** `?limit=&offset=&unreadOnly=&type=` — the feed's query. */
export interface FeedQuery {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    type?: NotificationType;
}

/** The `?a=b` for the feed, skipping what is unset. */
export function feedPath(query: FeedQuery = {}): string {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.offset) params.set("offset", String(query.offset));
    if (query.unreadOnly) params.set("unreadOnly", "true");
    if (query.type) params.set("type", query.type);
    const text = params.toString();
    return text ? `/notifications?${text}` : "/notifications";
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

/** One cell of the matrix, as `GET /notifications/preferences` sends every cell. */
export interface PreferenceRow {
    type: NotificationType;
    channel: NotificationChannel;
    enabled: boolean;
    /** True when the row cannot be switched off — drawn as Required. */
    mandatory: boolean;
}

/** One kind with its four channels — the card's rows. */
export interface PreferenceGroup {
    type: NotificationType;
    label: string;
    channels: PreferenceRow[];
}

/**
 * The matrix grouped by kind, in the enum's order, each kind's channels in
 * the channels' order. A cell the API left out (it never does — the invariant
 * is every kind on every channel) is simply not drawn rather than invented.
 */
export function preferenceMatrix(rows: PreferenceRow[]): PreferenceGroup[] {
    return NOTIFICATION_TYPES.map((type) => ({
        type,
        label: NOTIFICATION_TYPE_LABEL[type],
        channels: NOTIFICATION_CHANNELS.map((channel) =>
            rows.find((row) => row.type === type && row.channel === channel)
        ).filter((row): row is PreferenceRow => row !== undefined),
    })).filter((group) => group.channels.length > 0);
}

/** The `PUT /notifications/preferences` body: an upsert per cell, only the cells that moved. */
export type PreferenceInput = Pick<PreferenceRow, "type" | "channel" | "enabled">;

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/** Whether the bell, the drawer and the centre read the API. With it off they say so. */
export const notificationsReadApi = (): boolean => isLive("notifications");

export const notificationService = {
    /** The feed, newest first, with the unread count beside it. */
    list: async (query: FeedQuery = {}): Promise<NotificationFeed> =>
        shapeFeed(await http.get<WireFeed>(feedPath(query))),

    /** One row read. 404 when it is somebody else's — the backend never says whose. */
    markRead: (id: string) => http.patch<{ message: string }>(`/notifications/${encodeURIComponent(id)}/read`),

    /** Every row of the caller's read. */
    markAllRead: () => http.patch<{ message: string }>("/notifications/read-all"),

    /** Every kind on every channel, defaulted where the operator has saved nothing. */
    preferences: () => http.get<PreferenceRow[]>("/notifications/preferences"),

    /** An upsert per cell. A mandatory cell sent off is kept on by the server. */
    savePreferences: (rows: PreferenceInput[]) =>
        http.put<{ message: string }>("/notifications/preferences", rows),
};
