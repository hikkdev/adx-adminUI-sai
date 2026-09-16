import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Live chat on the console — Lot I.
 *
 * What is pinned here is the part a click-through cannot catch. The inbox
 * order is a promise about who gets answered first. The reducer is the whole
 * wire format: a `seen` that lands on the wrong side, a replayed message that
 * arrives twice, a converted chat that keeps saying LIVE_CHAT are all silent
 * on screen and wrong in the room. The canned picker has to eat the '/' it was
 * opened on. The heartbeat has to keep beating, because a beat that stops is
 * an operator the assigner will not hand a chat to. And the live composer must
 * never post `internal: true` — an ops note streamed to the person it is about
 * is the one failure in this package that cannot be taken back.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record =
        (method: string, answer: unknown = {}) =>
        async (path: string, body?: unknown) => {
            calls.push({ method, path, body });
            return answer;
        };
    return {
        ...actual,
        api: {
            get: record("GET", []),
            post: record("POST", { token: "a".repeat(64), expiresInSec: 300 }),
            patch: record("PATCH"),
            put: record("PUT"),
            delete: record("DELETE"),
        },
    };
});
vi.mock("@/lib/api-config", () => ({
    isLive: () => true,
    apiConfig: { live: true, baseUrl: "https://api.test/api/v1" },
}));

import {
    DEFAULT_LIVE_FACETS,
    HEARTBEAT_MS,
    OFFLINE_BODY,
    cannedQueryAt,
    leaveDeskOnUnload,
    liveFacetsFromSearch,
    liveFacetsSearch,
    planReasonLabel,
    cannedTeams,
    chatReducer,
    clock,
    firstResponseLeftMs,
    firstResponseTookMs,
    foldMessage,
    initialChatState,
    insertCanned,
    inboxEventsUrl,
    liveChatService,
    liveInboxPath,
    liveReplyBody,
    matchCanned,
    openStream,
    shapeThreadMessage,
    sortInbox,
    startHeartbeat,
    stateFromThread,
    ticketEventsUrl,
    waitedLabel,
    type CannedReply,
    type ChatMessage,
    type ChatState,
    type EventSourceLike,
    type LiveInboxRow,
    type LiveThread,
} from "./live-chat";

beforeEach(() => {
    calls.length = 0;
});

/* ------------------------------------------------------------------ */
/* The inbox                                                           */
/* ------------------------------------------------------------------ */

const row = (over: Partial<LiveInboxRow> & Pick<LiveInboxRow, "id">): LiveInboxRow => ({
    displayId: `TKT-${over.id}`,
    title: "Help",
    requester: { userId: `usr_${over.id}`, name: "Ravi" },
    assignedAdmin: null,
    lastMessageAt: null,
    lastMessage: null,
    waitingSince: null,
    firstResponseAt: null,
    firstResponseBreached: false,
    unread: 0,
    createdAt: "2026-09-14T10:00:00.000Z",
    plan: null,
    ...over,
});

describe("sortInbox", () => {
    it("puts every breached chat above every chat still inside its target", () => {
        const sorted = sortInbox([
            row({ id: "fresh", waitingSince: "2026-09-14T10:00:00.000Z" }),
            row({ id: "late", firstResponseBreached: true, waitingSince: "2026-09-14T10:05:00.000Z" }),
        ]);
        expect(sorted.map((item) => item.id)).toEqual(["late", "fresh"]);
    });

    it("orders within a group by who has been waiting longest", () => {
        const sorted = sortInbox([
            row({ id: "b", waitingSince: "2026-09-14T10:04:00.000Z" }),
            row({ id: "a", waitingSince: "2026-09-14T10:01:00.000Z" }),
            row({ id: "c", waitingSince: "2026-09-14T10:09:00.000Z" }),
        ]);
        expect(sorted.map((item) => item.id)).toEqual(["a", "b", "c"]);
    });

    it("sorts a chat the desk spoke on last below every chat somebody is waiting on", () => {
        const sorted = sortInbox([
            row({ id: "answered", waitingSince: null, createdAt: "2026-09-14T09:00:00.000Z" }),
            row({ id: "waiting", waitingSince: "2026-09-14T10:50:00.000Z" }),
        ]);
        expect(sorted.map((item) => item.id)).toEqual(["waiting", "answered"]);
    });

    it("breaks a dead tie on id, so the list does not reshuffle under the cursor", () => {
        const same = { waitingSince: "2026-09-14T10:00:00.000Z", createdAt: "2026-09-14T09:00:00.000Z" };
        const first = sortInbox([row({ id: "b", ...same }), row({ id: "a", ...same })]);
        const second = sortInbox([row({ id: "a", ...same }), row({ id: "b", ...same })]);
        expect(first.map((item) => item.id)).toEqual(["a", "b"]);
        expect(second.map((item) => item.id)).toEqual(["a", "b"]);
    });

    it("leaves the caller's array alone", () => {
        const rows = [row({ id: "b" }), row({ id: "a", firstResponseBreached: true })];
        sortInbox(rows);
        expect(rows.map((item) => item.id)).toEqual(["b", "a"]);
    });
});

describe("the first-response clock", () => {
    const opened = row({ id: "x", createdAt: "2026-09-14T10:00:00.000Z" });
    const now = new Date("2026-09-14T10:01:30.000Z").getTime();

    it("counts down from the moment the chat opened", () => {
        expect(firstResponseLeftMs(opened, 120, now)).toBe(30_000);
    });

    it("goes negative once the target is past, which is what turns the row red", () => {
        expect(firstResponseLeftMs(opened, 60, now)).toBe(-30_000);
    });

    it("stops counting once an answer has come, and says how long it took instead", () => {
        const answered = row({ id: "x", createdAt: "2026-09-14T10:00:00.000Z", firstResponseAt: "2026-09-14T10:00:45.000Z" });
        expect(firstResponseLeftMs(answered, 120, now)).toBeNull();
        expect(firstResponseTookMs(answered)).toBe(45_000);
    });

    it("prints a clock rather than a phrase, because it is counting", () => {
        expect(clock(42_000)).toBe("0:42");
        expect(clock(725_000)).toBe("12:05");
        expect(clock(3_851_000)).toBe("1:04:11");
        expect(clock(-30_000)).toBe("0:30");
    });

    it("says a wait in the unit somebody would say it in", () => {
        expect(waitedLabel(42_000)).toBe("42s");
        expect(waitedLabel(4 * 60_000)).toBe("4m");
        expect(waitedLabel(72 * 60_000)).toBe("1h 12m");
    });
});

describe("liveInboxPath", () => {
    it("sends a flag only when it is true", () => {
        expect(liveInboxPath()).toBe("/support/live/inbox?pageSize=50");
        expect(liveInboxPath({ mine: false, unassigned: false })).toBe("/support/live/inbox?pageSize=50");
        expect(liveInboxPath({ mine: true, pageSize: 20 })).toBe("/support/live/inbox?mine=true&pageSize=20");
    });
});

describe("the inbox facets in the URL", () => {
    it("reads `?mine=1` and `?unassigned=1` back, and nothing else as on", () => {
        expect(liveFacetsFromSearch(new URLSearchParams())).toEqual(DEFAULT_LIVE_FACETS);
        expect(liveFacetsFromSearch(new URLSearchParams("mine=1"))).toEqual({ mine: true, unassigned: false });
        expect(liveFacetsFromSearch(new URLSearchParams("mine=1&unassigned=1"))).toEqual({ mine: true, unassigned: true });
        expect(liveFacetsFromSearch(new URLSearchParams("mine=true&unassigned=0"))).toEqual(DEFAULT_LIVE_FACETS);
    });

    it("writes only the facets that are on, so the plain desk keeps a plain URL", () => {
        expect(liveFacetsSearch(DEFAULT_LIVE_FACETS)).toBe("");
        expect(liveFacetsSearch({ mine: true, unassigned: false })).toBe("mine=1");
        expect(liveFacetsSearch({ mine: true, unassigned: true })).toBe("mine=1&unassigned=1");
    });

    it("round-trips into the list contract's own flags", async () => {
        await liveChatService.inbox(liveFacetsFromSearch(new URLSearchParams("unassigned=1")));
        expect(calls[0].path).toBe("/support/live/inbox?unassigned=true&pageSize=50");
    });
});

describe("the plan badge's reason", () => {
    it("says why the plan counts, and names an excluded tier as paying but not entitled", () => {
        expect(planReasonLabel("PUBLISHER_SUBSCRIPTION")).toMatch(/publisher subscription/i);
        expect(planReasonLabel("ADVERTISER_PACKAGE")).toMatch(/advertiser package/i);
        expect(planReasonLabel("PLAN_EXCLUDED")).toMatch(/leaves live chat out/i);
        // A reason this build does not know is printed as it came, never hidden.
        expect(planReasonLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    });
});

/* ------------------------------------------------------------------ */
/* The stream reducer                                                  */
/* ------------------------------------------------------------------ */

const message = (over: Partial<ChatMessage> & Pick<ChatMessage, "id" | "createdAt">): ChatMessage => ({
    authorId: "usr_requester",
    authorName: "Ravi",
    kind: "TEXT",
    message: "Is my booking live?",
    attachment: null,
    internal: false,
    ...over,
});

const withRequester = (): ChatState => ({ ...initialChatState, requesterId: "usr_requester" });

describe("chatReducer", () => {
    it("appends a message and carries the stream id the reconnect would resume from", () => {
        const state = chatReducer(withRequester(), {
            type: "message",
            ...message({ id: "msg_1", createdAt: "2026-09-14T10:00:00.000Z" }),
        });
        expect(state.messages.map((item) => item.id)).toEqual(["msg_1"]);
        expect(state.lastEventId).toBe(String(new Date("2026-09-14T10:00:00.000Z").getTime()));
    });

    it("folds a replayed message onto the one it already holds rather than showing it twice", () => {
        const first = chatReducer(withRequester(), {
            type: "message",
            ...message({ id: "msg_1", createdAt: "2026-09-14T10:00:00.000Z" }),
        });
        const again = chatReducer(first, {
            type: "message",
            ...message({ id: "msg_1", createdAt: "2026-09-14T10:00:00.000Z", seenAt: "2026-09-14T10:00:09.000Z" }),
        });
        expect(again.messages).toHaveLength(1);
        expect(again.messages[0].seenAt).toBe("2026-09-14T10:00:09.000Z");
    });

    it("keeps the thread in time order however the lines arrive", () => {
        let state = withRequester();
        for (const at of ["10:02", "10:00", "10:01"]) {
            state = chatReducer(state, {
                type: "message",
                ...message({ id: `msg_${at}`, createdAt: `2026-09-14T${at}:00.000Z` }),
            });
        }
        expect(state.messages.map((item) => item.createdAt)).toEqual([
            "2026-09-14T10:00:00.000Z",
            "2026-09-14T10:01:00.000Z",
            "2026-09-14T10:02:00.000Z",
        ]);
    });

    it("raises and drops the typing indicator per side", () => {
        const typing = chatReducer(withRequester(), { type: "typing", who: "requester", typing: true });
        expect(typing.typing).toEqual({ requester: true, agent: false });
        const stopped = chatReducer(typing, { type: "typing", who: "requester", typing: false });
        expect(stopped.typing.requester).toBe(false);
    });

    it("clears a side's indicator when that side sends a line", () => {
        const typing = chatReducer(withRequester(), { type: "typing", who: "requester", typing: true });
        const said = chatReducer(typing, {
            type: "message",
            ...message({ id: "msg_1", createdAt: "2026-09-14T10:00:00.000Z", authorId: "usr_requester" }),
        });
        expect(said.typing.requester).toBe(false);
    });

    it("stamps a seen mark on the side that sent it and leaves the other alone", () => {
        const seen = chatReducer(withRequester(), { type: "seen", who: "agent", at: "2026-09-14T10:03:00.000Z" });
        expect(seen.seen).toEqual({ requester: null, agent: "2026-09-14T10:03:00.000Z" });
    });

    it("takes the channel off a status event, which is how the pane learns a chat became a ticket", () => {
        const converted = chatReducer(withRequester(), { type: "status", status: "OPEN", channel: "TICKET" });
        expect(converted.channel).toBe("TICKET");
        expect(converted.status).toBe("OPEN");
    });

    it("names whoever was just put on the chat", () => {
        const assigned = chatReducer(withRequester(), { type: "assigned", name: "Priya", adminUserId: "usr_priya" });
        expect(assigned.assignedName).toBe("Priya");
    });
});

describe("stateFromThread", () => {
    const thread: LiveThread = {
        id: "tkt_1",
        userId: "usr_requester",
        displayId: "TKT-1409-0001",
        title: "Booking",
        status: "OPEN",
        channel: "LIVE_CHAT",
        requesterSeenAt: "2026-09-14T10:05:00.000Z",
        agentSeenAt: null,
        firstResponseAt: null,
        lastMessageAt: "2026-09-14T10:04:00.000Z",
        assignedAdmin: { id: "usr_priya", name: "Priya" },
        plan: { name: "Growth", reason: "PUBLISHER_SUBSCRIPTION" },
        messages: [
            { id: "msg_1", authorId: "usr_requester", authorName: "Ravi", message: "Hello", createdAt: "2026-09-14T10:00:00.000Z" },
            {
                id: "msg_2",
                authorId: "usr_priya",
                authorName: "Priya",
                message: "",
                kind: "ATTACHMENT",
                attachmentFileId: "fil_9",
                attachmentName: "receipt.pdf",
                createdAt: "2026-09-14T10:04:00.000Z",
            },
        ],
    };

    it("reads the thread into the same state the stream then updates", () => {
        const state = stateFromThread(thread);
        expect(state.messages.map((item) => item.id)).toEqual(["msg_1", "msg_2"]);
        expect(state.messages[1].attachment).toEqual({ fileId: "fil_9", name: "receipt.pdf" });
        expect(state.requesterId).toBe("usr_requester");
        expect(state.seen).toEqual({ requester: "2026-09-14T10:05:00.000Z", agent: null });
        expect(state.assignedName).toBe("Priya");
        expect(state.channel).toBe("LIVE_CHAT");
    });

    it("re-reading after a reconnect adds nothing the pane already holds", () => {
        const once = stateFromThread(thread);
        const twice = stateFromThread(thread, once);
        expect(twice.messages).toHaveLength(2);
    });

    it("keeps an internal note on the thread it was read from — the server filters per viewer, not the console", () => {
        const withNote = stateFromThread({
            ...thread,
            messages: [
                ...thread.messages,
                {
                    id: "msg_note",
                    authorId: "usr_priya",
                    authorName: "Priya",
                    message: "Refund already raised — do not promise a date.",
                    internal: true,
                    createdAt: "2026-09-14T10:06:00.000Z",
                },
            ],
        });
        expect(withNote.messages.find((item) => item.id === "msg_note")?.internal).toBe(true);
    });

    it("shapes a plain reply with no attachment as one", () => {
        expect(shapeThreadMessage({ id: "m", authorId: "a", authorName: "A", message: "hi", createdAt: "2026-09-14T10:00:00.000Z" }))
            .toMatchObject({ kind: "TEXT", attachment: null, internal: false });
    });

    it("foldMessage never mutates what it was given", () => {
        const messages = [message({ id: "msg_1", createdAt: "2026-09-14T10:00:00.000Z" })];
        foldMessage(messages, message({ id: "msg_2", createdAt: "2026-09-14T10:01:00.000Z" }));
        expect(messages).toHaveLength(1);
    });
});

/* ------------------------------------------------------------------ */
/* The internal-note rule                                              */
/* ------------------------------------------------------------------ */

describe("liveReplyBody", () => {
    it("never carries `internal` — an ops note belongs on the ticket thread, not on a live chat", () => {
        expect(liveReplyBody("On it now")).toEqual({ message: "On it now" });
        expect(Object.keys(liveReplyBody("On it now"))).not.toContain("internal");
    });

    it("carries an attachment when there is one, and lets the text be empty beside it", () => {
        expect(liveReplyBody("  ", "fil_9")).toEqual({ message: "", attachmentFileId: "fil_9" });
    });

    it("the live send posts the reply route with no internal flag on it", async () => {
        await liveChatService.send("tkt_1", "Looking now");
        expect(calls).toEqual([{ method: "POST", path: "/support/tickets/tkt_1/reply", body: { message: "Looking now" } }]);
    });
});

/* ------------------------------------------------------------------ */
/* The canned picker                                                   */
/* ------------------------------------------------------------------ */

const canned = (over: Partial<CannedReply> & Pick<CannedReply, "id" | "title" | "body">): CannedReply => ({
    team: null,
    isActive: true,
    ...over,
});

describe("insertCanned", () => {
    it("eats the '/' the picker was opened on", () => {
        expect(insertCanned("/", 1, "Thanks for waiting.")).toEqual({ text: "Thanks for waiting.", caret: 19 });
    });

    it("eats the whole token typed after the '/', not only the slash", () => {
        expect(insertCanned("/refu", 5, "Your refund is on its way.")).toEqual({
            text: "Your refund is on its way.",
            caret: 26,
        });
    });

    it("leaves everything written before the token exactly where it was", () => {
        const result = insertCanned("Hi Ravi — /ref", 14, "your refund is on its way.");
        expect(result.text).toBe("Hi Ravi — your refund is on its way.");
        expect(result.caret).toBe(result.text.length);
    });

    it("keeps what follows the caret, and puts the caret at the end of what it inserted", () => {
        const result = insertCanned("/ref — anything else?", 4, "Refunded.");
        expect(result.text).toBe("Refunded. — anything else?");
        expect(result.caret).toBe("Refunded.".length);
    });

    it("inserts at the caret when the picker was opened from the button rather than a '/'", () => {
        expect(insertCanned("Hello ", 6, "Thanks.")).toEqual({ text: "Hello Thanks.", caret: 13 });
    });

    it("does not eat a '/' in the middle of a word — a URL is not a picker", () => {
        const result = insertCanned("see adx.in/help", 15, "X");
        expect(result.text).toBe("see adx.in/helpX");
    });
});

describe("cannedQueryAt and matchCanned", () => {
    it("reads the token under the caret, and nothing when there is no token", () => {
        expect(cannedQueryAt("/ref", 4)).toBe("ref");
        expect(cannedQueryAt("hello", 5)).toBeNull();
        expect(cannedQueryAt("hi /", 4)).toBe("");
    });

    it("matches on the title first and the body too", () => {
        const replies = [
            canned({ id: "1", title: "Refund raised", body: "We have raised it." }),
            canned({ id: "2", title: "Greeting", body: "Thanks for your patience." }),
        ];
        expect(matchCanned(replies, "refund").map((item) => item.id)).toEqual(["1"]);
        expect(matchCanned(replies, "patience").map((item) => item.id)).toEqual(["2"]);
        expect(matchCanned(replies, "")).toHaveLength(2);
    });

    it("groups by team and puts the unteamed ones last", () => {
        expect(
            cannedTeams([
                canned({ id: "1", title: "a", body: "a", team: "Payments" }),
                canned({ id: "2", title: "b", body: "b" }),
                canned({ id: "3", title: "c", body: "c", team: "Bookings" }),
            ]),
        ).toEqual(["Bookings", "Payments", null]);
    });
});

/* ------------------------------------------------------------------ */
/* Presence                                                            */
/* ------------------------------------------------------------------ */

describe("the presence heartbeat", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("beats on the interval the 90 s presence key needs, and keeps beating", () => {
        const beat = vi.fn(async () => undefined);
        const stop = startHeartbeat(beat, HEARTBEAT_MS);
        expect(beat).not.toHaveBeenCalled();
        vi.advanceTimersByTime(HEARTBEAT_MS);
        expect(beat).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(HEARTBEAT_MS * 2);
        expect(beat).toHaveBeenCalledTimes(3);
        stop();
    });

    it("stops when it is stopped, so a console going offline drops out of the roster on its own", () => {
        const beat = vi.fn(async () => undefined);
        const stop = startHeartbeat(beat, HEARTBEAT_MS);
        vi.advanceTimersByTime(HEARTBEAT_MS);
        stop();
        vi.advanceTimersByTime(HEARTBEAT_MS * 5);
        expect(beat).toHaveBeenCalledTimes(1);
    });

    it("keeps beating after one beat fails — a dropped beat is not a reason to go offline", () => {
        const beat = vi.fn(async () => {
            throw new Error("network");
        });
        const stop = startHeartbeat(beat, HEARTBEAT_MS);
        vi.advanceTimersByTime(HEARTBEAT_MS * 3);
        expect(beat).toHaveBeenCalledTimes(3);
        stop();
    });

    it("beats the route the backend keeps the key alive on", async () => {
        vi.useRealTimers();
        await liveChatService.heartbeat();
        await liveChatService.setPresence(true);
        expect(calls).toEqual([
            { method: "POST", path: "/support/presence/heartbeat", body: {} },
            { method: "PUT", path: "/support/presence", body: { online: true } },
        ]);
    });
});

describe("leaving the desk from a closing page", () => {
    it("sends the same method and body as the ordinary offline call, with keepalive and the bearer on it", async () => {
        const { tokens } = await import("@/lib/api-client");
        tokens.set({ accessToken: "session-token" });
        const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));

        await liveChatService.setPresence(false);
        leaveDeskOnUnload(fetcher as unknown as typeof fetch);

        const ordinary = calls.find((call) => call.path === "/support/presence");
        expect(ordinary).toEqual({ method: "PUT", path: "/support/presence", body: OFFLINE_BODY });

        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://api.test/api/v1/support/presence");
        expect(init.method).toBe(ordinary?.method);
        expect(JSON.parse(init.body as string)).toEqual(ordinary?.body);
        expect(init.keepalive).toBe(true);
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
        tokens.clear();
    });

    it("swallows a failed send — there is no page left to tell", () => {
        const fetcher = vi.fn(async () => {
            throw new Error("gone");
        });
        expect(() => leaveDeskOnUnload(fetcher as unknown as typeof fetch)).not.toThrow();
    });
});

/* ------------------------------------------------------------------ */
/* The stream's own reconnect                                          */
/* ------------------------------------------------------------------ */

class FakeSource implements EventSourceLike {
    static opened: string[] = [];
    listeners = new Map<string, (event: MessageEvent<string>) => void>();
    onerror: ((event: unknown) => void) | null = null;
    onopen: ((event: unknown) => void) | null = null;
    closed = false;

    constructor(public url: string) {
        FakeSource.opened.push(url);
    }
    addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        this.listeners.set(type, listener);
    }
    close() {
        this.closed = true;
    }
    emit(type: string, data: unknown) {
        this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
    }
}

describe("openStream", () => {
    beforeEach(() => {
        FakeSource.opened = [];
    });

    it("opens the events URL with a freshly minted token", async () => {
        const sources: FakeSource[] = [];
        const handle = openStream({
            url: ticketEventsUrl("tkt_1"),
            events: ["message"],
            mintToken: async () => "token-one",
            onEvent: () => undefined,
            factory: (url) => {
                const source = new FakeSource(url);
                sources.push(source);
                return source;
            },
        });
        await vi.waitFor(() => expect(sources).toHaveLength(1));
        expect(FakeSource.opened[0]).toBe("https://api.test/api/v1/support/tickets/tkt_1/events?t=token-one");
        handle.close();
        expect(sources[0].closed).toBe(true);
    });

    it("mints a second token on reconnect, because the first was spent, and tells the caller to catch up", async () => {
        vi.useFakeTimers();
        const sources: FakeSource[] = [];
        let minted = 0;
        const reconnected = vi.fn();
        const handle = openStream({
            url: inboxEventsUrl(),
            events: ["breach"],
            mintToken: async () => `token-${++minted}`,
            onEvent: () => undefined,
            onReconnect: reconnected,
            retryMs: 1000,
            factory: (url) => {
                const source = new FakeSource(url);
                sources.push(source);
                return source;
            },
        });
        await vi.waitFor(() => expect(sources).toHaveLength(1));
        sources[0].onopen?.({});
        expect(reconnected).not.toHaveBeenCalled();

        sources[0].onerror?.({});
        expect(sources[0].closed).toBe(true);
        await vi.advanceTimersByTimeAsync(1000);
        await vi.waitFor(() => expect(sources).toHaveLength(2));
        expect(FakeSource.opened[1]).toContain("t=token-2");

        sources[1].onopen?.({});
        expect(reconnected).toHaveBeenCalledTimes(1);
        handle.close();
        vi.useRealTimers();
    });

    it("resumes from the newest message seen on reconnect, as `?lastEventId=`, rather than re-reading", async () => {
        vi.useFakeTimers();
        const sources: FakeSource[] = [];
        let minted = 0;
        let newest: string | null = null;
        const handle = openStream({
            url: ticketEventsUrl("tkt_1"),
            events: ["message"],
            mintToken: async () => `token-${++minted}`,
            resumeFrom: () => newest,
            onEvent: () => undefined,
            retryMs: 1000,
            factory: (url) => {
                const source = new FakeSource(url);
                sources.push(source);
                return source;
            },
        });
        await vi.waitFor(() => expect(sources).toHaveLength(1));
        // The first connection has nothing to resume from: the token alone.
        expect(FakeSource.opened[0]).toBe("https://api.test/api/v1/support/tickets/tkt_1/events?t=token-1");

        newest = "1757844000000";
        sources[0].onerror?.({});
        await vi.advanceTimersByTimeAsync(1000);
        await vi.waitFor(() => expect(sources).toHaveLength(2));
        expect(FakeSource.opened[1]).toBe(
            "https://api.test/api/v1/support/tickets/tkt_1/events?t=token-2&lastEventId=1757844000000",
        );
        handle.close();
        vi.useRealTimers();
    });

    it("hands each named event to the caller with its type on it", async () => {
        const seen: unknown[] = [];
        const sources: FakeSource[] = [];
        const handle = openStream<{ type: string }>({
            url: ticketEventsUrl("tkt_1"),
            events: ["message", "typing"],
            mintToken: async () => "t",
            onEvent: (event) => seen.push(event),
            factory: (url) => {
                const source = new FakeSource(url);
                sources.push(source);
                return source;
            },
        });
        await vi.waitFor(() => expect(sources).toHaveLength(1));
        sources[0].emit("typing", { who: "requester", typing: true });
        expect(seen).toEqual([{ type: "typing", who: "requester", typing: true }]);
        handle.close();
    });

    it("opens nothing once it has been closed, so a slow token cannot resurrect a dead pane", async () => {
        const sources: FakeSource[] = [];
        const handle = openStream({
            url: ticketEventsUrl("tkt_1"),
            events: ["message"],
            mintToken: () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5)),
            onEvent: () => undefined,
            factory: (url) => {
                const source = new FakeSource(url);
                sources.push(source);
                return source;
            },
        });
        handle.close();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(sources).toHaveLength(0);
    });
});

/* ------------------------------------------------------------------ */
/* The routes                                                          */
/* ------------------------------------------------------------------ */

describe("the routes every control calls", () => {
    it("are the ones the backend registered", async () => {
        await liveChatService.inbox({ mine: true });
        await liveChatService.streamToken("tkt_1");
        await liveChatService.inboxStreamToken();
        await liveChatService.typing("tkt_1", false);
        await liveChatService.seen("tkt_1");
        await liveChatService.reassign("tkt_1", "usr_priya");
        await liveChatService.convert("tkt_1");
        await liveChatService.canned({ includeInactive: true });
        await liveChatService.createCanned({ title: "Refund", body: "Raised.", team: null });
        await liveChatService.updateCanned("cr_1", { isActive: false });
        await liveChatService.deleteCanned("cr_1");
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            "GET /support/live/inbox?mine=true&pageSize=50",
            "POST /support/tickets/tkt_1/stream-token",
            "POST /support/live/inbox/stream-token",
            "POST /support/tickets/tkt_1/typing",
            "POST /support/tickets/tkt_1/seen",
            "POST /support/tickets/tkt_1/reassign",
            "POST /support/tickets/tkt_1/convert",
            "GET /support/canned?includeInactive=true",
            "POST /support/canned",
            "PATCH /support/canned/cr_1",
            "DELETE /support/canned/cr_1",
        ]);
        expect(calls.find((call) => call.path.endsWith("/convert"))?.body).toEqual({ to: "TICKET" });
    });
});
