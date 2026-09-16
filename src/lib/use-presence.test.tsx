import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/**
 * Presence, as the console keeps it — I4-C.
 *
 * Three things a click-through cannot see. A roster read that merely failed
 * must not take the dot away: the operator is still on as far as the server
 * knows, and the last roster stays on screen marked stale. Only the feature
 * being off — `503 FEATURE_OFF` — is an answer rather than a failure. And a
 * page that closes must leave the desk at once, through the one request a
 * closing page may finish, with exactly the body the ordinary offline click
 * sends.
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        roster: [] as { userId: string; name: string | null; openChats: number }[],
        fail: null as null | { status: number; code: string },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path === "/support/presence") {
                if (this.fail) {
                    const { ApiError } = await import("@/lib/api-client");
                    throw new ApiError(this.fail.status, this.fail.code, `${this.fail.code}`);
                }
                return this.roster;
            }
            if (method === "PUT" && path === "/support/presence") return body;
            if (method === "POST" && path === "/support/presence/heartbeat") return { online: true };
            throw new Error(`No route ${method} ${path}`);
        },
    },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: (path: string) => backend.handle("GET", path),
            post: (path: string, body?: unknown) => backend.handle("POST", path, body),
            put: (path: string, body?: unknown) => backend.handle("PUT", path, body),
            patch: (path: string, body?: unknown) => backend.handle("PATCH", path, body),
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

import { tokens } from "@/lib/api-client";
import { staleLabel, usePresence } from "./use-presence";

const me = { userId: "usr_admin", name: "Priya Rao", openChats: 2 };

beforeEach(() => {
    backend.calls = [];
    backend.roster = [me];
    backend.fail = null;
});

afterEach(() => {
    vi.unstubAllGlobals();
    tokens.clear();
});

describe("usePresence", () => {
    it("reads the roster and says whether this operator is on it", async () => {
        const { result } = renderHook(() => usePresence());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.online).toBe(true);
        expect(result.current.myOpenChats).toBe(2);
        expect(result.current.available).toBe(true);
        expect(result.current.stale).toBe(false);
        expect(result.current.lastReadAt).not.toBeNull();
    });

    it("keeps the last roster and marks it stale when a re-read fails for a passing reason — the dot stays", async () => {
        const { result } = renderHook(() => usePresence());
        await waitFor(() => expect(result.current.online).toBe(true));
        const readAt = result.current.lastReadAt;

        backend.fail = { status: 500, code: "INTERNAL" };
        act(() => result.current.reload());
        await waitFor(() => expect(result.current.stale).toBe(true));

        expect(result.current.available).toBe(true);
        expect(result.current.online).toBe(true);
        expect(result.current.operators).toEqual([me]);
        expect(result.current.lastReadAt).toBe(readAt);
        expect(result.current.error).toBe("INTERNAL");

        // The next good read clears it.
        backend.fail = null;
        act(() => result.current.reload());
        await waitFor(() => expect(result.current.stale).toBe(false));
        expect(result.current.available).toBe(true);
    });

    it("takes the desk away only on the feature-off 503", async () => {
        backend.fail = { status: 503, code: "FEATURE_OFF" };
        const { result } = renderHook(() => usePresence());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.available).toBe(false);
        expect(result.current.stale).toBe(false);
        expect(result.current.online).toBe(false);
    });

    it("a network failure before any read lands is stale, not gone", async () => {
        backend.fail = { status: 0, code: "NETWORK" };
        const { result } = renderHook(() => usePresence());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.available).toBe(true);
        expect(result.current.stale).toBe(true);
        expect(result.current.lastReadAt).toBeNull();
        expect(staleLabel(result.current.lastReadAt, Date.now())).toBe("Roster not read yet");
    });

    it("leaves the desk when the page hides — the same PUT the offline click sends, through fetch with keepalive", async () => {
        tokens.set({ accessToken: "session-token" });
        const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetcher);

        const { result } = renderHook(() => usePresence());
        await waitFor(() => expect(result.current.online).toBe(true));

        act(() => {
            window.dispatchEvent(new Event("pagehide"));
        });
        // The fallback firing too must not write offline twice.
        act(() => {
            window.dispatchEvent(new Event("beforeunload"));
        });

        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://api.test/api/v1/support/presence");
        expect(init.method).toBe("PUT");
        expect(init.keepalive).toBe(true);
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token");

        // Side by side with the ordinary offline call.
        await act(async () => {
            await result.current.setOnline(false);
        });
        const ordinary = backend.calls.find((call) => call.method === "PUT" && call.path === "/support/presence");
        expect(ordinary?.body).toEqual({ online: false });
        expect(JSON.parse(init.body as string)).toEqual(ordinary?.body);
    });

    it("sends nothing on pagehide while this operator is not on the desk", async () => {
        backend.roster = [{ userId: "usr_other", name: "Amit", openChats: 1 }];
        const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetcher);

        const { result } = renderHook(() => usePresence());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.online).toBe(false);

        act(() => {
            window.dispatchEvent(new Event("pagehide"));
        });
        expect(fetcher).not.toHaveBeenCalled();
    });
});

describe("staleLabel", () => {
    it("says how old the roster on screen is, in the unit somebody would say it in", () => {
        const now = Date.now();
        expect(staleLabel(now - 42_000, now)).toBe("Roster last read 42s ago");
        expect(staleLabel(now - 4 * 60_000, now)).toBe("Roster last read 4m ago");
        expect(staleLabel(null, now)).toBe("Roster not read yet");
    });
});
