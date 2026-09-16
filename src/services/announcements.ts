import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";
import type { ListPage, NotificationChannel } from "./comms";

/**
 * Announcements — a broadcast from ops, Lot E (decisions 64 and 130).
 *
 * `POST /announcements` drafts one for an audience (optionally one city);
 * `POST /announcements/preview-count` (E10-2) says how many people each
 * channel would reach for a body still being typed, persisted nowhere, so
 * the composer shows the reach live and drafts only on Send;
 * `GET /:id/preview-count` is the same answer over a stored row; `POST
 * /:id/send` sends it or books it for a time; `POST /:id/cancel` stops it
 * while it is still a draft, scheduled, or between batches. The bell row is always written; email goes to everyone with an
 * address who has not unsubscribed; SMS goes only with a CRITICAL
 * announcement — the server refuses SMS on a NORMAL one with 400, and this
 * composer never offers it.
 *
 * No fixtures: the three seeded rows the composer used to draw were sends
 * nobody made, with delivered counts nobody counted.
 */

export const ANNOUNCEMENT_AUDIENCES = ["ALL", "PUBLISHERS", "ADVERTISERS", "AGENTS"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
    ALL: "All users",
    PUBLISHERS: "Publishers",
    ADVERTISERS: "Advertisers",
    AGENTS: "Agents",
};

export const ANNOUNCEMENT_IMPORTANCES = ["NORMAL", "CRITICAL"] as const;
export type AnnouncementImportance = (typeof ANNOUNCEMENT_IMPORTANCES)[number];

export const ANNOUNCEMENT_STATUSES = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELLED"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_STATUS_META: Record<AnnouncementStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    SCHEDULED: { label: "Scheduled", tone: "info" },
    SENDING: { label: "Sending", tone: "warning" },
    SENT: { label: "Sent", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/** The channels the composer can offer. G10/G11-2: PUSH is a real channel — the dispatcher's push rail carries it to every device on file. */
export const ANNOUNCEMENT_CHANNELS = ["IN_APP", "EMAIL", "SMS", "PUSH"] as const;
export type AnnouncementChannel = (typeof ANNOUNCEMENT_CHANNELS)[number];

export interface Announcement {
    id: string;
    title: string;
    body: string;
    audience: AnnouncementAudience;
    city: string | null;
    channels: NotificationChannel[];
    importance: AnnouncementImportance;
    scheduledAt: string | null;
    status: AnnouncementStatus;
    /** The audience size at send time. */
    recipientCount: number;
    /** Marks by channel and status once the walk finished: `{ EMAIL: { QUEUED: 12, SKIPPED: 3 } }`. */
    deliveredByChannel: Record<string, Record<string, number>> | null;
    createdById: string;
    sentAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface PreviewCount {
    audience: number;
    inApp: number;
    email: number;
    sms: number;
    /** G11-2: the `DeviceToken` rows whose owner is in the audience — devices, not people, one per phone — when PUSH is a channel, else 0. Absent on a backend older than the field. */
    push?: number;
    /** Why SMS is zero, when it is. */
    smsNote: string | null;
}

export interface AnnouncementInput {
    title: string;
    body: string;
    audience: AnnouncementAudience;
    city?: string | null;
    channels: AnnouncementChannel[];
    importance: AnnouncementImportance;
}

/** What the live reach is asked about: everything on the draft that decides who it goes to — never the words. */
export type PreviewInput = Pick<AnnouncementInput, "audience" | "city" | "channels" | "importance">;

/** The preview body as the server takes it; a NORMAL draft naming SMS is answered with `sms: 0` and a note, not refused. */
export function previewBody(input: PreviewInput): { audience: AnnouncementAudience; city: string | null; channels: AnnouncementChannel[]; importance: AnnouncementImportance } {
    return {
        audience: input.audience,
        city: input.city?.trim() || null,
        channels: channelsFor(input.channels, input.importance),
        importance: input.importance,
    };
}

/** A key that moves only when the reach could — the debounced preview refetches on this, not on every keystroke in the body. */
export const previewKey = (input: PreviewInput): string => JSON.stringify(previewBody(input));

export interface AnnouncementsQuery {
    q?: string;
    status?: readonly AnnouncementStatus[];
    audience?: AnnouncementAudience;
    sort?: "newest" | "oldest";
    page?: number;
    pageSize?: number;
}

export type AnnouncementsPage = ListPage<Announcement>;

/* ------------------------------------------------------------------ */
/* The SMS rule (Q130)                                                 */
/* ------------------------------------------------------------------ */

/** SMS goes only with a CRITICAL announcement; a NORMAL one never reaches it, whatever its channels say. */
export const smsAllowed = (importance: AnnouncementImportance): boolean => importance === "CRITICAL";

/**
 * The channels a draft will be sent with: in-app always, SMS only when the
 * importance allows it, push when asked for. This is what the checkboxes
 * resolve to, so the composer cannot post a body the server would refuse.
 */
export function channelsFor(selected: readonly AnnouncementChannel[], importance: AnnouncementImportance): AnnouncementChannel[] {
    const channels: AnnouncementChannel[] = ["IN_APP"];
    if (selected.includes("EMAIL")) channels.push("EMAIL");
    if (selected.includes("SMS") && smsAllowed(importance)) channels.push("SMS");
    if (selected.includes("PUSH")) channels.push("PUSH");
    return channels;
}

export const TITLE_MIN = 3;
export const TITLE_MAX = 140;
export const BODY_MIN = 3;
export const BODY_MAX = 4_000;

/** The server's refusals, said before the round trip. */
export function announcementProblem(input: AnnouncementInput): string | null {
    const title = input.title.trim();
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) return `The title is ${TITLE_MIN} to ${TITLE_MAX} characters.`;
    const body = input.body.trim();
    if (body.length < BODY_MIN || body.length > BODY_MAX) return `The message is ${BODY_MIN} to ${BODY_MAX} characters.`;
    if ((input.city ?? "").length > 80) return "The city name is too long.";
    if (input.channels.includes("SMS") && !smsAllowed(input.importance)) {
        return "SMS goes only with a CRITICAL announcement.";
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* Reading a row                                                       */
/* ------------------------------------------------------------------ */

export const canSend = (status: AnnouncementStatus): boolean => status === "DRAFT" || status === "SCHEDULED";
export const canCancel = (status: AnnouncementStatus): boolean =>
    status === "DRAFT" || status === "SCHEDULED" || status === "SENDING";

/** Marks that reached someone: in-app rows are DELIVERED at once, email and SMS are QUEUED for the dispatcher or DELIVERED by its report. */
const REACHED = ["DELIVERED", "SENT", "QUEUED"] as const;

/** How many (person, channel) marks reached someone, and per channel. */
export function deliveredCounts(announcement: Pick<Announcement, "deliveredByChannel">): {
    total: number;
    byChannel: { channel: string; reached: number; skipped: number }[];
} {
    const byChannel: { channel: string; reached: number; skipped: number }[] = [];
    let total = 0;
    for (const [channel, statuses] of Object.entries(announcement.deliveredByChannel ?? {})) {
        let reached = 0;
        let skipped = 0;
        for (const [status, count] of Object.entries(statuses)) {
            if ((REACHED as readonly string[]).includes(status)) reached += count;
            else skipped += count;
        }
        total += reached;
        byChannel.push({ channel, reached, skipped });
    }
    return { total, byChannel };
}

/** `?q=&status=&audience=&sort=&page=&pageSize=` for `GET /announcements`. */
export function announcementsQuery(query: AnnouncementsQuery = {}): string {
    const params = new URLSearchParams();
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.audience) params.set("audience", query.audience);
    if (query.sort) params.set("sort", query.sort);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    return params.toString();
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const announcementsReadApi = (): boolean => isLive("comms");

const path = (id: string) => `/announcements/${encodeURIComponent(id)}`;

export const announcementsService = {
    list: (query: AnnouncementsQuery = {}): Promise<AnnouncementsPage> =>
        http.get<AnnouncementsPage>(`/announcements?${announcementsQuery(query)}`),

    get: (id: string): Promise<Announcement> => http.get<Announcement>(path(id)),

    /** A DRAFT. IN_APP is always added; SMS on a NORMAL announcement is 400. Audited `ANNOUNCEMENT_CREATED`. */
    create: (input: AnnouncementInput): Promise<Announcement> =>
        http.post<Announcement>("/announcements", {
            title: input.title.trim(),
            body: input.body.trim(),
            audience: input.audience,
            city: input.city?.trim() || null,
            channels: channelsFor(input.channels, input.importance),
            importance: input.importance,
        }),

    /** Per channel, how many people this would reach if sent now. */
    previewCount: (id: string): Promise<PreviewCount> => http.get<PreviewCount>(`${path(id)}/preview-count`),

    /** E10-2: the same answer over a draft still being typed — nothing is stored. `comms.view`. */
    previewDraft: (input: PreviewInput): Promise<PreviewCount> => http.post<PreviewCount>("/announcements/preview-count", previewBody(input)),

    /** A future time books it (SCHEDULED); nothing, or a past time, sends now. From DRAFT or SCHEDULED only; 409 otherwise. */
    send: (id: string, scheduledAt?: string | null): Promise<Announcement> =>
        http.post<Announcement>(`${path(id)}/send`, scheduledAt ? { scheduledAt } : {}),

    /** From DRAFT, SCHEDULED or SENDING; a running send stops between batches. */
    cancel: (id: string): Promise<Announcement> => http.post<Announcement>(`${path(id)}/cancel`),
};
