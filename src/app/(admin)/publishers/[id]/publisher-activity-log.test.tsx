import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * R-C: the action log on the publisher page — "Log an activity" over
 * `POST /publishers/:id/activity`, the list read from `GET …/activity`.
 *
 * What is pinned: the kind and the note go up in the API's own words
 * (`CALLED`, a trimmed note; no `note` key at all when the box is blank);
 * the list re-reads after a write and the page is told, so the summary
 * feed catches up; the 409 the API answers for an account with no agent
 * reads as that sentence, not as a code.
 */

const { backend, toast } = vi.hoisted(() => {
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        entries: [] as { id: string; kind: string; note: string | null; at: string; agentId: string }[],
        fail: null as null | { status: number; code: string; message: string },
    };
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (method === "POST") {
            if (backend.fail) throw new actual.ApiError(backend.fail.status, backend.fail.code, backend.fail.message);
            const input = body as { kind: string; note?: string };
            const row = { id: `act_${backend.entries.length + 1}`, kind: input.kind, note: input.note ?? null, at: "2026-09-15T09:00:00.000Z", agentId: "agt_1" };
            backend.entries = [row, ...backend.entries];
            return row;
        }
        const counts = Object.fromEntries(["CHECK_IN", "FOLLOW_UP", "CALLED", "MESSAGED", "NOTE"].map((kind) => [kind, backend.entries.filter((e) => e.kind === kind).length]));
        return { items: backend.entries, total: backend.entries.length, page: 1, pageSize: 20, counts };
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
        },
    };
});

import { PublisherActivityLog } from "./publisher-activity-log";

function reset() {
    backend.calls = [];
    backend.entries = [];
    backend.fail = null;
    toast.success.mockReset();
    toast.error.mockReset();
}

describe("PublisherActivityLog", () => {
    it("lists GET /publishers/:id/activity, newest first, each kind labelled", async () => {
        reset();
        backend.entries = [
            { id: "act_2", kind: "FOLLOW_UP", note: "Site visit Thursday", at: "2026-09-14T09:00:00.000Z", agentId: "agt_1" },
            { id: "act_1", kind: "CHECK_IN", note: null, at: "2026-09-10T09:00:00.000Z", agentId: "agt_1" },
        ];
        render(<PublisherActivityLog publisherId="pub_1" hasAgent />);

        const rows = await within(await screen.findByTestId("publisher-activity-entries")).findAllByRole("listitem");
        expect(backend.calls).toEqual([{ method: "GET", path: "/publishers/pub_1/activity" }]);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("Follow-up");
        expect(rows[0]).toHaveTextContent("Site visit Thursday");
        expect(rows[1]).toHaveTextContent("Check-in");
        expect(screen.getByText("2 entries")).toBeInTheDocument();
    });

    it("logs an activity: the kind and the trimmed note go up, the list re-reads, the page is told", async () => {
        reset();
        const onLogged = vi.fn();
        render(<PublisherActivityLog publisherId="pub_1" hasAgent onLogged={onLogged} />);
        await screen.findByText("Nothing logged on this account yet.");

        fireEvent.click(screen.getByRole("radio", { name: "Messaged" }));
        fireEvent.change(screen.getByLabelText("Note"), { target: { value: "  Sent the rate card on WhatsApp  " } });
        fireEvent.click(screen.getByRole("button", { name: "Log activity" }));

        await waitFor(() => expect(onLogged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toContainEqual({
            method: "POST",
            path: "/publishers/pub_1/activity",
            body: { kind: "MESSAGED", note: "Sent the rate card on WhatsApp" },
        });
        expect(toast.success).toHaveBeenCalledWith("Messaged logged");
        // The list is read again after the write, and the new row is on it.
        expect(backend.calls.filter((call) => call.method === "GET")).toHaveLength(2);
        expect(await screen.findByText("Sent the rate card on WhatsApp")).toBeInTheDocument();
        expect(screen.getByLabelText("Note")).toHaveValue("");
    });

    it("sends no note key at all when the box is blank — the API refuses an empty string", async () => {
        reset();
        render(<PublisherActivityLog publisherId="pub_1" hasAgent />);
        await screen.findByText("Nothing logged on this account yet.");

        // Called is the default kind: a phone call is the commonest thing to log.
        expect(screen.getByRole("radio", { name: "Called" })).toHaveAttribute("aria-checked", "true");
        fireEvent.click(screen.getByRole("button", { name: "Log activity" }));

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Called logged"));
        const post = backend.calls.find((call) => call.method === "POST")!;
        expect(post.body).toEqual({ kind: "CALLED" });
    });

    it("reads the API's 409 for an account with no agent as a sentence", async () => {
        reset();
        backend.fail = { status: 409, code: "CONFLICT", message: "This account has no agent to log against" };
        const onLogged = vi.fn();
        render(<PublisherActivityLog publisherId="pub_1" hasAgent={false} onLogged={onLogged} />);
        await screen.findByText("Nothing logged on this account yet.");
        expect(screen.getByText(/attribute it before logging/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Log activity" }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This account has no agent to log against."));
        expect(onLogged).not.toHaveBeenCalled();
    });
});
