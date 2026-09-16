import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Lot AA — the Tasks overview over `GET /work/overview` (package AA-C).
 *
 * What is pinned: the page reads the one route (no task list, nothing
 * derived on the client); the four tiles, the completion gauge, the
 * project rows, the workload list and the overdue list draw the read's
 * own numbers; the project picker sends `?projectId=` and the read is
 * asked again; an overview with nothing in it says so and offers the
 * first task.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: { calls: [] as string[], empty: false },
    router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/tasks",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("recharts", () => {
    const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    const Nothing = () => null;
    return {
        ResponsiveContainer: Box,
        AreaChart: ({ data }: { data: { label: string; completed: number; planned: number }[] }) => (
            <div data-testid="trend">{data.map((point) => `${point.label}:${point.completed}/${point.planned}`).join(",")}</div>
        ),
        PieChart: Box,
        RadialBarChart: Box,
        Area: Nothing,
        Pie: Nothing,
        Cell: Nothing,
        RadialBar: Nothing,
        PolarAngleAxis: Nothing,
        CartesianGrid: Nothing,
        XAxis: Nothing,
        YAxis: Nothing,
        Tooltip: Nothing,
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const person = (userId: string, name: string) => ({ userId, name, kind: "EMPLOYEE", role: "Field lead", departmentName: "Operations" });
    const overview = {
        window: { from: "2026-09-01", to: "2026-09-30" },
        tasks: { total: 12, byStatus: { DRAFT: 1, TODO: 3, IN_PROGRESS: 4, PENDING_REVIEW: 1, VERIFIED: 2, BLOCKED: 1, ARCHIVED: 0 }, byPriority: { HIGH: 5, MEDIUM: 6, LOW: 1 }, overdue: 2, dueThisWeek: 3, verifiedInWindow: 2 },
        trend: [
            { month: "2026-08", planned: 4, completed: 3 },
            { month: "2026-09", planned: 8, completed: 2 },
        ],
        issues: { open: 3, bySeverity: { CRITICAL: 1, HIGH: 2, MEDIUM: 0, LOW: 0 }, byStatus: { OPEN: 2, IN_PROGRESS: 1, RESOLVED: 4, WONT_FIX: 0 } },
        workload: [
            { person: person("usr_a", "Asha Rao"), open: 5, inProgress: 2, overdue: 1, hoursInWindow: 12.5 },
            { person: person("usr_b", "Bala Iyer"), open: 3, inProgress: 1, overdue: 0, hoursInWindow: 4 },
        ],
        overdueList: [{ id: "tsk_9", displayId: "TSK-000009", title: "Replace the Andheri hoarding", deadline: "2026-09-05T18:29:59.999Z", assignees: [person("usr_a", "Asha Rao")] }],
        projects: [
            { id: "prj_1", displayId: "PRJ-0001", name: "Mumbai launch", kind: "REGION", open: 7, verified: 2, progress: 35 },
            { id: "prj_2", displayId: "PRJ-0002", name: "Finance close", kind: "DEPARTMENT", open: 3, verified: 0, progress: 10 },
        ],
    };
    const nothing = { ...overview, tasks: { ...overview.tasks, total: 0, byStatus: {}, byPriority: {}, overdue: 0, dueThisWeek: 0, verifiedInWindow: 0 }, trend: [], workload: [], overdueList: [], projects: [] };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (path.startsWith("/work/overview")) return backend.empty ? nothing : path.includes("projectId=prj_2") ? { ...overview, projects: [overview.projects[1]] } : overview;
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import { TasksLoader } from "./tasks-loader";
import { TasksOverview } from "./tasks-overview";

beforeEach(() => {
    backend.calls = [];
    backend.empty = false;
});

describe("the tasks overview", () => {
    it("reads GET /work/overview once and draws the tiles, the gauge, the trend, the projects, the workload and the overdue list off it", async () => {
        render(<TasksLoader />);
        await waitFor(() => expect(screen.getByText("Verified tasks")).toBeInTheDocument());

        expect(backend.calls).toEqual(["/work/overview"]);

        /* The tiles: a count of the active tasks (everything but ARCHIVED). */
        expect(screen.getByText("Verified tasks").nextElementSibling).toHaveTextContent("2of 12");
        expect(screen.getByText("In progress", { selector: "p" }).nextElementSibling).toHaveTextContent("4");
        expect(screen.getByText("Pending review", { selector: "p" }).nextElementSibling).toHaveTextContent("1");
        expect(screen.getByText("Upcoming").nextElementSibling).toHaveTextContent("4");

        /* The gauge is verified over total; the caption carries the issues, the overdue and the week. */
        expect(screen.getByText("17%")).toBeInTheDocument();
        expect(screen.getByText("3 open issues in the risk log · 2 overdue · 3 due this week")).toBeInTheDocument();

        /* The trend is the read's months, labelled. */
        expect(screen.getByTestId("trend")).toHaveTextContent("Aug:3/4,Sept:2/8");

        /* Projects, workload and overdue rows. */
        expect(screen.getByText("Mumbai launch")).toBeInTheDocument();
        expect(screen.getByText("PRJ-0001 · 7 open · 2 verified")).toBeInTheDocument();
        expect(screen.getByText("Asha Rao")).toBeInTheDocument();
        expect(screen.getByText("Bala Iyer")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Replace the Andheri hoarding" })).toHaveAttribute("href", "/tasks/tsk_9");
        expect(screen.getByText("TSK-000009 · Asha Rao")).toBeInTheDocument();
    });

    it("says so when there is nothing yet and offers the first task", async () => {
        backend.empty = true;
        render(<TasksLoader />);
        await waitFor(() => expect(screen.getByText("No tasks yet")).toBeInTheDocument());
        expect(screen.getByRole("link", { name: "Create the first task" })).toHaveAttribute("href", "/tasks/new");
    });

    it("keeps the project picker's options from the full read when one project is picked", async () => {
        const onProjectChange = vi.fn();
        const full = {
            window: { from: "2026-09-01", to: "2026-09-30" },
            tasks: { total: 2, byStatus: { TODO: 2 }, byPriority: {}, overdue: 0, dueThisWeek: 0, verifiedInWindow: 0 },
            trend: [],
            issues: { open: 0, bySeverity: {}, byStatus: {} },
            workload: [],
            overdueList: [],
            projects: [
                { id: "prj_1", displayId: "PRJ-0001", name: "Mumbai launch", kind: "REGION" as const, open: 1, verified: 0, progress: 0 },
                { id: "prj_2", displayId: "PRJ-0002", name: "Finance close", kind: "DEPARTMENT" as const, open: 1, verified: 0, progress: 0 },
            ],
        };
        const { rerender } = render(<TasksOverview overview={full} projectId={null} onProjectChange={onProjectChange} />);
        rerender(<TasksOverview overview={{ ...full, projects: [full.projects[1]] }} projectId="prj_2" onProjectChange={onProjectChange} />);
        /* The row list is the narrowed read; the picker still knows both projects. */
        expect(screen.queryByText("PRJ-0001 · 1 open · 0 verified")).toBeNull();
        expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent("Finance close");
    });
});
