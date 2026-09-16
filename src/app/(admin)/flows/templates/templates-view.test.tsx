import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * D9 — /flows/templates, live.
 *
 * The Active switch used to change local state and show a toast; reload and
 * the template was back. What this pins is the write actually going to the
 * API and the two honest behaviours around it: the switch moves at once and
 * moves back when the server refuses, and the toast is said only once the
 * write landed. Plus the one editor the screen gained — a plan's steps — and
 * the exact body it PUTs, because the server numbers nothing itself.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refusePatch: false,
        templates: [] as Record<string, unknown>[],
        plans: [] as Record<string, unknown>[],
        reset() {
            this.calls = [];
            this.refusePatch = false;
            this.templates = [
                {
                    id: "tpl_survey",
                    title: "Site survey",
                    type: "SURVEY",
                    description: "Confirm condition before going live.",
                    isActive: true,
                    requirements: [
                        { kind: "location_checkin" },
                        { kind: "photo", label: "Wide angle shot" },
                        { kind: "photo", label: "Context shot", optional: true },
                    ],
                    estimatedDurationMins: 25,
                    createdAt: "2026-08-01T04:30:00.000Z",
                    updatedAt: "2026-09-01T04:30:00.000Z",
                },
                {
                    id: "tpl_install",
                    title: "Installation",
                    type: "INSTALLATION",
                    description: null,
                    isActive: true,
                    requirements: [{ kind: "qr_scan" }],
                    estimatedDurationMins: null,
                    createdAt: "2026-08-01T04:30:00.000Z",
                    updatedAt: "2026-09-01T04:30:00.000Z",
                },
            ];
            this.plans = [
                {
                    id: "pln_standard",
                    name: "Standard hoarding campaign",
                    description: null,
                    isActive: true,
                    items: [
                        { id: "pi_1", planId: "pln_standard", templateId: "tpl_survey", order: 1, isOptional: false, template: this.templates[0] },
                        { id: "pi_2", planId: "pln_standard", templateId: "tpl_install", order: 2, isOptional: true, template: this.templates[1] },
                    ],
                },
            ];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path === "/milestone-templates") return this.templates;
            if (method === "GET" && path === "/milestone-plans") return this.plans;
            const patch = path.match(/^\/milestone-templates\/([^/]+)$/);
            if (method === "PATCH" && patch) {
                if (this.refusePatch) throw new Error("Milestone template not found");
                const row = this.templates.find((template) => template.id === patch[1])!;
                Object.assign(row, body as object);
                return row;
            }
            const items = path.match(/^\/milestone-plans\/([^/]+)\/items$/);
            if (method === "PUT" && items) {
                const plan = this.plans.find((candidate) => candidate.id === items[1])!;
                const sent = (body as { items: { templateId: string; order: number; isOptional: boolean }[] }).items;
                plan.items = sent.map((item, index) => ({
                    id: `pi_${index}`,
                    planId: plan.id,
                    templateId: item.templateId,
                    order: item.order,
                    isOptional: item.isOptional,
                    template: this.templates.find((template) => template.id === item.templateId) ?? null,
                }));
                return plan;
            }
            throw new Error(`No route ${method} ${path}`);
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    // `isLive` closes over the module's own `apiConfig`, so it is replaced
    // too rather than left reading the unmocked flag.
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

import { milestoneService } from "@/services/milestones";
import { TemplatesView } from "./templates-view";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

async function mount() {
    const [templates, plans] = await Promise.all([milestoneService.allTemplates(), milestoneService.plans()]);
    const onChanged = vi.fn();
    render(<TemplatesView templates={templates} plans={plans} onChanged={onChanged} />);
    return { onChanged };
}

const card = (title: string) => within(screen.getByRole("heading", { name: title }).closest(".flex-col")!);

describe("what the screen draws", () => {
    it("draws the live templates: the parsed proofs, the optional marker, and no estimate as no estimate", async () => {
        await mount();
        const survey = card("Site survey");
        expect(survey.getByText("about 25 min on site")).toBeInTheDocument();
        expect(survey.getByText(/Photo: Context shot/)).toBeInTheDocument();
        expect(survey.getByText("(optional)")).toBeInTheDocument();
        expect(survey.getByText("Location check-in")).toBeInTheDocument();

        const install = card("Installation");
        // Null is unestimated, which is not "about 0 min".
        expect(install.getByText("no estimate")).toBeInTheDocument();
        expect(install.getByText("QR scan")).toBeInTheDocument();
    });

    it("names a plan's steps from the joined template, in order", async () => {
        await mount();
        const plan = within(screen.getByRole("heading", { name: "Standard hoarding campaign" }).closest(".rounded-lg")!);
        const chips = plan.getAllByText(/Site survey|Installation/);
        // Each chip carries its number, the joined title and, where set, the
        // optional marker — nothing invented, and the id never shows.
        expect(chips.map((chip) => chip.textContent)).toEqual(["1Site survey", "2Installation(optional)"]);
        expect(plan.queryByText(/tpl_/)).not.toBeInTheDocument();
    });
});

describe("the Active switch", () => {
    it("moves at once, PATCHes isActive, and says so only once the server answered", async () => {
        const { onChanged } = await mount();
        const toggle = card("Site survey").getByRole("switch");
        expect(toggle).toHaveAttribute("aria-checked", "true");

        fireEvent.click(toggle);
        // Optimistic: the switch has already moved.
        expect(toggle).toHaveAttribute("aria-checked", "false");
        expect(toast.success).not.toHaveBeenCalled();

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toContainEqual({
            method: "PATCH",
            path: "/milestone-templates/tpl_survey",
            body: { isActive: false },
        });
        expect(toast.success).toHaveBeenCalledTimes(1);
        expect(toast.success.mock.calls[0][0]).toBe("Site survey deactivated");
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("moves back when the server refuses, and does not claim a save that did not happen", async () => {
        backend.refusePatch = true;
        const { onChanged } = await mount();
        const toggle = card("Site survey").getByRole("switch");

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-checked", "false");

        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        expect(toggle).toHaveAttribute("aria-checked", "true");
        expect(toast.success).not.toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });
});

describe("editing a plan's steps", () => {
    it("PUTs the chain numbered from one in the order shown, after a move", async () => {
        const { onChanged } = await mount();
        fireEvent.click(screen.getByRole("button", { name: "Edit steps" }));
        const dialog = within(await screen.findByRole("dialog"));

        // Installation is second; move it up so it runs first.
        fireEvent.click(dialog.getAllByRole("button", { name: "Move up" })[1]);
        fireEvent.click(dialog.getByRole("button", { name: "Save steps" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        const put = backend.calls.find((call) => call.method === "PUT");
        expect(put?.path).toBe("/milestone-plans/pln_standard/items");
        expect(put?.body).toEqual({
            items: [
                { templateId: "tpl_install", order: 1, isOptional: true },
                { templateId: "tpl_survey", order: 2, isOptional: false },
            ],
        });
        expect(toast.success).toHaveBeenCalledWith("Standard hoarding campaign now has 2 steps");
    });

    it("will not save an empty chain — the server refuses one", async () => {
        await mount();
        fireEvent.click(screen.getByRole("button", { name: "Edit steps" }));
        const dialog = within(await screen.findByRole("dialog"));

        for (const remove of dialog.getAllByRole("button", { name: "Remove this step" })) fireEvent.click(remove);
        expect(dialog.getByText(/the server refuses an empty plan/)).toBeInTheDocument();
        expect(dialog.getByRole("button", { name: "Save steps" })).toBeDisabled();
        expect(backend.calls.some((call) => call.method === "PUT")).toBe(false);
    });
});
