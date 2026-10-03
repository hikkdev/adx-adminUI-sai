import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The agent's Compensation card and its dialog (2 Oct 2026).
 *
 * What is pinned: the card's four states (unreadable, no pay on record,
 * pay in force, and the earlier records greyed with their dates); the
 * header button reads "Set compensation" before there is a record and
 * "Change pay" after, and is gone without finance.edit; the dialog fills
 * from the grade's defaults (`GET /agents/compensation/defaults`) when there
 * is no record and from the record when there is, shows the derived figures
 * live, carries a "Starts on" date, refuses a figure out of bounds, and
 * posts what it shows.
 */

const { backend, perms, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (method === "GET" && path.startsWith("/agents/compensation/defaults")) {
                return {
                    grade: "G2",
                    monthlySalary: "25000.00",
                    dailyQuota: 10,
                    workingDaysPerMonth: 26,
                    commissionUpliftPct: "10.00",
                    plannedUnitCost: "96.15",
                    commissionPerExtra: "105.77",
                    plannedPerMonth: 260,
                };
            }
            if (method === "POST" && path === "/agents/agt_1/compensation") {
                const sent = body as { monthlySalary: string; dailyQuota: number };
                return { ...CURRENT, id: "comp_new", monthlySalary: sent.monthlySalary, dailyQuota: sent.dailyQuota };
            }
            throw new Error(`No route ${method} ${path}`);
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = (method: string) => (path: string, body?: unknown) => backend.handle(method, path, body);
    return { ...actual, api: { get: wrap("GET"), post: wrap("POST"), patch: wrap("PATCH"), put: wrap("PUT"), delete: wrap("DELETE") } };
});

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: (id: string) => perms.held.has(id), user: null }) }));

import type { AgentCompensation, AgentCompensationHistory, AgentStanding } from "@/services/agents";
import { AgentCompensationCard } from "./agent-compensation-card";

const CURRENT: AgentCompensation = {
    id: "comp_2",
    agentId: "agt_1",
    monthlySalary: "25000.00",
    dailyQuota: 10,
    workingDaysPerMonth: 26,
    commissionUpliftPct: "10.00",
    plannedUnitCost: "96.15",
    commissionPerExtra: "105.77",
    plannedPerMonth: 260,
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: null,
    note: null,
    createdByUserId: "usr_1",
    createdAt: "2026-09-01T00:00:00.000Z",
};

const EARLIER: AgentCompensation = {
    ...CURRENT,
    id: "comp_1",
    monthlySalary: "12000.00",
    plannedUnitCost: "46.15",
    commissionPerExtra: "50.77",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveTo: "2026-09-01T00:00:00.000Z",
};

const STANDING: AgentStanding = {
    agentId: "agt_1",
    day: "2026-10-02",
    month: "2026-10",
    onTheQuotaModel: true,
    dailyQuota: 10,
    doneToday: 4,
    quotaLeftToday: 6,
    doneThisMonth: 50,
    monthlySalary: "25000.00",
    plannedUnitCost: "96.15",
    commissionPerExtra: "105.77",
    salaryPerOnboarding: "500.00",
};

const today = () => new Date().toISOString().slice(0, 10);

function renderCard(compensation: AgentCompensationHistory | null, standing: AgentStanding | null = null) {
    const onChanged = vi.fn();
    render(
        <AgentCompensationCard agentId="agt_1" agentName="Ravi Kumar" grade="G2" compensation={compensation} standing={standing} onChanged={onChanged} />,
    );
    return onChanged;
}

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["finance.view", "finance.edit"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("the compensation card", () => {
    it("says pay could not be read, and offers nothing to set", () => {
        renderCard(null);
        expect(screen.getByTestId("agent-comp-offline")).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("with no pay on record, offers Set compensation at the top right", () => {
        renderCard({ current: null, history: [] });
        expect(screen.getByTestId("agent-comp-none")).toHaveTextContent("Ravi Kumar has no salary on record");
        expect(screen.getByRole("button", { name: "Set compensation" })).toBeInTheDocument();
    });

    it("reads the terms in force in plain words, with the earlier record greyed and dated", () => {
        renderCard({ current: CURRENT, history: [CURRENT, EARLIER] }, STANDING);
        expect(screen.getByRole("button", { name: "Change pay" })).toBeInTheDocument();
        const terms = screen.getByTestId("agent-comp-terms");
        const read = (label: string) => within(terms).getByText(label).nextElementSibling?.textContent;
        expect(read("Monthly salary")).toBe("₹25,000.00");
        expect(read("Daily quota")).toBe("10 onboardings");
        expect(read("Working days a month")).toBe("26");
        expect(read("Commission on extra onboardings")).toBe("10% on top");
        expect(read("Planned cost per onboarding")).toBe("₹96.15");
        expect(read("Pay for each extra onboarding")).toBe("₹105.77");
        expect(screen.getByTestId("agent-comp-in-force")).toHaveTextContent("In force from 1 Sept 2026");
        expect(screen.getByTestId("agent-cost-per-onboarding")).toHaveTextContent("₹500.00");

        const history = screen.getByTestId("agent-comp-history");
        expect(history).toHaveClass("text-muted-foreground");
        expect(within(history).getAllByRole("listitem")).toHaveLength(1);
        expect(history).toHaveTextContent("₹12,000.00 a month · 10 a day over 26 days · 10% on top");
        expect(history).toHaveTextContent("1 Jun 2026 – 1 Sept 2026");
    });

    it("offers no button without finance.edit", () => {
        perms.held = new Set(["finance.view"]);
        renderCard({ current: CURRENT, history: [CURRENT] });
        expect(screen.queryByRole("button", { name: "Change pay" })).toBeNull();
    });
});

describe("the compensation dialog", () => {
    it("sets pay from the grade's defaults, with the derived figures and a start date", async () => {
        const onChanged = renderCard({ current: null, history: [] });
        fireEvent.click(screen.getByRole("button", { name: "Set compensation" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", { name: "Set compensation" })).toBeInTheDocument();
        await waitFor(() => expect(within(dialog).getByLabelText("Monthly salary (₹)")).toHaveValue("25000.00"));
        expect(backend.calls[0]).toEqual({ method: "GET", path: "/agents/compensation/defaults?grade=G2", body: undefined });
        expect(within(dialog).getByLabelText("Daily quota (onboardings)")).toHaveValue("10");
        expect(within(dialog).getByLabelText("Working days a month")).toHaveValue("26");
        expect(within(dialog).getByLabelText("Commission on extra onboardings (%)")).toHaveValue("10.00");
        expect(within(dialog).getByLabelText("Starts on")).toHaveValue(today());
        expect(within(dialog).getByTestId("comp-dialog-description")).toHaveTextContent("Filled in from the G2 · Senior field defaults");
        expect(within(dialog).getByText(/Earnings already made keep the terms they were earned at\./)).toBeInTheDocument();
        expect(within(dialog).getByTestId("comp-preview-unit")).toHaveTextContent("₹96.15");
        expect(within(dialog).getByTestId("comp-preview-extra")).toHaveTextContent("₹105.77");

        fireEvent.change(within(dialog).getByLabelText("Starts on"), { target: { value: "2026-10-05" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Set compensation" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls.find((call) => call.method === "POST")).toEqual({
            method: "POST",
            path: "/agents/agt_1/compensation",
            body: {
                monthlySalary: "25000.00",
                dailyQuota: 10,
                workingDaysPerMonth: 26,
                commissionUpliftPct: "10.00",
                effectiveFrom: "2026-10-05T00:00:00.000Z",
            },
        });
        expect(toast.success).toHaveBeenCalledWith("Pay recorded for Ravi Kumar", expect.anything());
    });

    it("changes pay starting from the record in force, the figures following the typing", async () => {
        renderCard({ current: CURRENT, history: [CURRENT] }, STANDING);
        fireEvent.click(screen.getByRole("button", { name: "Change pay" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", { name: "Change pay" })).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Monthly salary (₹)")).toHaveValue("25000.00");
        expect(within(dialog).getByLabelText("Daily quota (onboardings)")).toHaveValue("10");
        expect(within(dialog).getByLabelText("Starts on")).toHaveValue(today());
        // A record in force: the defaults are never asked for.
        expect(backend.calls).toHaveLength(0);

        fireEvent.change(within(dialog).getByLabelText("Daily quota (onboardings)"), { target: { value: "12" } });
        // ₹25,000 over 12 × 26 = ₹80.13; plus 10% = ₹88.14.
        expect(within(dialog).getByTestId("comp-preview-unit")).toHaveTextContent("₹80.13");
        expect(within(dialog).getByTestId("comp-preview-extra")).toHaveTextContent("₹88.14");

        fireEvent.click(within(dialog).getByRole("button", { name: "Save new pay" }));
        await waitFor(() => expect(backend.calls.some((call) => call.method === "POST")).toBe(true));
        expect(backend.calls.find((call) => call.method === "POST")?.body).toMatchObject({ monthlySalary: "25000.00", dailyQuota: 12, workingDaysPerMonth: 26 });
    });

    it("refuses a quota out of bounds on the pair's own line, and will not save", async () => {
        renderCard({ current: CURRENT, history: [CURRENT] });
        fireEvent.click(screen.getByRole("button", { name: "Change pay" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Daily quota (onboardings)"), { target: { value: "0" } });
        expect(within(dialog).getByText("The daily quota is a whole number from 1 to 100.")).toBeInTheDocument();
        fireEvent.change(within(dialog).getByLabelText("Daily quota (onboardings)"), { target: { value: "10" } });
        fireEvent.change(within(dialog).getByLabelText("Commission on extra onboardings (%)"), { target: { value: "250" } });
        expect(within(dialog).getByText("The commission is 0% to 200% on top.")).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Save new pay" })).toBeDisabled();
    });
});
