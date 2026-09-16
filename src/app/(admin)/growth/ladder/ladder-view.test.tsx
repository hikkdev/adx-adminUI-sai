import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * DR 05 — the tier ladder, from the desk.
 *
 * There is no DR 10 frame for this screen; the console's own form idiom
 * stands in. What this pins is the write: the exact body `PUT
 * /agents/tier-ladder` gets — rungs as numbers, blank support lines as
 * null so the server clears them — and the server's own sentence for a
 * ladder that does not climb landing beside the table rather than in a
 * toast that disappears.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: null as string | null,
        ladder: {} as Record<string, unknown>,
        reset() {
            this.calls = [];
            this.refuse = null;
            this.ladder = {
                rungs: [
                    { tier: "BRONZE", level: "I", from: 0 },
                    { tier: "BRONZE", level: "II", from: 5 },
                    { tier: "SILVER", level: "I", from: 20 },
                ],
                supportLines: { GOLD: "+91 80 4000 2000" },
            };
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path === "/agents/tier-ladder") return this.ladder;
            if (method === "PUT" && path === "/agents/tier-ladder") {
                if (this.refuse) throw new Error(this.refuse);
                const sent = body as { rungs?: unknown; supportLines?: Record<string, string | null> };
                if (sent.rungs) this.ladder.rungs = sent.rungs;
                if (sent.supportLines) {
                    this.ladder.supportLines = Object.fromEntries(
                        Object.entries(sent.supportLines).filter(([, line]) => line),
                    );
                }
                return this.ladder;
            }
            throw new Error(`No route ${method} ${path}`);
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/growth/ladder",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return {
        ...actual,
        apiConfig: { ...actual.apiConfig, live: true },
        isLive: (domain: keyof typeof actual.liveDomains) => actual.liveDomains[domain],
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(400, "VALIDATION_ERROR", (cause as Error).message);
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

import { growthService } from "@/services/growth";
import { LadderView } from "./ladder-view";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

async function mount() {
    const ladder = await growthService.ladder();
    const onSaved = vi.fn();
    render(<LadderView ladder={ladder} onSaved={onSaved} />);
    return { onSaved };
}

const rung = (index: number) => within(screen.getAllByRole("row").filter((row) => row.querySelector("input"))[index]);

describe("what the screen draws", () => {
    it("draws the rungs in force and the one support line ops stored, and says what the thresholds count", async () => {
        await mount();
        expect(rung(0).getByLabelText("From")).toHaveValue(0);
        expect(rung(1).getByLabelText("From")).toHaveValue(5);
        expect(rung(2).getByLabelText("From")).toHaveValue(20);
        expect(screen.getByLabelText("Gold support line")).toHaveValue("+91 80 4000 2000");
        expect(screen.getByLabelText("Bronze support line")).toHaveValue("");
        // The note says what a threshold counts and what stands in when none is stored.
        const note = screen.getByText(/built-in table/).closest("p")!;
        expect(note).toHaveTextContent(/Thresholds are onboarded accounts/);
        expect(note).toHaveTextContent(/fallback/);
        expect(screen.getByRole("button", { name: "Save ladder" })).toBeDisabled();
    });
});

describe("saving", () => {
    it("PUTs the rungs as numbers and every support line, blank as null, and says so once the server answered", async () => {
        const { onSaved } = await mount();
        fireEvent.change(rung(1).getByLabelText("From"), { target: { value: "8" } });
        fireEvent.change(screen.getByLabelText("Silver support line"), { target: { value: " +91 80 4000 1000 " } });
        fireEvent.click(screen.getByRole("button", { name: "Save ladder" }));

        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        const put = backend.calls.find((call) => call.method === "PUT");
        expect(put?.path).toBe("/agents/tier-ladder");
        expect(put?.body).toEqual({
            rungs: [
                { tier: "BRONZE", level: "I", from: 0 },
                { tier: "BRONZE", level: "II", from: 8 },
                { tier: "SILVER", level: "I", from: 20 },
            ],
            supportLines: { BRONZE: null, SILVER: "+91 80 4000 1000", GOLD: "+91 80 4000 2000", PLATINUM: null },
        });
        expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it("surfaces the server's sentence beside the table when the ladder does not climb, and claims no save", async () => {
        backend.refuse = "SILVER I does not climb";
        const { onSaved } = await mount();
        fireEvent.change(rung(2).getByLabelText("From"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: "Save ladder" }));

        await waitFor(() => expect(screen.getByText("SILVER I does not climb")).toBeInTheDocument());
        expect(toast.success).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("adds, moves and removes rungs, and sends the table in the order shown", async () => {
        const { onSaved } = await mount();
        fireEvent.click(screen.getByRole("button", { name: "Add rung" }));
        // The new rung is last; give it a threshold above the one before it.
        fireEvent.change(rung(3).getByLabelText("From"), { target: { value: "40" } });
        // Remove the second rung so the ladder has three again.
        fireEvent.click(rung(1).getByRole("button", { name: "Remove rung" }));
        fireEvent.click(screen.getByRole("button", { name: "Save ladder" }));

        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        const put = backend.calls.find((call) => call.method === "PUT");
        const sent = (put?.body as { rungs: { from: number }[] }).rungs;
        expect(sent.map((r) => r.from)).toEqual([0, 20, 40]);
    });
});
