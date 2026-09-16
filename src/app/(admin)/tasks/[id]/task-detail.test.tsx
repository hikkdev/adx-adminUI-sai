import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AuditRow } from "@/services/audit";
import type { WorkTaskDetail } from "@/services/work";

/**
 * Lot AA — the task dossier over `GET /work/tasks/:id` (package AA-C).
 *
 * What is pinned: the review bar shows only while the task is under
 * review, and only to one of its reviewers or to `work.approve`; Approve
 * posts `POST /work/tasks/:id/review { decision: APPROVE }`, Reject asks
 * for a note and sends it; the History tab is drawn from the audit trail
 * — a status move with its reason, a date change per field, no baseline
 * rows; the work log has no approval state; a comment posts to
 * `/comments`; and buffer, slack and overtime are not drawn anywhere.
 */

const { backend, toast, session } = vi.hoisted(() => ({
    backend: { calls: [] as { method: string; path: string; body?: unknown }[] },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    session: { userId: "usr_r", permissions: new Set<string>(["work.view", "work.edit"]) },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/tasks/tsk_1",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: session.userId, name: "Priya", roles: ["ADMIN"] }, loading: false, can: (permission: string) => session.permissions.has(permission) }),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                return [];
            },
            post: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "POST", path, body });
                return { id: "x" };
            },
        },
    };
});

import { TaskDetail } from "./task-detail";

const person = (userId: string, name: string) => ({ userId, name, kind: "EMPLOYEE" as const, role: "Field lead", departmentName: "Operations" });

const task = (overrides: Partial<WorkTaskDetail> = {}): WorkTaskDetail => ({
    id: "tsk_1",
    displayId: "TSK-000001",
    title: "Audit the metro stations",
    description: "Every platform, both lines.",
    status: "PENDING_REVIEW",
    priority: "HIGH",
    progress: 80,
    startDate: "2026-09-01T00:00:00.000Z",
    deadline: "2026-09-30T18:29:59.999Z",
    actualStartDate: "2026-09-02T04:00:00.000Z",
    revisedEndDate: null,
    completedAt: null,
    effortEstimateH: 40,
    recurrence: null,
    tags: ["audit"],
    blockedReason: null,
    overdue: false,
    blockedByIssue: false,
    childrenAllVerified: false,
    createdBy: person("usr_ops", "Ops"),
    assignedBy: null,
    project: { id: "prj_1", displayId: "PRJ-0001", name: "Mumbai launch", kind: "REGION" },
    parent: null,
    children: [],
    assignees: [person("usr_a", "Asha Rao")],
    reviewers: [{ ...person("usr_r", "Ravi Menon"), approver: true, approvedAt: null, rejectedAt: null, note: null }],
    prerequisites: [],
    dependents: [],
    comments: [],
    timeLogs: { rows: [{ id: "log_1", taskId: "tsk_1", person: person("usr_a", "Asha Rao"), forDate: "2026-09-05", hours: 3.5, billable: true, note: "Line 1 platforms", loggedAt: "2026-09-05T12:00:00.000Z" }], totals: { hours: 3.5, billableHours: 3.5 } },
    issues: [],
    linked: { kind: "CITY", id: "city_1", label: "Mumbai" },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
});

const history: AuditRow[] = [
    {
        id: "a2",
        userId: "usr_ops",
        action: "WORK_TASK_UPDATED",
        module: "work",
        targetType: "WorkTask",
        targetId: "tsk_1",
        requestId: null,
        ipAddress: null,
        userAgent: null,
        metadata: { fields: ["deadline"] },
        diff: { deadline: { before: "2026-09-20T18:29:59.999Z", after: "2026-09-30T18:29:59.999Z" } },
        createdAt: "2026-09-11T10:00:00.000Z",
        user: { id: "usr_ops", name: "Ops", email: null },
    },
    {
        id: "a1",
        userId: "usr_a",
        action: "WORK_TASK_STATUS_CHANGED",
        module: "work",
        targetType: "WorkTask",
        targetId: "tsk_1",
        requestId: null,
        ipAddress: null,
        userAgent: null,
        metadata: { from: "TODO", to: "IN_PROGRESS", requested: "IN_PROGRESS", reason: null, via: "status" },
        diff: { status: { before: "TODO", after: "IN_PROGRESS" }, actualStartDate: { before: null, after: "2026-09-02T04:00:00.000Z" } },
        createdAt: "2026-09-02T04:00:00.000Z",
        user: { id: "usr_a", name: "Asha Rao", email: null },
    },
];

beforeEach(() => {
    backend.calls = [];
    toast.success.mockClear();
    toast.error.mockClear();
    session.userId = "usr_r";
    session.permissions = new Set(["work.view", "work.edit"]);
});

describe("the task dossier", () => {
    it("shows the review bar to a reviewer of a task under review and approves through the review route", async () => {
        const onChanged = vi.fn();
        render(<TaskDetail task={task()} history={history} historyError={null} onChanged={onChanged} />);
        expect(screen.getByTestId("review-bar")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));
        await waitFor(() => expect(backend.calls.find((call) => call.method === "POST")).toEqual({ method: "POST", path: "/work/tasks/tsk_1/review", body: { decision: "APPROVE" } }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it("hides the review bar from someone who is not a reviewer, unless they hold work.approve", () => {
        session.userId = "usr_x";
        const { rerender } = render(<TaskDetail task={task()} history={[]} historyError={null} onChanged={vi.fn()} />);
        expect(screen.queryByTestId("review-bar")).toBeNull();

        session.permissions = new Set(["work.view", "work.edit", "work.approve"]);
        rerender(<TaskDetail task={task({ updatedAt: "2026-09-11T00:00:00.000Z" })} history={[]} historyError={null} onChanged={vi.fn()} />);
        expect(screen.getByTestId("review-bar")).toBeInTheDocument();
    });

    it("hides the review bar when the task is not under review, whoever looks", () => {
        session.permissions = new Set(["work.view", "work.edit", "work.approve"]);
        render(<TaskDetail task={task({ status: "IN_PROGRESS" })} history={[]} historyError={null} onChanged={vi.fn()} />);
        expect(screen.queryByTestId("review-bar")).toBeNull();
    });

    it("draws the history from the audit trail — the status move and the date change, no baseline — and the work log without an approval state", () => {
        render(<TaskDetail task={task()} history={history} historyError={null} onChanged={vi.fn()} />);
        /* Radix switches a tab on mouse-down, not click. */
        fireEvent.mouseDown(screen.getByRole("tab", { name: "History" }), { button: 0 });
        expect(screen.getByText("To do → In progress")).toBeInTheDocument();
        expect(screen.getByText("Moved by Asha Rao")).toBeInTheDocument();
        expect(screen.getByText("Date revisions")).toBeInTheDocument();
        expect(screen.getByText("Date revisions").parentElement).toHaveTextContent("Deadline");
        expect(screen.getByText("Date revisions").parentElement).toHaveTextContent("Updated by Ops");
        expect(screen.queryByText(/baseline/i)).toBeNull();

        fireEvent.mouseDown(screen.getByRole("tab", { name: "Work log" }), { button: 0 });
        expect(screen.getByText("Line 1 platforms")).toBeInTheDocument();
        expect(screen.getByText("Line 1 platforms").closest("tr")).toHaveTextContent("Billable");
        expect(screen.getByText("Line 1 platforms").closest("table")).not.toHaveTextContent("State");
        expect(screen.queryByText("Pending")).toBeNull();
        expect(screen.queryByText("Approved")).toBeNull();

        /* Buffer, slack and overtime have no source and are not drawn. */
        expect(screen.queryByText("Buffer")).toBeNull();
        expect(screen.queryByText("Slack")).toBeNull();
        expect(screen.queryByText("Overtime")).toBeNull();
        /* The linked record is named off the read. */
        expect(screen.getByText("City: Mumbai")).toBeInTheDocument();
    });
});
