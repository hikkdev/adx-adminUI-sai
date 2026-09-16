import { api as http, tokens } from "@/lib/api-client";
import { apiConfig, isLive } from "@/lib/api-config";

/**
 * Live chat, as the console works it — Lot I.
 *
 * A live chat is not a second messaging system: it is a `SupportTicket`
 * wearing `channel: LIVE_CHAT`, with the same number, the same thread and the
 * same desk. What is different is the pace. The requester is waiting, so the
 * chat is put on somebody at once, it streams, and a first response past the
 * target is an alert rather than a line in a report.
 *
 * Three things live here that no other console service needs.
 *
 * PRESENCE IS A CLAIM WITH A LIFESPAN. `PUT /support/presence { online }`
 * writes a Redis member good for 90 seconds; `POST /support/presence/heartbeat`
 * every 30 seconds is what keeps it. A console that crashes stops beating and
 * drops out on its own, which is the point — an operator who is not there must
 * not be handed a chat. So "online" is never local state: it is read back from
 * `GET /support/presence`, which is how the toggle survives a reload.
 *
 * THE STREAM TOKEN IS SINGLE USE. A browser's `EventSource` cannot set an
 * Authorization header, so the console mints a five-minute, single-use token
 * (`POST …/stream-token`) and opens `…/events?t=<token>`. Because the token is
 * spent on connect, `EventSource`'s own reconnect — which reuses the same URL —
 * would 401 forever. Every reconnect here is therefore ours: close, mint
 * again, reopen. A manual reopen cannot set `Last-Event-ID`, so the server
 * (I4-B) also takes the same instant as `?lastEventId=<ms>`: the reconnect
 * carries the newest message's stamp, the server replays what was written
 * since and then the status, and the reducer folds it in by message id.
 * Nothing is shown twice, and nothing is re-read that was already held.
 *
 * LEAVING IS A REQUEST TOO. A console that is closed stops beating and lapses
 * out of the roster in ninety seconds — during which a chat could still be
 * handed to an empty chair. So `pagehide` sends `PUT /support/presence
 * { online: false }` through `fetch` with `keepalive`, the one request shape a
 * browser lets out of a page that is going away; the ordinary client cannot
 * carry that flag, which is why `leaveDeskOnUnload` is its own small call.
 *
 * INTERNAL NOTES ARE NOT CHAT. The desk's ops notes stay on the ticket thread
 * control (`POST /reply { internal: true }`) and are filtered out of the
 * requester's stream by the server, per viewer. Nothing on the live pane ever
 * sends `internal: true` — `liveReplyBody` is the proof, and a test pins it.
 */

/* ------------------------------------------------------------------ */
/* The guard                                                           */
/* ------------------------------------------------------------------ */

function live() {
    if (!isLive("support")) {
        throw new Error("Live chat reads the API. Set NEXT_PUBLIC_USE_API=true to work the desk.");
    }
    return http;
}

/* ------------------------------------------------------------------ */
/* Presence                                                            */
/* ------------------------------------------------------------------ */

/** One operator at the desk, as `GET /support/presence` lists them — lightest load first. */
export interface OperatorPresence {
    userId: string;
    name: string | null;
    openChats: number;
}

/** The beat the backend's 90 s presence key expects. */
export const HEARTBEAT_MS = 30_000;

/**
 * Beats until it is stopped.
 *
 * Deliberately not a hook: the interval is the whole behaviour, and a plain
 * function is the only shape a test can drive on fake timers without mounting
 * a tree. A failed beat is swallowed — the key simply expires and the operator
 * drops out, which is the honest outcome of a console that cannot reach the
 * server.
 */
export function startHeartbeat(
    beat: () => Promise<unknown> = () => liveChatService.heartbeat(),
    intervalMs: number = HEARTBEAT_MS,
): () => void {
    const timer = setInterval(() => {
        void beat().catch(() => undefined);
    }, intervalMs);
    return () => clearInterval(timer);
}

/** The body of the offline write — one shape for the click and for the unload. */
export const OFFLINE_BODY = { online: false } as const;

/**
 * `PUT /support/presence { online: false }`, sent from a page that is closing.
 *
 * `fetch` with `keepalive: true` is the only request a browser lets finish
 * after `pagehide`; the ordinary client cannot carry the flag (it awaits the
 * envelope, refreshes a 401 and replays, none of which a closing page can
 * do), so this is the one call in the console that speaks to the backend
 * directly. Same route, same method, same body as `setPresence(false)` — a
 * test holds the two side by side — with the session's bearer on it. Fire and
 * forget: there is no page left to tell.
 */
export function leaveDeskOnUnload(fetcher: typeof fetch = fetch): void {
    if (!isLive("support")) return;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const bearer = tokens.access;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    void fetcher(`${apiConfig.baseUrl}/support/presence`, {
        method: "PUT",
        keepalive: true,
        headers,
        body: JSON.stringify(OFFLINE_BODY),
    }).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* The inbox                                                           */
/* ------------------------------------------------------------------ */

export type MessageKind = "TEXT" | "ATTACHMENT" | "SYSTEM";
export type ChatSide = "requester" | "agent";

/** The last line on a chat, as the inbox row previews it. */
export interface InboxLastMessage {
    authorName: string;
    kind: MessageKind;
    message: string;
    createdAt: string;
}

/**
 * Why the plan on a row counts, or does not — the backend's own reasons.
 *
 * `PLAN_EXCLUDED` is the one the desk should notice: somebody who was paying
 * when the chat opened and whose tier no longer includes live chat. Only the
 * three reasons that come with a plan are listed; `NOT_SUBSCRIBED` and the
 * rest arrive as `plan: null`, because there is no plan to name.
 */
export type PlanReason = "PUBLISHER_SUBSCRIPTION" | "ADVERTISER_PACKAGE" | "PLAN_EXCLUDED";

/**
 * The plan behind a live chat, as the inbox row and the LIVE_CHAT thread read
 * both send it (I4-B, `planOnDesk`): the plan the requester holds *now* and
 * why it counts. Null with nothing paid — which is how a lapsed subscriber
 * mid-chat shows up on the desk.
 */
export type PlanOnDesk = { name: string; reason: PlanReason | string } | null;

/** The tooltip behind the plan badge: the reason, as a person would say it. */
export function planReasonLabel(reason: string): string {
    switch (reason) {
        case "PUBLISHER_SUBSCRIPTION":
            return "Entitled by a running publisher subscription";
        case "ADVERTISER_PACKAGE":
            return "Entitled by an active advertiser package";
        case "PLAN_EXCLUDED":
            return "On a plan that leaves live chat out — paying, but not entitled";
        default:
            return reason;
    }
}

/** One OPEN live chat, as `GET /support/live/inbox` sends it. */
export interface LiveInboxRow {
    id: string;
    displayId: string | null;
    title: string;
    requester: { userId: string; name: string | null };
    assignedAdmin: { id: string; name: string | null } | null;
    lastMessageAt: string | null;
    lastMessage: InboxLastMessage | null;
    /** The requester's last unanswered message; null when the desk spoke last. */
    waitingSince: string | null;
    firstResponseAt: string | null;
    firstResponseBreached: boolean;
    unread: number;
    createdAt: string;
    /** The plan the requester holds right now and why it counts; null with nothing paid. */
    plan: PlanOnDesk;
}

export interface LiveInboxPage {
    items: LiveInboxRow[];
    total: number;
    page: number;
    pageSize: number;
    counts?: Record<string, number>;
    /** The live SLA the countdown and the red state are judged against. */
    firstResponseTargetSec: number;
}

/** `?mine=&unassigned=&page=&pageSize=` — the inbox's own facets over the list contract. */
export interface LiveInboxQuery {
    mine?: boolean;
    unassigned?: boolean;
    page?: number;
    pageSize?: number;
}

/** The two toggles above the desk's list; both off is everybody's open chats. */
export interface LiveInboxFacets {
    mine: boolean;
    unassigned: boolean;
}

export const DEFAULT_LIVE_FACETS: LiveInboxFacets = { mine: false, unassigned: false };

/** `?mine=1&unassigned=1` read back off the URL — the desk's facets live there, like every other desk's. */
export function liveFacetsFromSearch(params: URLSearchParams): LiveInboxFacets {
    return { mine: params.get("mine") === "1", unassigned: params.get("unassigned") === "1" };
}

/** The search string for a set of facets; empty when both are off, so the plain URL stays plain. */
export function liveFacetsSearch(facets: LiveInboxFacets): string {
    const params = new URLSearchParams();
    if (facets.mine) params.set("mine", "1");
    if (facets.unassigned) params.set("unassigned", "1");
    return params.toString();
}

export function liveInboxPath(query: LiveInboxQuery = {}): string {
    const params = new URLSearchParams();
    // Flags only when true: `mine=false` is not "everyone's", it is a filter
    // the server reads as false and applies as nothing.
    if (query.mine) params.set("mine", "true");
    if (query.unassigned) params.set("unassigned", "true");
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 50));
    return `/support/live/inbox?${params.toString()}`;
}

const time = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : Number.NaN);

/**
 * The order the desk works: breached first, then waiting longest.
 *
 * A breached chat is somebody who has already been let down, so it outranks
 * every chat still inside its target however long that one has waited. Within
 * each group the oldest unanswered message wins; a chat where the desk spoke
 * last has nobody waiting on it, so it sorts after the ones that do, oldest
 * chat first. Ties break on id so the list never reshuffles under the cursor.
 */
export function sortInbox<T extends Pick<LiveInboxRow, "id" | "firstResponseBreached" | "waitingSince" | "createdAt">>(
    rows: readonly T[],
): T[] {
    return [...rows].sort((a, b) => {
        if (a.firstResponseBreached !== b.firstResponseBreached) return a.firstResponseBreached ? -1 : 1;
        const waitingA = time(a.waitingSince);
        const waitingB = time(b.waitingSince);
        const hasA = Number.isFinite(waitingA);
        const hasB = Number.isFinite(waitingB);
        if (hasA !== hasB) return hasA ? -1 : 1;
        if (hasA && hasB && waitingA !== waitingB) return waitingA - waitingB;
        const createdA = time(a.createdAt);
        const createdB = time(b.createdAt);
        if (Number.isFinite(createdA) && Number.isFinite(createdB) && createdA !== createdB) return createdA - createdB;
        return a.id.localeCompare(b.id);
    });
}

/**
 * Milliseconds left on the first-response clock — negative once it is past.
 *
 * Judged from the moment the chat opened against the target, the same rule the
 * sweep uses. A chat already answered has no clock left to run: what it has is
 * the time the answer took, which is what the row prints instead.
 */
export function firstResponseLeftMs(
    row: Pick<LiveInboxRow, "createdAt" | "firstResponseAt">,
    targetSec: number,
    now: number = Date.now(),
): number | null {
    if (row.firstResponseAt) return null;
    const started = time(row.createdAt);
    if (!Number.isFinite(started)) return null;
    return started + targetSec * 1000 - now;
}

/** How long the first answer took, in milliseconds; null while none has come. */
export function firstResponseTookMs(row: Pick<LiveInboxRow, "createdAt" | "firstResponseAt">): number | null {
    if (!row.firstResponseAt) return null;
    const started = time(row.createdAt);
    const answered = time(row.firstResponseAt);
    if (!Number.isFinite(started) || !Number.isFinite(answered)) return null;
    return answered - started;
}

/** "0:42", "12:05", "1:04:11" — a clock, not a duration phrase, because it is counting. */
export function clock(ms: number): string {
    const total = Math.max(0, Math.floor(Math.abs(ms) / 1000));
    const seconds = total % 60;
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    const pad = (n: number) => String(n).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** How long somebody has been waiting, in the two units that matter: "42s", "4m", "1h 12m". */
export function waitedLabel(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

/* ------------------------------------------------------------------ */
/* The thread                                                          */
/* ------------------------------------------------------------------ */

/** One line of a live thread, however it arrived — the by-id read or the stream. */
export interface ChatMessage {
    id: string;
    authorId: string;
    authorName: string;
    kind: MessageKind;
    message: string;
    attachment: { fileId: string; name: string } | null;
    internal: boolean;
    createdAt: string;
    seenAt?: string | null;
}

/** A message row on the by-id read; the wire keeps the file id and name flat. */
export interface WireThreadMessage {
    id: string;
    ticketId?: string;
    authorId: string;
    authorName: string;
    message: string;
    internal?: boolean;
    kind?: MessageKind;
    attachmentFileId?: string | null;
    attachmentName?: string | null;
    seenAt?: string | null;
    createdAt: string;
}

/** The thread as `GET /support/tickets/:id` sends it, with Lot I's live fields. */
export interface LiveThread {
    id: string;
    userId: string;
    displayId: string | null;
    title: string;
    status: string;
    channel: "LIVE_CHAT" | "TICKET";
    requesterSeenAt: string | null;
    agentSeenAt: string | null;
    firstResponseAt: string | null;
    lastMessageAt: string | null;
    assignedAdmin: { id: string; name: string | null } | null;
    /** I4-B: the plan the requester holds now, on a LIVE_CHAT thread; null on an ordinary ticket. */
    plan: PlanOnDesk;
    messages: WireThreadMessage[];
}

/** The read's flat attachment columns as the stream's nested shape, so one reducer takes both. */
export function shapeThreadMessage(wire: WireThreadMessage): ChatMessage {
    return {
        id: wire.id,
        authorId: wire.authorId,
        authorName: wire.authorName,
        kind: wire.kind ?? "TEXT",
        message: wire.message,
        attachment: wire.attachmentFileId
            ? { fileId: wire.attachmentFileId, name: wire.attachmentName ?? "Attachment" }
            : null,
        internal: Boolean(wire.internal),
        createdAt: wire.createdAt,
        seenAt: wire.seenAt ?? null,
    };
}

/* ------------------------------------------------------------------ */
/* The stream                                                          */
/* ------------------------------------------------------------------ */

/** What `GET /support/tickets/:id/events` sends. */
export type TicketStreamEvent =
    | ({ type: "message"; mine?: boolean } & ChatMessage)
    | { type: "typing"; who: ChatSide; typing: boolean }
    | { type: "seen"; who: ChatSide; at: string }
    | { type: "status"; status: string; channel: string }
    | { type: "assigned"; name: string | null; adminUserId: string | null };

/** What `GET /support/live/inbox/events` sends. */
export type InboxStreamEvent =
    | {
          type: "chat";
          ticketId: string;
          displayId: string | null;
          requesterName: string | null;
          assignedAdminUserId: string | null;
          preview: string;
      }
    | {
          type: "message";
          ticketId: string;
          displayId: string | null;
          assignedAdminUserId: string | null;
          authorName: string;
          preview: string;
      }
    | { type: "breach"; ticketId: string; displayId: string | null; assignedAdminUserId: string | null; waitedSec: number };

/** The named events each stream emits; anything else on the wire is ignored. */
export const TICKET_STREAM_EVENTS = ["message", "typing", "seen", "status", "assigned"] as const;
export const INBOX_STREAM_EVENTS = ["chat", "message", "breach"] as const;

/** The state a live pane draws, folded from the read and then from the stream. */
export interface ChatState {
    messages: ChatMessage[];
    typing: Record<ChatSide, boolean>;
    seen: Record<ChatSide, string | null>;
    status: string | null;
    channel: string | null;
    assignedName: string | null;
    /** Who raised the chat, so a line can be attributed to a side. */
    requesterId: string | null;
    /** The newest message's `createdAt` in milliseconds — the stream's own id. */
    lastEventId: string | null;
}

export const initialChatState: ChatState = {
    messages: [],
    typing: { requester: false, agent: false },
    seen: { requester: null, agent: null },
    status: null,
    channel: null,
    assignedName: null,
    requesterId: null,
    lastEventId: null,
};

const byCreatedAt = (a: ChatMessage, b: ChatMessage) => {
    const left = time(a.createdAt);
    const right = time(b.createdAt);
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
};

/** The newest message's millisecond stamp, which is what the server uses as the SSE id. */
function lastIdOf(messages: readonly ChatMessage[]): string | null {
    const last = messages[messages.length - 1];
    if (!last) return null;
    const ms = time(last.createdAt);
    return Number.isFinite(ms) ? String(ms) : null;
}

/**
 * Folds one message into the thread, by id.
 *
 * Every catch-up path — the by-id read after a reconnect, the replay the
 * server sends on `Last-Event-ID`, the local echo of a reply just sent — can
 * deliver a line the pane already holds. Keying on the message id is what
 * makes all of them safe, and it is why the pane may re-read the thread
 * whenever it likes.
 */
export function foldMessage(messages: readonly ChatMessage[], message: ChatMessage): ChatMessage[] {
    const index = messages.findIndex((existing) => existing.id === message.id);
    if (index >= 0) {
        const next = [...messages];
        // The later view of the same line wins on the fields that move — a
        // seen mark arriving after the message itself, most of all.
        next[index] = { ...next[index], ...message };
        return next;
    }
    return [...messages, message].sort(byCreatedAt);
}

/** Which side of the conversation an author sits on, given who raised the chat. */
export function sideOf(authorId: string, requesterId: string | null): ChatSide {
    return requesterId !== null && authorId === requesterId ? "requester" : "agent";
}

/**
 * The stream reducer.
 *
 * Every event the pane can receive lands here, so the wire format is pinned in
 * one place and the pane holds no logic of its own. A `seen` from one side
 * stamps that side's mark and nothing else; `typing` is a flag, never
 * persisted, and a message from a side clears that side's indicator because
 * somebody who has just sent a line has by definition stopped typing; `status`
 * carries the channel too, which is how the pane learns a chat was converted
 * to a ticket while it was open.
 */
export function chatReducer(state: ChatState, event: TicketStreamEvent): ChatState {
    switch (event.type) {
        case "message": {
            const { type: _type, mine: _mine, ...rest } = event;
            const message = rest as ChatMessage;
            const messages = foldMessage(state.messages, message);
            return {
                ...state,
                messages,
                lastEventId: lastIdOf(messages),
                typing: { ...state.typing, [sideOf(message.authorId, state.requesterId)]: false },
            };
        }
        case "typing":
            return { ...state, typing: { ...state.typing, [event.who]: event.typing } };
        case "seen":
            return { ...state, seen: { ...state.seen, [event.who]: event.at } };
        case "status":
            return { ...state, status: event.status, channel: event.channel };
        case "assigned":
            return { ...state, assignedName: event.name };
        default:
            return state;
    }
}

/** The thread as read by id, folded into the state the stream then updates. */
export function stateFromThread(thread: LiveThread, state: ChatState = initialChatState): ChatState {
    const messages = thread.messages.reduce<ChatMessage[]>(
        (acc, wire) => foldMessage(acc, shapeThreadMessage(wire)),
        state.messages,
    );
    return {
        ...state,
        messages,
        lastEventId: lastIdOf(messages),
        status: thread.status,
        channel: thread.channel,
        requesterId: thread.userId,
        seen: { requester: thread.requesterSeenAt, agent: thread.agentSeenAt },
        assignedName: thread.assignedAdmin?.name ?? state.assignedName,
    };
}

/* ------------------------------------------------------------------ */
/* Opening a stream                                                    */
/* ------------------------------------------------------------------ */

/** The slice of `EventSource` this file uses, so a test can hand it a fake. */
export interface EventSourceLike {
    addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
    close(): void;
    onerror: ((event: unknown) => void) | null;
    onopen: ((event: unknown) => void) | null;
}

export type StreamPhase = "connecting" | "open" | "closed";

export interface StreamOptions<E> {
    /** `POST …/stream-token` — a fresh one per connection, because each is single use. */
    mintToken: () => Promise<string>;
    /** The absolute URL the token is appended to, without the query. */
    url: string;
    /** The named events to bind. */
    events: readonly string[];
    onEvent: (event: E) => void;
    /**
     * Where to resume from, asked on every connection. A manual reopen cannot
     * set `Last-Event-ID`, so the answer goes on the URL as `?lastEventId=<ms>`
     * (I4-B) and the server replays what was written since. Null appends
     * nothing, which is what the first connection of a pane says.
     */
    resumeFrom?: () => string | null;
    /**
     * Called on every connection after the first — the caller's chance to
     * catch up by other means when `resumeFrom` had nothing to resume from.
     */
    onReconnect?: () => void;
    onPhase?: (phase: StreamPhase) => void;
    /** Injected in tests; the browser's `EventSource` otherwise. */
    factory?: (url: string) => EventSourceLike;
    retryMs?: number;
}

export interface StreamHandle {
    close(): void;
}

/**
 * Opens an SSE stream and keeps it open.
 *
 * The reconnect is ours rather than `EventSource`'s for one reason: the token
 * in the URL is spent the moment the server reads it, so the browser's own
 * retry — same URL, same spent token — would 401 in a loop. On every error the
 * socket is closed, a new token minted and a new socket opened, after a delay
 * so a backend that is down is not hammered.
 */
export function openStream<E>(options: StreamOptions<E>): StreamHandle {
    const retryMs = options.retryMs ?? 3000;
    const make = options.factory ?? ((url: string) => new EventSource(url) as unknown as EventSourceLike);
    let closed = false;
    let source: EventSourceLike | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
        if (closed) return;
        const first = attempt === 0;
        attempt += 1;
        options.onPhase?.("connecting");
        void options
            .mintToken()
            .then((token) => {
                if (closed) return;
                const query = new URLSearchParams({ t: token });
                const resume = options.resumeFrom?.() ?? null;
                if (resume) query.set("lastEventId", resume);
                const separator = options.url.includes("?") ? "&" : "?";
                const next = make(`${options.url}${separator}${query.toString()}`);
                source = next;
                for (const name of options.events) {
                    next.addEventListener(name, (message: MessageEvent<string>) => {
                        try {
                            options.onEvent({ ...(JSON.parse(message.data) as object), type: name } as E);
                        } catch {
                            /* Not JSON — the server's heartbeat comment. Nothing to fold. */
                        }
                    });
                }
                next.onopen = () => {
                    if (closed) return;
                    options.onPhase?.("open");
                    if (!first) options.onReconnect?.();
                };
                next.onerror = () => {
                    if (closed) return;
                    next.close();
                    source = null;
                    options.onPhase?.("closed");
                    timer = setTimeout(connect, retryMs);
                };
            })
            .catch(() => {
                if (closed) return;
                options.onPhase?.("closed");
                timer = setTimeout(connect, retryMs);
            });
    };

    connect();

    return {
        close() {
            closed = true;
            if (timer) clearTimeout(timer);
            source?.close();
            source = null;
        },
    };
}

/** `…/support/tickets/:id/events` on the API's own base — absolute, because `EventSource` takes one. */
export function ticketEventsUrl(ticketId: string): string {
    return `${apiConfig.baseUrl}/support/tickets/${encodeURIComponent(ticketId)}/events`;
}

export function inboxEventsUrl(): string {
    return `${apiConfig.baseUrl}/support/live/inbox/events`;
}

/* ------------------------------------------------------------------ */
/* Canned replies                                                      */
/* ------------------------------------------------------------------ */

export interface CannedReply {
    id: string;
    title: string;
    body: string;
    team: string | null;
    isActive: boolean;
    createdById?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface CannedReplyInput {
    title: string;
    body: string;
    team: string | null;
}

export type CannedReplyPatch = Partial<CannedReplyInput> & { isActive?: boolean };

/**
 * Inserts a canned reply's body into the composer at the caret.
 *
 * The '/' that opened the picker is part of what is replaced: typing "/" and
 * then choosing a reply must leave the reply, not "/the reply". Only the run
 * from that '/' to the caret goes — anything written before it stays exactly
 * where it was, and the caret lands at the end of what was inserted.
 */
export function insertCanned(text: string, caret: number, body: string): { text: string; caret: number } {
    const position = Math.max(0, Math.min(caret, text.length));
    const before = text.slice(0, position);
    const after = text.slice(position);
    // The token the picker was opened on: a '/' at the start of the text or
    // after whitespace, with nothing but non-space between it and the caret.
    const match = /(?:^|\s)(\/\S*)$/.exec(before);
    const head = match ? before.slice(0, before.length - match[1].length) : before;
    const next = `${head}${body}`;
    return { text: `${next}${after}`, caret: next.length };
}

/** The '/' token under the caret, which is what the picker filters on; null when there is none. */
export function cannedQueryAt(text: string, caret: number): string | null {
    const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
    const match = /(?:^|\s)\/(\S*)$/.exec(before);
    return match ? match[1] : null;
}

/** Title first, then body — the desk types the name it remembers. */
export function matchCanned(replies: readonly CannedReply[], query: string): CannedReply[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...replies];
    return replies.filter(
        (reply) => reply.title.toLowerCase().includes(needle) || reply.body.toLowerCase().includes(needle),
    );
}

/** The teams across a set of canned replies, for the manager's grouping. */
export function cannedTeams(replies: readonly CannedReply[]): (string | null)[] {
    const teams = new Set<string>();
    let unteamed = false;
    for (const reply of replies) {
        if (reply.team) teams.add(reply.team);
        else unteamed = true;
    }
    const sorted: (string | null)[] = [...teams].sort((a, b) => a.localeCompare(b));
    if (unteamed) sorted.push(null);
    return sorted;
}

/* ------------------------------------------------------------------ */
/* The body of a live reply                                            */
/* ------------------------------------------------------------------ */

/**
 * What the live composer posts.
 *
 * `internal` is never set. An ops note is not chat: it belongs on the ticket
 * thread control, where the desk can see it and the requester's stream never
 * carries it. A test pins the absence, because the failure mode — an internal
 * note streamed live to the person it is about — is not one a click-through
 * would catch.
 */
export function liveReplyBody(message: string, attachmentFileId?: string | null): Record<string, unknown> {
    return {
        message: message.trim(),
        ...(attachmentFileId ? { attachmentFileId } : {}),
    };
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

export const liveChatService = {
    /* Presence */
    presence: () => live().get<OperatorPresence[]>("/support/presence"),
    setPresence: (online: boolean) => live().put<{ online: boolean }>("/support/presence", { online }),
    heartbeat: () => live().post<{ online: boolean }>("/support/presence/heartbeat", {}),
    /** The offline write from a closing page — `fetch` with `keepalive`, bearer on it, nothing awaited. */
    leaveDeskOnUnload: () => leaveDeskOnUnload(),

    /* The inbox */
    inbox: (query: LiveInboxQuery = {}) => live().get<LiveInboxPage>(liveInboxPath(query)),
    inboxStreamToken: async (): Promise<string> =>
        (await live().post<{ token: string; expiresInSec: number }>("/support/live/inbox/stream-token", {})).token,

    /* The thread */
    thread: (ticketId: string) => live().get<LiveThread>(`/support/tickets/${ticketId}`),
    streamToken: async (ticketId: string): Promise<string> =>
        (await live().post<{ token: string; expiresInSec: number }>(`/support/tickets/${ticketId}/stream-token`, {}))
            .token,

    /** A live reply; never internal. With an attachment the text may be empty. */
    send: (ticketId: string, message: string, attachmentFileId?: string | null) =>
        live().post<WireThreadMessage>(`/support/tickets/${ticketId}/reply`, liveReplyBody(message, attachmentFileId)),

    typing: (ticketId: string, typing: boolean) =>
        live().post<{ typing: boolean; published: boolean }>(`/support/tickets/${ticketId}/typing`, { typing }),

    seen: (ticketId: string) =>
        live().post<{ requesterSeenAt: string | null; agentSeenAt: string | null }>(
            `/support/tickets/${ticketId}/seen`,
            {},
        ),

    reassign: (ticketId: string, adminUserId: string) =>
        live().post<unknown>(`/support/tickets/${ticketId}/reassign`, { adminUserId }),

    /** The same row, `channel: TICKET`. Nothing is closed and nothing is copied. */
    convert: (ticketId: string) => live().post<unknown>(`/support/tickets/${ticketId}/convert`, { to: "TICKET" }),

    /* Canned replies */
    canned: (opts: { team?: string; includeInactive?: boolean } = {}) => {
        const params = new URLSearchParams();
        if (opts.team) params.set("team", opts.team);
        if (opts.includeInactive) params.set("includeInactive", "true");
        const query = params.toString();
        return live().get<CannedReply[]>(`/support/canned${query ? `?${query}` : ""}`);
    },
    createCanned: (input: CannedReplyInput) => live().post<CannedReply>("/support/canned", input),
    updateCanned: (cannedId: string, patch: CannedReplyPatch) =>
        live().patch<CannedReply>(`/support/canned/${cannedId}`, patch),
    deleteCanned: (cannedId: string) => live().delete<{ id: string }>(`/support/canned/${cannedId}`),
};
