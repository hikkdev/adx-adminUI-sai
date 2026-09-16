import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LiveInboxRow } from "@/services/live-chat";

/**
 * The live pane, answering.
 *
 * An in-memory backend keeping the support module's own rules, so what is
 * walked is what an operator does: open a chat, read both sides, watch the
 * other side type, insert a canned reply over the '/' that opened the picker,
 * send it. The service, its URLs and the reducer are real; only the transport
 * and the socket are faked.
 *
 * The load-bearing assertion is the negative one. This pane cannot write an
 * internal note: there is no control for it, and the body it posts carries no
 * `internal` key. An ops note streamed live to the person it is about is the
 * one mistake in this package that cannot be taken back, and it is invisible
 * on screen until it has already happened.
 */

const { backend, sources } = vi.hoisted(() => {
    type Message = {
        id: string;
        authorId: string;
        authorName: string;
        message: string;
        internal?: boolean;
        kind?: string;
        attachmentFileId?: string | null;
        attachmentName?: string | null;
        createdAt: string;
    };
    const backend = {
        messages: [] as Message[],
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
            this.messages = [
                {
                    id: "m1",
                    authorId: "usr_requester",
                    authorName: "Ravi Kumar",
                    message: "My booking is not showing.",
                    createdAt: "2026-09-14T10:00:00.000Z",
                },
            ];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path === "/support/tickets/tkt_1") {
                return {
                    id: "tkt_1",
                    userId: "usr_requester",
                    displayId: "TKT-1409-0001",
                    title: "Booking",
                    status: "OPEN",
                    channel: "LIVE_CHAT",
                    requesterSeenAt: null,
                    agentSeenAt: null,
                    firstResponseAt: null,
                    lastMessageAt: "2026-09-14T10:00:00.000Z",
                    assignedAdmin: { id: "usr_admin", name: "Priya Rao" },
                    plan: { name: "Growth", reason: "PUBLISHER_SUBSCRIPTION" },
                    messages: this.messages,
                };
            }
            if (method === "POST" && path === "/support/tickets/tkt_1/stream-token") {
                return { token: "f".repeat(64), expiresInSec: 300 };
            }
            if (method === "POST" && path === "/support/tickets/tkt_1/reply") {
                const { message } = body as { message: string };
                const reply: Message = {
                    id: `m${this.messages.length + 1}`,
                    authorId: "usr_admin",
                    authorName: "Priya Rao",
                    message,
                    createdAt: "2026-09-14T10:02:00.000Z",
                };
                this.messages.push(reply);
                return reply;
            }
            if (method === "POST" && (path.endsWith("/seen") || path.endsWith("/typing"))) return { ok: true };
            throw new Error(`No route ${method} ${path}`);
        },
    };
    const sources: FakeEventSource[] = [];
    class FakeEventSource {
        listeners = new Map<string, (event: MessageEvent<string>) => void>();
        onerror: ((event: unknown) => void) | null = null;
        onopen: ((event: unknown) => void) | null = null;
        closed = false;
        constructor(public url: string) {
            sources.push(this as unknown as FakeEventSource);
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
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    return { backend, sources };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: (path: string) => backend.handle("GET", path),
            post: (path: string, body?: unknown) => backend.handle("POST", path, body),
            patch: (path: string, body?: unknown) => backend.handle("PATCH", path, body),
            put: (path: string, body?: unknown) => backend.handle("PUT", path, body),
            delete: (path: string) => backend.handle("DELETE", path),
        },
    };
});
vi.mock("@/lib/api-config", () => ({
    isLive: () => true,
    apiConfig: { live: true, baseUrl: "https://api.test/api/v1" },
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya Rao", email: "priya@adx.test", roles: ["ADMIN"] } }),
}));
/* The attachment bytes are not what this file is about; PrivateFile's own
   suite covers the fetch, and here it would only add an unresolved request. */
vi.mock("@/components/adx/private-file", () => ({
    PrivateFile: ({ alt }: { alt: string }) => <span data-testid="attachment">{alt}</span>,
    privateFileUrl: (id: string) => `/files/${id}`,
}));

import { ChatPane } from "./chat-pane";

const row: LiveInboxRow = {
    id: "tkt_1",
    displayId: "TKT-1409-0001",
    title: "Booking",
    requester: { userId: "usr_requester", name: "Ravi Kumar" },
    assignedAdmin: { id: "usr_admin", name: "Priya Rao" },
    lastMessageAt: "2026-09-14T10:00:00.000Z",
    lastMessage: null,
    waitingSince: "2026-09-14T10:00:00.000Z",
    firstResponseAt: null,
    firstResponseBreached: false,
    unread: 1,
    createdAt: "2026-09-14T10:00:00.000Z",
    plan: { name: "Growth", reason: "PUBLISHER_SUBSCRIPTION" },
};

const canned = [
    { id: "cr_1", title: "Refund raised", body: "Your refund is on its way.", team: "Payments", isActive: true },
    { id: "cr_2", title: "Greeting", body: "Thanks for your patience.", team: null, isActive: true },
];

const renderPane = () =>
    render(<ChatPane row={row} canned={canned} operators={[{ userId: "usr_other", name: "Amit", openChats: 1 }]} onChanged={() => {}} />);

beforeEach(() => {
    backend.reset();
    sources.length = 0;
});

describe("the live chat pane", () => {
    it("reads the thread by id and draws what the requester said", async () => {
        renderPane();
        expect(await screen.findByText("My booking is not showing.")).toBeInTheDocument();
        expect(backend.calls.some((call) => call.method === "GET" && call.path === "/support/tickets/tkt_1")).toBe(true);
    });

    it("offers no internal-note control at all — an ops note belongs on the ticket thread", async () => {
        renderPane();
        await screen.findByText("My booking is not showing.");
        expect(screen.queryByLabelText(/internal note/i)).toBeNull();
        expect(screen.queryByRole("switch")).toBeNull();
        // And it says where a note does belong, rather than leaving the operator to guess.
        expect(screen.getByRole("link", { name: /ticket thread/i })).toBeInTheDocument();
    });

    it("posts a reply with no `internal` key on it", async () => {
        renderPane();
        await screen.findByText("My booking is not showing.");
        const composer = screen.getByLabelText("Reply to this chat");
        fireEvent.change(composer, { target: { value: "Looking now." } });
        fireEvent.click(screen.getByLabelText("Send"));

        await waitFor(() => {
            const reply = backend.calls.find((call) => call.path === "/support/tickets/tkt_1/reply");
            expect(reply).toBeDefined();
            expect(reply?.body).toEqual({ message: "Looking now." });
            expect(Object.keys(reply?.body as object)).not.toContain("internal");
        });
    });

    it("inserts a canned reply over the '/' that opened the picker", async () => {
        renderPane();
        await screen.findByText("My booking is not showing.");
        const composer = screen.getByLabelText("Reply to this chat") as HTMLTextAreaElement;
        fireEvent.change(composer, { target: { value: "Hi Ravi — /refu", selectionStart: 15 } });

        const option = await screen.findByRole("option", { name: /Refund raised/ });
        fireEvent.click(option);

        await waitFor(() => expect(composer.value).toBe("Hi Ravi — Your refund is on its way."));
    });

    it("draws a line that arrives on the stream without another read", async () => {
        renderPane();
        await screen.findByText("My booking is not showing.");
        await waitFor(() => expect(sources.length).toBeGreaterThan(0));
        const before = backend.calls.filter((call) => call.method === "GET").length;

        act(() => {
            sources[0].emit("message", {
                id: "m_stream",
                authorId: "usr_requester",
                authorName: "Ravi Kumar",
                kind: "TEXT",
                message: "Any update?",
                attachment: null,
                internal: false,
                createdAt: "2026-09-14T10:03:00.000Z",
            });
        });

        expect(await screen.findByText("Any update?")).toBeInTheDocument();
        expect(backend.calls.filter((call) => call.method === "GET")).toHaveLength(before);
    });

    it("raises the other side's typing indicator and takes it down again", async () => {
        renderPane();
        await screen.findByText("My booking is not showing.");
        await waitFor(() => expect(sources.length).toBeGreaterThan(0));

        act(() => sources[0].emit("typing", { who: "requester", typing: true }));
        expect(await screen.findByTestId("requester-typing")).toBeInTheDocument();

        act(() => sources[0].emit("typing", { who: "requester", typing: false }));
        await waitFor(() => expect(screen.queryByTestId("requester-typing")).toBeNull());
    });

    it("opens the stream with a minted token rather than a bearer header, which EventSource cannot set", async () => {
        renderPane();
        await waitFor(() => expect(sources.length).toBeGreaterThan(0));
        expect(sources[0].url).toBe(`https://api.test/api/v1/support/tickets/tkt_1/events?t=${"f".repeat(64)}`);
    });

    it("marks the thread seen when it is opened", async () => {
        renderPane();
        await waitFor(() => expect(backend.calls.some((call) => call.path === "/support/tickets/tkt_1/seen")).toBe(true));
    });

    it("wears the requester's plan in the header, with the reason as the tooltip", async () => {
        renderPane();
        await screen.findByText("My booking is not showing.");
        const badge = screen.getByTestId("plan-badge");
        expect(badge).toHaveTextContent("Growth");
        expect(badge).toHaveAttribute("title", expect.stringMatching(/publisher subscription/i));
    });

    it("withdraws an outstanding typing claim when it is unmounted mid-word", async () => {
        const { unmount } = renderPane();
        await screen.findByText("My booking is not showing.");
        fireEvent.change(screen.getByLabelText("Reply to this chat"), { target: { value: "Loo" } });
        await waitFor(() =>
            expect(backend.calls.filter((call) => call.path === "/support/tickets/tkt_1/typing").map((call) => call.body)).toEqual([
                { typing: true },
            ]),
        );

        unmount();

        const typing = backend.calls.filter((call) => call.path === "/support/tickets/tkt_1/typing").map((call) => call.body);
        expect(typing).toEqual([{ typing: true }, { typing: false }]);
    });

    it("sends no typing false on unmount when nothing was claimed", async () => {
        const { unmount } = renderPane();
        await screen.findByText("My booking is not showing.");
        unmount();
        expect(backend.calls.filter((call) => call.path === "/support/tickets/tkt_1/typing")).toHaveLength(0);
    });

    it("reconnects from the newest message seen rather than re-reading the thread", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            renderPane();
            await screen.findByText("My booking is not showing.");
            await waitFor(() => expect(sources.length).toBe(1));
            act(() => sources[0].onopen?.({}));

            act(() => {
                sources[0].emit("message", {
                    id: "m_stream",
                    authorId: "usr_requester",
                    authorName: "Ravi Kumar",
                    kind: "TEXT",
                    message: "Any update?",
                    attachment: null,
                    internal: false,
                    createdAt: "2026-09-14T10:03:00.000Z",
                });
            });
            await screen.findByText("Any update?");
            const reads = backend.calls.filter((call) => call.method === "GET").length;

            act(() => sources[0].onerror?.({}));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(3000);
            });
            await waitFor(() => expect(sources.length).toBe(2));
            act(() => sources[1].onopen?.({}));

            const ms = new Date("2026-09-14T10:03:00.000Z").getTime();
            expect(sources[1].url).toBe(`https://api.test/api/v1/support/tickets/tkt_1/events?t=${"f".repeat(64)}&lastEventId=${ms}`);
            expect(backend.calls.filter((call) => call.method === "GET")).toHaveLength(reads);
        } finally {
            vi.useRealTimers();
        }
    });
});
