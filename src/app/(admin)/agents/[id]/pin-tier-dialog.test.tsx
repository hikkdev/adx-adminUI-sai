import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * DR 05 — pinning a tier from the desk.
 *
 * `PATCH /agents/:id` deliberately cannot write the tier; this dialog is the
 * explicit door, and what it pins is the two bodies that door accepts — a
 * rung with a reason, or `tier: null` with a reason to hand the rung back to
 * the ladder — and that neither goes without the reason the server insists
 * on.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "PATCH" && path === "/agents/agt_1/tier") {
                const sent = body as { tier: string | null; level?: string };
                const pinned = sent.tier !== null;
                return {
                    current: {
                        tier: pinned ? sent.tier : "BRONZE",
                        level: pinned ? sent.level : "I",
                        label: pinned ? `${sent.tier} ${sent.level}` : "Bronze I",
                        pinned,
                    },
                    next: null,
                    stepDone: 0,
                    stepTarget: 5,
                    onboarded: { publishers: 0, advertisers: 0, total: 0 },
                    ladder: [],
                    benefits: [],
                    promotion: null,
                    history: [],
                };
            }
            throw new Error(`No route ${method} ${path}`);
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(404, "NOT_FOUND", (cause as Error).message);
        }
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { PinTierDialog } from "./pin-tier-dialog";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

const current = { tier: "BRONZE" as const, level: "III" as const, label: "Bronze III" };

describe("pinning", () => {
    it("sends the rung and the reason, and says what it did once the server answered", async () => {
        const onSaved = vi.fn();
        render(
            <PinTierDialog agentId="agt_1" agentName="Rahul Kumar" mode="pin" current={current} open onOpenChange={vi.fn()} onSaved={onSaved} />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        expect(dialog.getByRole("button", { name: "Pin tier" })).toBeDisabled();

        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Territory lead for Q3" } });
        fireEvent.click(dialog.getByRole("button", { name: "Pin tier" }));

        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(backend.calls).toContainEqual({
            method: "PATCH",
            path: "/agents/agt_1/tier",
            body: { tier: "BRONZE", level: "III", reason: "Territory lead for Q3" },
        });
        expect(toast.success).toHaveBeenCalledTimes(1);
        expect(toast.success.mock.calls[0][0]).toMatch(/pinned/i);
    });

    it("will not pin without a reason of at least three characters — the server refuses one", async () => {
        render(
            <PinTierDialog agentId="agt_1" agentName="Rahul Kumar" mode="pin" current={current} open onOpenChange={vi.fn()} onSaved={vi.fn()} />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "ok" } });
        expect(dialog.getByRole("button", { name: "Pin tier" })).toBeDisabled();
        expect(backend.calls).toHaveLength(0);
    });
});

describe("unpinning", () => {
    it("sends tier null with the reason, so the ladder takes the rung back", async () => {
        const onSaved = vi.fn();
        render(
            <PinTierDialog agentId="agt_1" agentName="Rahul Kumar" mode="unpin" current={current} open onOpenChange={vi.fn()} onSaved={onSaved} />,
        );
        const dialog = within(await screen.findByRole("dialog"));
        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Quarter over; back to the ladder" } });
        fireEvent.click(dialog.getByRole("button", { name: "Unpin" }));

        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        expect(backend.calls).toContainEqual({
            method: "PATCH",
            path: "/agents/agt_1/tier",
            body: { tier: null, reason: "Quarter over; back to the ladder" },
        });
    });
});
