import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Which Digio workflow an employee uses — Phase D (the owner, 1 Oct 2026).
 *
 * An employee has no entity type: the workflow follows the employment
 * type on the HR record. What is pinned: the queue row and the record
 * sheet both say "Employee: Full Time" for full time, part time or none
 * set and "Employee: Intern and Contract" for contract and intern; an
 * employee whose employment type no read said prints nothing rather than
 * a guess; the loader joins the HR roster's employment types to the queue;
 * and an employee's one click is unchanged — no body, no picker.
 */

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/kyc/employees",
    useSearchParams: () => new URLSearchParams(router.search),
    notFound: () => {
        throw new Error("not found");
    },
}));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true }),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

const backend = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    queue: [] as unknown[],
    roster: [] as unknown[],
    reset() {
        this.calls = [];
        this.queue = [];
        this.roster = [];
    },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            getEnvelope: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                return { data: backend.queue, meta: { total: backend.queue.length, counts: {} } };
            },
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                return { items: backend.roster, total: backend.roster.length, page: 1, pageSize: 100, counts: {} };
            },
            post: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "POST", path, body });
                return { kyc: {}, digio: { kycId: "dg_1", validTill: "2026-10-02T00:00:00.000Z" }, notified: true };
            },
        },
    };
});

import { shapeEmployeeKycQueueRow, type EmployeeKycQueueRow, type EmployeeSummary, type WireEmployeeKycQueueRow } from "@/services/employee-kyc";
import { shapeKycStateCounts } from "@/services/kyc-state";
import { EmployeeKycLoader } from "./employee-kyc-loader";
import { EmployeeKycQueue } from "./employee-kyc-queue";
import { EmployeeKycRecord } from "./[employeeId]/employee-kyc-record";

beforeEach(() => {
    backend.reset();
    router.push.mockReset();
    router.replace.mockReset();
    router.search = "";
});

/** A queue row for an employee with nothing recorded — the party alone, as `GET /employee-kyc` sends it. */
const wire = (employeeId: string, name: string): WireEmployeeKycQueueRow =>
    ({
        id: employeeId,
        employeeId,
        kycId: null,
        state: "AWAITING_DOCUMENTS",
        status: null,
        submittedAt: null,
        employee: { id: employeeId, userId: `usr_${employeeId}`, displayId: null, department: "Ops", designation: "Analyst", createdAt: "2026-09-14T15:00:00.000Z", user: { name, mobile: "9800000001", email: null } },
    }) as unknown as WireEmployeeKycQueueRow;

const rosterRow = (id: string, employmentType?: string | null) => ({
    id,
    userId: `usr_${id}`,
    displayId: null,
    department: "Ops",
    designation: "Analyst",
    isActive: true,
    ...(employmentType === undefined ? {} : { employmentType }),
    user: { id: `usr_${id}`, name: id, mobile: "9800000001", email: null },
});

const row = (employeeId: string, name: string, employmentType?: EmployeeKycQueueRow["employmentType"]): EmployeeKycQueueRow => ({ ...shapeEmployeeKycQueueRow(wire(employeeId, name)), employmentType });

const cellOf = (name: string) => within(screen.getByText(name).closest("tr")!).getByTestId("employee-workflow");

describe("the employee KYC queue", () => {
    it("says which Digio workflow each employee's employment type uses, and nothing where no read said it", () => {
        const rows = [row("emp_1", "Asha Full", "FULL_TIME"), row("emp_2", "Bina Part", "PART_TIME"), row("emp_3", "Chitra Unset", null), row("emp_4", "Dev Contract", "CONTRACT"), row("emp_5", "Esha Intern", "INTERN"), row("emp_6", "Farid Unknown")];
        const queue = { rows, total: rows.length, counts: shapeKycStateCounts(null) };
        render(<EmployeeKycQueue loaded={{ everything: queue, visible: queue }} chip="all" onChip={() => {}} live onChanged={() => {}} />);

        expect(screen.getByRole("columnheader", { name: "Digio workflow" })).toBeInTheDocument();
        expect(cellOf("Asha Full")).toHaveTextContent("Employee: Full Time");
        expect(cellOf("Bina Part")).toHaveTextContent("Employee: Full Time");
        expect(cellOf("Chitra Unset")).toHaveTextContent("Employee: Full Time");
        expect(cellOf("Dev Contract")).toHaveTextContent("Employee: Intern and Contract");
        expect(cellOf("Esha Intern")).toHaveTextContent("Employee: Intern and Contract");
        expect(cellOf("Farid Unknown")).toHaveTextContent("—");
    });

    it("an employee's one click is unchanged: no body, and no entity type is asked", async () => {
        const onChanged = vi.fn();
        const rows = [row("emp_4", "Dev Contract", "CONTRACT")];
        const queue = { rows, total: 1, counts: shapeKycStateCounts(null) };
        render(<EmployeeKycQueue loaded={{ everything: queue, visible: queue }} chip="all" onChip={() => {}} live onChanged={onChanged} />);
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/employee-kyc/emp_4/request", body: undefined }]);
        expect(screen.queryByTestId("entity-type-picker")).not.toBeInTheDocument();
    });

    it("the loader joins the HR roster's employment types to the queue rows by HR id", async () => {
        backend.queue = [wire("emp_1", "Asha Full"), wire("emp_4", "Dev Contract"), wire("emp_6", "Farid Unknown")];
        // The roster knows the first two; the third is not on the page it read.
        backend.roster = [rosterRow("emp_1", null), rosterRow("emp_4", "CONTRACT")];
        render(<EmployeeKycLoader />);
        await waitFor(() => expect(screen.getByText("Dev Contract")).toBeInTheDocument());
        expect(cellOf("Asha Full")).toHaveTextContent("Employee: Full Time");
        expect(cellOf("Dev Contract")).toHaveTextContent("Employee: Intern and Contract");
        expect(cellOf("Farid Unknown")).toHaveTextContent("—");
        expect(backend.calls.map((call) => call.path)).toContain("/employees?page=1&pageSize=100");
    });
});

describe("the employee KYC record", () => {
    const employee = (employmentType?: EmployeeSummary["employmentType"]): EmployeeSummary => ({
        id: "emp_1",
        userId: "usr_1",
        name: "Asha Rao",
        displayId: "EMP-1209-2601",
        department: "Ops",
        designation: "Analyst",
        mobile: "9800000001",
        email: null,
        isActive: true,
        employmentType,
    });

    it("names the workflow under the header, by employment type", () => {
        const { unmount } = render(<EmployeeKycRecord employee={employee("INTERN")} kyc={null} live onChanged={() => {}} />);
        expect(screen.getByTestId("employee-workflow")).toHaveTextContent("Digio workflow: Employee: Intern and Contract");
        unmount();

        render(<EmployeeKycRecord employee={employee(null)} kyc={null} live onChanged={() => {}} />);
        expect(screen.getByTestId("employee-workflow")).toHaveTextContent("Digio workflow: Employee: Full Time");
    });

    it("says nothing when no read said how the employee is employed", () => {
        render(<EmployeeKycRecord employee={employee()} kyc={null} live onChanged={() => {}} />);
        expect(screen.queryByTestId("employee-workflow")).not.toBeInTheDocument();
    });
});
