import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Finance › Settings › Agent pay by grade (2 Oct 2026).
 *
 * What is pinned: the four grades read with their names and the two derived
 * figures (computed as the agent's own pay card computes them); Edit turns
 * the inputs on and the figures follow the typing; a figure outside the
 * server's bounds is named on the one line under the table and stops Save;
 * Save sends only `{ agents: { compensation } }` with the leaves that moved;
 * Cancel puts every figure back; and without settings.edit there is no Edit.
 */

const { backend, perms, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            return {};
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

import type { AgentPayDefaults } from "@/services/settings";
import { AgentPayByGrade } from "./agent-pay-by-grade";

/* The platform's seeded defaults. */
const PAY: AgentPayDefaults = {
    commissionUpliftPct: 10,
    byGrade: {
        G1: { monthlySalary: 12000, dailyQuota: 10, workingDaysPerMonth: 26 },
        G2: { monthlySalary: 25000, dailyQuota: 10, workingDaysPerMonth: 26 },
        G3: { monthlySalary: 25000, dailyQuota: 12, workingDaysPerMonth: 22 },
        G4: { monthlySalary: 25000, dailyQuota: 10, workingDaysPerMonth: 22 },
    },
};

function renderCard(props: { pay?: AgentPayDefaults | null; mayEdit?: boolean } = {}) {
    const onChanged = vi.fn();
    render(<AgentPayByGrade pay={props.pay === undefined ? PAY : props.pay} mayEdit={props.mayEdit ?? true} onChanged={onChanged} />);
    return onChanged;
}

const cell = (name: string) => screen.getByRole("textbox", { name });

beforeEach(() => {
    backend.reset();
    perms.held = new Set(["settings.edit"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("Agent pay by grade", () => {
    it("reads each grade by name with its terms and the derived figures, inputs off", () => {
        renderCard();
        expect(screen.getByText("Agent pay by grade")).toBeInTheDocument();
        expect(screen.getByText(/Changing these doesn't change anyone's current pay/)).toBeInTheDocument();
        for (const name of ["G1 · Field", "G2 · Senior field", "G3 · Key accounts", "G4 · Enterprise"]) {
            expect(screen.getByText(name)).toBeInTheDocument();
        }
        expect(cell("G1 · Field monthly salary")).toHaveValue("12000");
        expect(cell("G1 · Field monthly salary")).toBeDisabled();
        expect(cell("G3 · Key accounts daily quota")).toHaveValue("12");
        expect(cell("G3 · Key accounts working days a month")).toHaveValue("22");
        // ₹12,000 over 10 × 26 = ₹46.15; plus 10% = ₹50.77.
        expect(screen.getByTestId("pay-unit-G1")).toHaveTextContent("₹46.15");
        expect(screen.getByTestId("pay-extra-G1")).toHaveTextContent("₹50.77");
        // ₹25,000 over 12 × 22 = ₹94.70; plus 10% = ₹104.17.
        expect(screen.getByTestId("pay-unit-G3")).toHaveTextContent("₹94.70");
        expect(screen.getByTestId("pay-extra-G3")).toHaveTextContent("₹104.17");
        expect(screen.getByLabelText("Commission on extra onboardings (% on top)")).toHaveValue("10");
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    });

    it("turns the inputs on with Edit, follows the typing, and saves only what moved", async () => {
        const onChanged = renderCard();
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        expect(cell("G2 · Senior field monthly salary")).toBeEnabled();
        // Nothing moved yet: nothing to save.
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        fireEvent.change(cell("G2 · Senior field monthly salary"), { target: { value: "30000" } });
        // ₹30,000 over 260 = ₹115.38; plus 10% = ₹126.92.
        expect(screen.getByTestId("pay-unit-G2")).toHaveTextContent("₹115.38");
        expect(screen.getByTestId("pay-extra-G2")).toHaveTextContent("₹126.92");
        fireEvent.change(screen.getByLabelText("Commission on extra onboardings (% on top)"), { target: { value: "15" } });

        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([
            {
                method: "PUT",
                path: "/settings/platform",
                body: { agents: { compensation: { commissionUpliftPct: 15, byGrade: { G2: { monthlySalary: 30000 } } } } },
            },
        ]);
        expect(toast.success).toHaveBeenCalledWith("Agent pay by grade saved", expect.anything());
        // Back to reading.
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    });

    it.each([
        ["G1 · Field daily quota", "0", "G1: A daily quota is a whole number from 1 to 100."],
        ["G4 · Enterprise working days a month", "32", "G4: Working days a month is a whole number from 1 to 31."],
        ["G2 · Senior field monthly salary", "10000001", "G2: A monthly salary is a rupee amount from ₹0 to ₹1,00,00,000."],
    ])("refuses %s = %s on the line under the table", (name, value, message) => {
        renderCard();
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.change(cell(name), { target: { value } });
        expect(screen.getByTestId("agent-pay-line")).toHaveTextContent(message);
        expect(cell(name)).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("refuses a commission above 200%", () => {
        renderCard();
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.change(screen.getByLabelText("Commission on extra onboardings (% on top)"), { target: { value: "201" } });
        expect(screen.getByTestId("agent-pay-line")).toHaveTextContent("The commission on extra onboardings is 0% to 200% on top.");
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("puts every figure back on Cancel and sends nothing", () => {
        renderCard();
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.change(cell("G1 · Field monthly salary"), { target: { value: "99999" } });
        fireEvent.change(cell("G1 · Field daily quota"), { target: { value: "0" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(cell("G1 · Field monthly salary")).toHaveValue("12000");
        expect(cell("G1 · Field monthly salary")).toBeDisabled();
        expect(cell("G1 · Field daily quota")).toHaveValue("10");
        expect(screen.getByTestId("pay-unit-G1")).toHaveTextContent("₹46.15");
        expect(backend.calls).toHaveLength(0);
    });

    it("offers no Edit without permission to change platform settings", () => {
        renderCard({ mayEdit: false });
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
        expect(within(screen.getByTestId("agent-pay-by-grade")).getAllByRole("textbox").every((input) => (input as HTMLInputElement).disabled)).toBe(true);
    });

    it("says so when the settings could not be read", () => {
        renderCard({ pay: null });
        expect(screen.getByTestId("agent-pay-unavailable")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    });
});
