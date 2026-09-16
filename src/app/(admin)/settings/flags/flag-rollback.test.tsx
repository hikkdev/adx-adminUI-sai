import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { FeatureFlag } from "@/services/flags";
import { FlagRollback, positionLabel } from "./flag-rollback";

/**
 * CG5 — the Rollback confirm.
 *
 * What this pins: the confirm names the position it restores and the one
 * it leaves; nothing goes on the wire until Roll back is pressed, and then
 * exactly `POST /flags/:key/rollback` with the trimmed note; a flag with
 * no `lastGoodState` cannot be confirmed; a 409 (the server's "never
 * moved") is a toast, not a crash.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        fail: null as { status: number; code: string; message: string } | null,
        reset() {
            this.calls = [];
            this.fail = null;
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.fail) throw new actual.ApiError(backend.fail.status, backend.fail.code, backend.fail.message);
        return { ...flag(), enabled: true, rolloutPercent: 25, lastChange: null };
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
            blob: () => Promise.reject(new Error("not here")),
        },
    };
});

function flag(over: Partial<FeatureFlag> = {}): FeatureFlag {
    return {
        key: "campaigns.multi-market",
        enabled: true,
        rolloutPercent: 40,
        description: null,
        updatedById: "u1",
        surfaces: ["APP_USER", "BACKEND"],
        kind: "FEATURE",
        source: "REGISTERED",
        owner: "demand",
        variant: null,
        variants: [],
        rollout: { roles: ["ADMIN"] },
        lastGoodState: { enabled: true, rolloutPercent: 25, variant: null, rollout: null },
        registeredAt: "2026-09-13T00:00:00.000Z",
        aliases: ["multi-market-campaigns"],
        createdAt: "2026-09-13T00:00:00.000Z",
        updatedAt: "2026-09-13T00:00:00.000Z",
        lastChange: null,
        ...over,
    };
}

describe("positionLabel", () => {
    it("writes a position in one line", () => {
        expect(positionLabel({ enabled: true, rolloutPercent: 40, variant: "treatment", rollout: { roles: ["ADMIN"] } })).toBe(
            "On for 40% of users · variant treatment · ADMIN",
        );
        expect(positionLabel({ enabled: false, rolloutPercent: 100, variant: null, rollout: null })).toBe("Off");
    });
});

describe("FlagRollback", () => {
    beforeEach(() => {
        backend.reset();
        toast.success.mockReset();
        toast.error.mockReset();
    });

    it("names both positions, sends nothing until confirmed, then posts the rollback with the note", async () => {
        const onDone = vi.fn();
        const onOpenChange = vi.fn();
        render(<FlagRollback flag={flag()} onOpenChange={onOpenChange} onDone={onDone} />);

        expect(screen.getByText("Roll back campaigns.multi-market?")).toBeInTheDocument();
        expect(screen.getByText(/Back to On for 25% of users\. It is On for 40% of users · ADMIN now/)).toBeInTheDocument();
        expect(backend.calls).toHaveLength(0);

        fireEvent.change(screen.getByLabelText("Why"), { target: { value: "  checkout errors  " } });
        fireEvent.click(screen.getByRole("button", { name: "Roll back" }));

        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/flags/campaigns.multi-market/rollback", body: { note: "checkout errors" } }]);
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(toast.success).toHaveBeenCalledWith("campaigns.multi-market rolled back · On for 25% of users", expect.anything());
    });

    it("sends an empty body when there is no note", async () => {
        const onDone = vi.fn();
        render(<FlagRollback flag={flag()} onOpenChange={() => {}} onDone={onDone} />);
        fireEvent.click(screen.getByRole("button", { name: "Roll back" }));
        await waitFor(() => expect(onDone).toHaveBeenCalled());
        expect(backend.calls[0]?.body).toEqual({});
    });

    it("cannot be confirmed while the flag has never moved", () => {
        render(<FlagRollback flag={flag({ lastGoodState: null })} onOpenChange={() => {}} onDone={() => {}} />);
        expect(screen.getByText(/never moved/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Roll back" })).toBeDisabled();
    });

    it("turns the server's refusal into a toast and does not report a change", async () => {
        backend.fail = { status: 409, code: "NEVER_MOVED", message: "This flag has never moved." };
        const onDone = vi.fn();
        render(<FlagRollback flag={flag()} onOpenChange={() => {}} onDone={onDone} />);
        fireEvent.click(screen.getByRole("button", { name: "Roll back" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This flag has never moved."));
        expect(onDone).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
    });
});
