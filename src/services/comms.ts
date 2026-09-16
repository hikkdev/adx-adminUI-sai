import { api as http, saveBlob } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * The comms desk — Lot E's dispatcher as the console reads it.
 *
 * `GET/POST/PATCH /comms/templates` is the outbound copy per event: one row
 * per key, email and SMS bodies with `{{name}}` placeholders, a version that
 * the server bumps on every edit. `GET /comms/deliveries` is the log behind
 * every message that left — the recipient masked and hashed, never the
 * rendered text — and `POST /comms/deliveries/:id/resend` puts one back on
 * the queue, except for a sensitive template (an OTP, a payment link), which
 * the server refuses with 409 and this desk never offers.
 *
 * E10-2 (package CE8): a template row carries `stats` — what left, what a
 * rail confirmed, what failed over the last 30 Indian days; the delivery
 * page carries `byChannel` beside `counts`; `GET /comms/deliveries/export.csv`
 * is the log under the same filters as a file; `GET /comms/events` is the
 * catalogue of events the code raises with the variables each supplies, so
 * the editor can say which `{{name}}` nothing will ever fill; and
 * `GET /comms/sms-kinds` is the DLT vocabulary — the console no longer
 * mirrors `shared/sms`.
 *
 * Lot G (package CG4): a template carries `transactional` (Q117) — false
 * puts its copy under the platform's quiet hours and weekly cap, which
 * live on the settings row under `comms` and are edited on /settings;
 * `POST /comms/templates/:key/send-test` renders a template with sample
 * variables to the signed-in operator's own address and mobile, never to
 * an address the body names; and `GET /comms/deliveries/:id` carries
 * `attemptRows` (Q121) — one row per try, the rail's raw answer masked —
 * which the delivery log's detail card draws as the attempt trail.
 *
 * No fixtures: a seeded template beside a live one would be copy nobody
 * approved, and a seeded delivery a message nobody received.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const TEMPLATE_STATUSES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const TEMPLATE_STATUS_META: Record<TemplateStatus, StatusMeta> = {
    ACTIVE: { label: "Active", tone: "success" },
    DRAFT: { label: "Draft", tone: "warning" },
    RETIRED: { label: "Retired", tone: "neutral" },
};

/** Where a message can go. The dispatcher renders EMAIL, SMS and PUSH from a template; in-app copy stays in code. */
export const NOTIFICATION_CHANNELS = ["IN_APP", "PUSH", "EMAIL", "SMS"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
    IN_APP: "In-app",
    PUSH: "Push",
    EMAIL: "Email",
    SMS: "SMS",
};

/** The channels a template's editor can switch on: the three the dispatcher sends. G13-C: PUSH joins EMAIL and SMS (G10, Q103 push copy). */
export const TEMPLATE_CHANNELS = ["EMAIL", "SMS", "PUSH"] as const;

/**
 * The DLT-registered kinds an SMS can be, and the rails that can carry one —
 * `GET /comms/sms-kinds`, off `shared/sms/kinds.ts` on the server. The
 * console used to mirror the list; a kind added there now appears here on
 * the next load without a deploy.
 */
export interface SmsVocabulary {
    kinds: string[];
    rails: string[];
}

/** A kind as the server names it; the vocabulary above says which are registered. */
export type SmsKind = string;

export const DELIVERY_STATUSES = ["QUEUED", "SENT", "DELIVERED", "FAILED", "SKIPPED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_META: Record<DeliveryStatus, StatusMeta> = {
    QUEUED: { label: "Queued", tone: "info" },
    SENT: { label: "Sent", tone: "success" },
    DELIVERED: { label: "Delivered", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    SKIPPED: { label: "Skipped", tone: "neutral" },
};

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

/**
 * E10-2: a template's last 30 Indian days off `NotificationDelivery` —
 * `sent30d` is what left (SENT + DELIVERED), `delivered30d` what a rail
 * confirmed (email has no report, so it stays 0 there), `failed30d` what the
 * sender gave up on; `deliveryRate` is sent / (sent + failed) to two places,
 * null when nothing was attempted. QUEUED and SKIPPED count nowhere.
 */
export interface TemplateStats {
    sent30d: number;
    delivered30d: number;
    failed30d: number;
    deliveryRate: number | null;
}

export interface CommsTemplate {
    id: string;
    /** Immutable slug; the handle every caller raises the event by. */
    key: string;
    /** UPPER_SNAKE — `KYC_DECISION`, `PAYOUT_PAID`. */
    event: string;
    channels: NotificationChannel[];
    subject: string | null;
    /** HTML with `{{name}}` placeholders; every value is escaped on render. */
    emailBody: string | null;
    smsKind: SmsKind | null;
    smsBody: string | null;
    /** G10 (Q103): the push copy of its own — the same `{{vars}}`; null, a push shows `subject` / `smsBody`. */
    pushTitle: string | null;
    pushBody: string | null;
    /** An OTP or a payment link: never resent, variables purged in a week. */
    isSensitive: boolean;
    /**
     * Lot G (Q117): true by default. False puts the copy under the quiet
     * hours and the weekly cap — an announcement, a statement notice — while
     * an OTP, a decision or a payment ignores both and leaves at once.
     */
    transactional: boolean;
    status: TemplateStatus;
    /** Bumped by the server on every edit. */
    version: number;
    updatedById: string | null;
    createdAt: string;
    updatedAt: string;
    /** The `{{names}}` the bodies use, as the server read them. */
    variables: string[];
    /** The last 30 days, per template — one grouped query on the server for the page. */
    stats: TemplateStats;
}

/**
 * E10-2: one event the code raises — `GET /comms/events`. `variables` are
 * what the raising `notify()` call supplies, so a template naming one the
 * event does not carry would render `{{name}}` blank; `templates` is the
 * copy on file for it, any status. An event nothing raises is listed last
 * with no variables and a note saying so.
 */
export interface CommsEvent {
    event: string;
    variables: string[];
    raisedBy: string[];
    via: string;
    sensitive?: boolean;
    note?: string;
    templates: { key: string; status: TemplateStatus; channels: NotificationChannel[] }[];
}

/**
 * Lot G (Q121): one try at one delivery, as `GET /comms/deliveries/:id`
 * lists them oldest first — including a try that never reached a rail
 * (`TEMPLATE_MISSING`, `RECIPIENT_UNAVAILABLE`, `EMAIL_UNCONFIGURED`).
 * `responseText` is what the door answered, any address inside it masked
 * and the whole cut to 1,000 characters. AE-B: an email sent through the
 * Ethereal test inbox appends ` | preview: <url>` to it - see
 * `etherealPreviewUrl`.
 */
export interface DeliveryAttempt {
    attempt: number;
    provider: string | null;
    providerMessageId: string | null;
    ok: boolean;
    responseText: string | null;
    error: string | null;
    at: string;
}

/**
 * AE-C: the Ethereal preview inside a try's response, when one is there.
 * The dispatcher writes `<vendor line> | preview: https://ethereal.email/message/…`
 * for a message the test inbox caught; the log prints that URL as a link so
 * the operator can read the message nothing delivered. Only an https URL on
 * ethereal.email counts - a vendor line that happens to quote another host
 * stays text.
 */
export function etherealPreviewUrl(responseText: string | null | undefined): string | null {
    if (!responseText) return null;
    const match = /https:\/\/ethereal\.email\/[^\s|]+/.exec(responseText);
    return match ? match[0] : null;
}

export interface Delivery {
    id: string;
    userId: string | null;
    notificationId: string | null;
    templateKey: string | null;
    channel: NotificationChannel;
    /** `+91 98450 •••23`, `j***@x.com`. The address itself never leaves the server. */
    recipientMasked: string;
    recipientHash: string;
    /** The template's variables — values masked to `•••` for a sensitive template, null once purged. */
    variables: Record<string, unknown> | null;
    status: DeliveryStatus;
    attempts: number;
    provider: string | null;
    providerMessageId: string | null;
    lastError: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    purgedAt: string | null;
    createdAt: string;
    /** Lot G (Q117): the instant a quiet-hours deferral waits for; null otherwise. */
    scheduledFor?: string | null;
}

/** The single read: the row plus its attempt trail, oldest try first. */
export type DeliveryDetail = Delivery & { attemptRows: DeliveryAttempt[] };

/**
 * `POST /comms/templates/:key/send-test` — what came back: the sample
 * variables the server filled in and one row per channel it tried, with
 * `skipped` naming why a channel did not leave.
 */
export interface SendTestOutcome {
    templateKey: string;
    variables: Record<string, string>;
    deliveries: { channel: NotificationChannel; deliveryId: string | null; status: DeliveryStatus; skipped?: string }[];
}

/** One page of the designed-list contract. */
export interface ListPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed. */
    counts: Record<string, number>;
}

export type TemplatesPage = ListPage<CommsTemplate>;
/** E10-2: `byChannel` beside `counts`, counted with the channel facet removed the way `counts` drops the status facet. */
export type DeliveriesPage = ListPage<Delivery> & { byChannel: Record<string, number> };

/* ------------------------------------------------------------------ */
/* Shaping the figures                                                 */
/* ------------------------------------------------------------------ */

export const EMPTY_STATS: TemplateStats = { sent30d: 0, delivered30d: 0, failed30d: 0, deliveryRate: null };

/**
 * The library's header line: every template's 30 days added up, with the
 * rate computed over the sums rather than averaged — the server's own rule
 * (sent over sent plus failed, two places, null when nothing was attempted)
 * applied to the page as a whole, so ten silent templates do not drag down
 * the one that sends.
 */
export function sumTemplateStats(templates: readonly Pick<CommsTemplate, "stats">[]): TemplateStats {
    let sent30d = 0;
    let delivered30d = 0;
    let failed30d = 0;
    for (const template of templates) {
        const stats = template.stats ?? EMPTY_STATS;
        sent30d += stats.sent30d;
        delivered30d += stats.delivered30d;
        failed30d += stats.failed30d;
    }
    const attempted = sent30d + failed30d;
    return { sent30d, delivered30d, failed30d, deliveryRate: attempted === 0 ? null : Math.round((sent30d / attempted) * 100) / 100 };
}

/** `0.97` as `97%`; a null rate is an em dash, because nothing was attempted. */
export const formatDeliveryRate = (rate: number | null): string => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

/** `byChannel` as the chips read it: a channel the page did not name is zero, not missing. */
export const channelCount = (page: Pick<DeliveriesPage, "byChannel">, channel: NotificationChannel): number =>
    page.byChannel?.[channel] ?? 0;

/**
 * The editor's Variables card: the `{{names}}` typed against what the event
 * supplies. `missing` is the placeholder nothing will ever fill — the flag
 * the card raises; `unused` is what the event offers that no body names.
 * With no catalogue entry for the event (a new event, or one nothing raises)
 * every placeholder is `unknown` rather than missing: there is nothing to
 * check against, and saying "missing" would be a guess.
 */
export interface VariablesDiff {
    provided: string[];
    missing: string[];
    unused: string[];
    unknown: string[];
}

export function eventVariablesDiff(placeholders: readonly string[], event: Pick<CommsEvent, "variables"> | null | undefined): VariablesDiff {
    if (!event) return { provided: [], missing: [], unused: [], unknown: [...placeholders] };
    const supplied = new Set(event.variables);
    const typed = new Set(placeholders);
    return {
        provided: placeholders.filter((name) => supplied.has(name)),
        missing: placeholders.filter((name) => !supplied.has(name)),
        unused: event.variables.filter((name) => !typed.has(name)),
        unknown: [],
    };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface TemplatesQuery {
    /** Over key, event and subject. */
    q?: string;
    status?: readonly TemplateStatus[];
    event?: string;
    sort?: "key" | "newest";
    page?: number;
    pageSize?: number;
}

export interface DeliveriesQuery {
    /** An exact address is hashed and matched; a 64-hex string is a hash; anything else is a contains on the mask. */
    q?: string;
    status?: readonly DeliveryStatus[];
    channel?: NotificationChannel;
    templateKey?: string;
    userId?: string;
    /** ISO instants. */
    from?: string;
    to?: string;
    sort?: "newest" | "oldest";
    page?: number;
    pageSize?: number;
}

function baseQuery(query: { q?: string; status?: readonly string[]; sort?: string; page?: number; pageSize?: number }): URLSearchParams {
    const params = new URLSearchParams();
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.sort) params.set("sort", query.sort);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    return params;
}

/** `?q=&status=&event=&sort=&page=&pageSize=` for `GET /comms/templates`. */
export function templatesQuery(query: TemplatesQuery = {}): string {
    const params = baseQuery(query);
    if (query.event) params.set("event", query.event);
    return params.toString();
}

function deliveryFacets(params: URLSearchParams, query: DeliveriesQuery): URLSearchParams {
    if (query.channel) params.set("channel", query.channel);
    if (query.templateKey) params.set("templateKey", query.templateKey);
    if (query.userId) params.set("userId", query.userId);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    return params;
}

/** The list contract's facets for `GET /comms/deliveries`, blanks left off. */
export function deliveriesQuery(query: DeliveriesQuery = {}): string {
    return deliveryFacets(baseQuery(query), query).toString();
}

/**
 * The same filters for `GET /comms/deliveries/export.csv`, which takes no
 * page: the file is the whole log under the filters in force, a thousand
 * rows a batch, 50,000 at most.
 */
export function exportDeliveriesQuery(query: DeliveriesQuery = {}): string {
    const params = new URLSearchParams();
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.sort) params.set("sort", query.sort);
    return deliveryFacets(params, query).toString();
}

/** `deliveries-2026-09-13.csv` when the server named nothing. */
export const exportFilename = (named: string | null, now = new Date()): string => named ?? `deliveries-${now.toISOString().slice(0, 10)}.csv`;

/* ------------------------------------------------------------------ */
/* Editing a template                                                  */
/* ------------------------------------------------------------------ */

/** What the editor holds — every field the server accepts, the key aside. */
export interface TemplateDraft {
    event: string;
    channels: NotificationChannel[];
    subject: string;
    emailBody: string;
    smsKind: SmsKind | "";
    smsBody: string;
    /** G10 (Q103): the push title (200) and body (1,000); blank falls back to the subject / SMS text. */
    pushTitle: string;
    pushBody: string;
    isSensitive: boolean;
    /** Lot G (Q117): off puts the copy under the quiet hours and the weekly cap. */
    transactional: boolean;
    status: TemplateStatus;
}

export interface TemplateInput {
    key: string;
    event: string;
    channels: NotificationChannel[];
    subject?: string | null;
    emailBody?: string | null;
    smsKind?: SmsKind | null;
    smsBody?: string | null;
    pushTitle?: string | null;
    pushBody?: string | null;
    isSensitive?: boolean;
    transactional?: boolean;
    status?: TemplateStatus;
}

/** The server's caps on the push copy (`comms.schema.ts`). */
export const PUSH_TITLE_MAX = 200;
export const PUSH_BODY_MAX = 1_000;

export type TemplatePatch = Partial<Omit<TemplateInput, "key">>;

export const TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const TEMPLATE_EVENT_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** A fresh editor: ACTIVE and email-only, the way most seeded rows are. */
export const emptyDraft = (): TemplateDraft => ({
    event: "",
    channels: ["EMAIL"],
    subject: "",
    emailBody: "",
    smsKind: "",
    smsBody: "",
    pushTitle: "",
    pushBody: "",
    isSensitive: false,
    transactional: true,
    status: "ACTIVE",
});

export const draftOf = (template: CommsTemplate): TemplateDraft => ({
    event: template.event,
    channels: template.channels,
    subject: template.subject ?? "",
    emailBody: template.emailBody ?? "",
    smsKind: template.smsKind ?? "",
    smsBody: template.smsBody ?? "",
    pushTitle: template.pushTitle ?? "",
    pushBody: template.pushBody ?? "",
    isSensitive: template.isSensitive,
    /* A row from a backend older than the column is transactional — the server's own default. */
    transactional: template.transactional ?? true,
    status: template.status,
});

/**
 * The server's own refusals, said before the round trip: a slug key, an
 * UPPER_SNAKE event, at least one channel, an SMS channel with a registered
 * kind and a body, an email channel with a body, push copy within its caps.
 */
export function templateProblem(draft: TemplateDraft, key?: string): string | null {
    if (key !== undefined) {
        const slug = key.trim();
        if (slug.length < 2 || slug.length > 64 || !TEMPLATE_KEY_PATTERN.test(slug)) {
            return "The key is lower-case letters, digits and dashes — 2 to 64 characters.";
        }
    }
    const event = draft.event.trim();
    if (event.length < 2 || event.length > 64 || !TEMPLATE_EVENT_PATTERN.test(event)) {
        return "The event is UPPER_SNAKE_CASE — PAYOUT_PAID, KYC_DECISION.";
    }
    if (draft.channels.length === 0) return "Switch on at least one channel.";
    if (draft.channels.includes("EMAIL") && !draft.emailBody.trim()) return "An email channel needs an email body.";
    if (draft.channels.includes("SMS")) {
        if (!draft.smsKind) return "An SMS channel needs a registered kind — the DLT template the rail renders from.";
        if (!draft.smsBody.trim()) return "An SMS channel needs the registered text.";
    }
    if (draft.pushTitle.length > PUSH_TITLE_MAX) return `The push title is at most ${PUSH_TITLE_MAX} characters.`;
    if (draft.pushBody.length > PUSH_BODY_MAX) return `The push body is at most ${PUSH_BODY_MAX} characters.`;
    return null;
}

const nullable = (text: string): string | null => (text.trim() ? text : null);

/** The POST body for a new template. */
export function templateInput(key: string, draft: TemplateDraft): TemplateInput {
    return {
        key: key.trim(),
        event: draft.event.trim(),
        channels: draft.channels,
        subject: nullable(draft.subject),
        emailBody: nullable(draft.emailBody),
        smsKind: draft.smsKind || null,
        smsBody: nullable(draft.smsBody),
        pushTitle: nullable(draft.pushTitle),
        pushBody: nullable(draft.pushBody),
        isSensitive: draft.isSensitive,
        transactional: draft.transactional,
        status: draft.status,
    };
}

const sameChannels = (a: readonly NotificationChannel[], b: readonly NotificationChannel[]) =>
    a.length === b.length && a.every((channel) => b.includes(channel));

/**
 * Only what moved: the server audits the diff and bumps the version on any
 * PATCH, so an edit that changed nothing must not be sent at all. An empty
 * result means "nothing to save".
 */
export function templatePatch(before: CommsTemplate, draft: TemplateDraft): TemplatePatch {
    const next = templateInput(before.key, draft);
    const patch: TemplatePatch = {};
    if (next.event !== before.event) patch.event = next.event;
    if (!sameChannels(next.channels, before.channels)) patch.channels = next.channels;
    if ((next.subject ?? null) !== (before.subject ?? null)) patch.subject = next.subject;
    if ((next.emailBody ?? null) !== (before.emailBody ?? null)) patch.emailBody = next.emailBody;
    if ((next.smsKind ?? null) !== (before.smsKind ?? null)) patch.smsKind = next.smsKind;
    if ((next.smsBody ?? null) !== (before.smsBody ?? null)) patch.smsBody = next.smsBody;
    if ((next.pushTitle ?? null) !== (before.pushTitle ?? null)) patch.pushTitle = next.pushTitle;
    if ((next.pushBody ?? null) !== (before.pushBody ?? null)) patch.pushBody = next.pushBody;
    if (next.isSensitive !== before.isSensitive) patch.isSensitive = next.isSensitive;
    if (next.transactional !== (before.transactional ?? true)) patch.transactional = next.transactional;
    if (next.status !== before.status) patch.status = next.status;
    return patch;
}

/** The `{{names}}` a set of bodies uses, in order of first appearance — the server's `variablesOf`. */
export function placeholdersOf(...bodies: (string | null | undefined)[]): string[] {
    const names = new Set<string>();
    for (const body of bodies) {
        for (const match of (body ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) names.add(match[1]);
    }
    return [...names];
}

/** The variables a draft would provide once saved — the same rule the API applies to the stored row. */
export const draftVariables = (draft: Pick<TemplateDraft, "subject" | "emailBody" | "smsBody" | "pushTitle" | "pushBody">): string[] =>
    placeholdersOf(draft.subject, draft.emailBody, draft.smsBody, draft.pushTitle, draft.pushBody);

/* ------------------------------------------------------------------ */
/* Resending                                                           */
/* ------------------------------------------------------------------ */

/**
 * Whether the desk offers a resend. The server's rule — 409 for a sensitive
 * template, purged variables, or an address no longer available — is
 * applied where it can be read off the row and the template; the address
 * check is the server's alone and its message is shown when it refuses.
 */
export function canResend(delivery: Delivery, template: Pick<CommsTemplate, "isSensitive"> | null | undefined): boolean {
    if (delivery.purgedAt) return false;
    if (template?.isSensitive) return false;
    return delivery.channel === "EMAIL" || delivery.channel === "SMS";
}

/** Why a resend is not offered, in the desk's words. */
export function resendBlocker(delivery: Delivery, template: Pick<CommsTemplate, "isSensitive"> | null | undefined): string | null {
    if (template?.isSensitive) return "A sensitive template — an OTP or a payment link — is never resent from the log.";
    if (delivery.purgedAt) return "The variables were purged; there is nothing left to render.";
    if (delivery.channel !== "EMAIL" && delivery.channel !== "SMS") return "Only email and SMS leave by the dispatcher.";
    return null;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** The comms screens read the API or say why they cannot. */
export const commsReadApi = (): boolean => isLive("comms");

export const commsService = {
    templates: (query: TemplatesQuery = {}): Promise<TemplatesPage> =>
        http.get<TemplatesPage>(`/comms/templates?${templatesQuery(query)}`),

    template: (key: string): Promise<CommsTemplate> => http.get<CommsTemplate>(`/comms/templates/${encodeURIComponent(key)}`),

    /** 409 on a taken key. Audited `NOTIFICATION_TEMPLATE_CREATED`. */
    createTemplate: (input: TemplateInput): Promise<CommsTemplate> => http.post<CommsTemplate>("/comms/templates", input),

    /** Any field but the key; the server bumps `version`. Audited with the diff. */
    updateTemplate: (key: string, patch: TemplatePatch): Promise<CommsTemplate> =>
        http.patch<CommsTemplate>(`/comms/templates/${encodeURIComponent(key)}`, patch),

    deliveries: (query: DeliveriesQuery = {}): Promise<DeliveriesPage> =>
        http.get<DeliveriesPage>(`/comms/deliveries?${deliveriesQuery(query)}`),

    /** The row with its attempt trail — `attemptRows`, one per try, oldest first (Lot G, Q121). */
    delivery: (id: string): Promise<DeliveryDetail> => http.get<DeliveryDetail>(`/comms/deliveries/${encodeURIComponent(id)}`),

    /**
     * Lot G (Q117): the template rendered with sample variables and sent to
     * the signed-in operator's own email and mobile — the server reads them
     * off the user row and refuses a `to` in the body, so there is nothing
     * here to address it. Any status, any sensitivity; bypasses the
     * preference matrix, the quiet hours and the weekly cap. 409 when the
     * operator has no address for a channel the template names. Audited
     * `NOTIFICATION_TEMPLATE_TEST_SENT`.
     */
    sendTest: (key: string, channels?: readonly ("EMAIL" | "SMS")[]): Promise<SendTestOutcome> =>
        http.post<SendTestOutcome>(`/comms/templates/${encodeURIComponent(key)}/send-test`, channels?.length ? { channels } : {}),

    /**
     * The log under the filters in force as a CSV, through the api client's
     * blob mode — the token, the timeout and the refresh-and-replay of every
     * other read — and handed to the browser. Masked recipients only; the
     * server audits `COMMS_DELIVERIES_EXPORTED` before the first byte.
     */
    exportDeliveries: async (query: DeliveriesQuery = {}): Promise<{ filename: string; bytes: number }> => {
        const result = await http.blob(`/comms/deliveries/export.csv?${exportDeliveriesQuery(query)}`);
        const filename = exportFilename(result.filename);
        saveBlob(result.blob, filename);
        return { filename, bytes: result.blob.size };
    },

    /** The catalogue of events the code raises, with the variables each supplies and the copy on file. */
    events: (): Promise<CommsEvent[]> => http.get<CommsEvent[]>("/comms/events"),

    /** The DLT kinds and the rail names, off the server's own list. */
    smsKinds: (): Promise<SmsVocabulary> => http.get<SmsVocabulary>("/comms/sms-kinds"),

    /** A fresh row for the same person and variables, attempted now. 409 when the server will not. Audited `NOTIFICATION_RESENT`. */
    resend: (id: string): Promise<Delivery> => http.post<Delivery>(`/comms/deliveries/${encodeURIComponent(id)}/resend`),
};
