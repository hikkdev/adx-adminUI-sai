import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * D6 — the Growth CMS, live.
 *
 * The screen used to draw six seeded programs whose fields do not exist on
 * `MilestoneTemplate`, and "New milestone" opened the first fixture. What
 * this pins is the table reading the real contract — a reward printed from
 * the decimal string, a window of null printed as all time, a lock printed
 * as a count — the Active switch actually PATCHing and being honest about
 * it, and "New milestone" creating something: the exact body it POSTs, with
 * the reward as a string and the template landing inactive by default so it
 * does not appear on every agent's board before somebody has checked it.
 */

const { backend, toast, router } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const router = { push: vi.fn(), replace: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refusePatch: false,
        templates: [] as Record<string, unknown>[],
        reset() {
            this.calls = [];
            this.refusePatch = false;
            this.templates = [
                {
                    id: "tpl_onboard",
                    type: "ONBOARDING",
                    title: "Onboard 10 publishers",
                    description: "Bring ten businesses through onboarding.",
                    target: 10,
                    rewardAmount: "5000.00",
                    sortOrder: 1,
                    isActive: true,
                    windowDays: 30,
                    startsAt: null,
                    unlockAfter: null,
                    createdAt: "2026-09-01T04:30:00.000Z",
                    updatedAt: "2026-09-10T04:30:00.000Z",
                },
                {
                    id: "tpl_revenue",
                    type: "REVENUE",
                    title: "Earn ₹20,000",
                    description: "Credited incentives.",
                    target: 20000,
                    rewardAmount: "1500.50",
                    sortOrder: 2,
                    isActive: false,
                    windowDays: null,
                    startsAt: "2026-10-01T00:00:00.000Z",
                    unlockAfter: 2,
                    createdAt: "2026-09-01T04:30:00.000Z",
                    updatedAt: "2026-09-10T04:30:00.000Z",
                },
            ];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path === "/milestones/templates") return this.templates;
            if (method === "POST" && path === "/milestones/templates") {
                const row = { id: "tpl_new", createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z", ...(body as object) };
                this.templates.push(row);
                return row;
            }
            const patch = path.match(/^\/milestones\/templates\/([^/]+)$/);
            if (method === "PATCH" && patch) {
                if (this.refusePatch) throw new Error("No such milestone template");
                const row = this.templates.find((template) => template.id === patch[1])!;
                Object.assign(row, body as object);
                return row;
            }
            throw new Error(`No route ${method} ${path}`);
        },
    };
    return { backend, toast, router };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/growth",
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

import { growthService } from "@/services/growth";
import { GrowthView } from "./growth-view";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
    router.push.mockReset();
});

async function mount() {
    const templates = await growthService.templates();
    const onChanged = vi.fn();
    render(<GrowthView templates={templates} onChanged={onChanged} />);
    return { onChanged };
}

const rowOf = (title: string) => within(screen.getByText(title).closest("tr")!);

describe("what the table draws", () => {
    it("prints the reward from the decimal string, the window, the start and the lock as the contract has them", async () => {
        await mount();
        const onboard = rowOf("Onboard 10 publishers");
        expect(onboard.getByText("₹5,000.00")).toBeInTheDocument();
        expect(onboard.getByText("30 days")).toBeInTheDocument();
        expect(onboard.getByText("10 accounts")).toBeInTheDocument();
        expect(onboard.getByText("Onboarding")).toBeInTheDocument();

        const revenue = rowOf("Earn ₹20,000");
        // Paise are printed, because this is the figure the wallet will record.
        expect(revenue.getByText("₹1,500.50")).toBeInTheDocument();
        // Null is all time, which is not zero days.
        expect(revenue.getByText("All time")).toBeInTheDocument();
        expect(revenue.getByText("2 milestones")).toBeInTheDocument();
        expect(revenue.getByText("1 Oct 2026")).toBeInTheDocument();
    });

    it("shows nothing it cannot vouch for: no audience, no enrolled or completed count", async () => {
        await mount();
        expect(screen.queryByText(/Audience/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Enrolled/)).not.toBeInTheDocument();
        expect(screen.queryByText(/agents enrolled/)).not.toBeInTheDocument();
    });

    it("opens the editor when a row is clicked", async () => {
        await mount();
        fireEvent.click(screen.getByText("Onboard 10 publishers"));
        expect(router.push).toHaveBeenCalledWith("/growth/tpl_onboard");
    });
});

describe("the Active switch", () => {
    it("moves at once, PATCHes isActive, and says so only once the server answered", async () => {
        const { onChanged } = await mount();
        const toggle = rowOf("Onboard 10 publishers").getByRole("switch");
        expect(toggle).toHaveAttribute("aria-checked", "true");

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-checked", "false");
        expect(toast.success).not.toHaveBeenCalled();

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toContainEqual({
            method: "PATCH",
            path: "/milestones/templates/tpl_onboard",
            body: { isActive: false },
        });
        expect(toast.success).toHaveBeenCalledTimes(1);
        expect(toast.success.mock.calls[0][0]).toBe("Onboard 10 publishers switched off");
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("moves back when the server refuses, and does not claim a save that did not happen", async () => {
        backend.refusePatch = true;
        const { onChanged } = await mount();
        const toggle = rowOf("Onboard 10 publishers").getByRole("switch");

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-checked", "false");

        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        expect(toggle).toHaveAttribute("aria-checked", "true");
        expect(toast.success).not.toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });
});

describe("New milestone", () => {
    it("creates something: POSTs the template with the reward as a string and inactive by default", async () => {
        const { onChanged } = await mount();
        fireEvent.click(screen.getByRole("button", { name: "New milestone" }));
        const dialog = within(await screen.findByRole("dialog"));

        // Off by default: the board materialises a row per active template
        // on every read, so a template must be checked before it goes live.
        expect(dialog.getByRole("switch")).toHaveAttribute("aria-checked", "false");
        // The next free slot after the two that exist.
        expect(dialog.getByLabelText("Order")).toHaveValue(3);

        fireEvent.change(dialog.getByLabelText("Title"), { target: { value: "Verify 15 sites" } });
        fireEvent.change(dialog.getByLabelText("Description"), { target: { value: "Fifteen accepted verifications." } });
        fireEvent.change(dialog.getByLabelText("Target"), { target: { value: "15" } });
        fireEvent.change(dialog.getByLabelText("Reward (₹)"), { target: { value: "2500" } });
        // Optional fields carry the "optional" marker inside their label.
        fireEvent.change(dialog.getByLabelText(/^Window \(days\)/), { target: { value: "45" } });
        fireEvent.change(dialog.getByLabelText(/^Unlock after/), { target: { value: "1" } });
        fireEvent.click(dialog.getByRole("button", { name: "Create milestone" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((call) => call.method === "POST");
        expect(post?.path).toBe("/milestones/templates");
        expect(post?.body).toEqual({
            type: "ONBOARDING",
            title: "Verify 15 sites",
            description: "Fifteen accepted verifications.",
            target: 15,
            rewardAmount: "2500",
            sortOrder: 3,
            isActive: false,
            windowDays: 45,
            startsAt: null,
            unlockAfter: 1,
        });
        expect(typeof (post?.body as { rewardAmount: unknown }).rewardAmount).toBe("string");
        expect(toast.success).toHaveBeenCalledTimes(1);
        expect(toast.success.mock.calls[0][0]).toBe("Verify 15 sites created");
    });

    it("will not send a reward the schema would refuse", async () => {
        await mount();
        fireEvent.click(screen.getByRole("button", { name: "New milestone" }));
        const dialog = within(await screen.findByRole("dialog"));

        fireEvent.change(dialog.getByLabelText("Title"), { target: { value: "Verify 15 sites" } });
        fireEvent.change(dialog.getByLabelText("Description"), { target: { value: "Fifteen." } });
        fireEvent.change(dialog.getByLabelText("Target"), { target: { value: "15" } });
        fireEvent.change(dialog.getByLabelText("Reward (₹)"), { target: { value: "2,500" } });

        expect(dialog.getByRole("button", { name: "Create milestone" })).toBeDisabled();
        expect(dialog.getByText(/Digits, with up to two decimal places/)).toBeInTheDocument();
        expect(backend.calls.some((call) => call.method === "POST")).toBe(false);
    });
});
