import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot AA — the task board over `GET /work/board` (package AA-C).
 *
 * What is pinned: the kanban draws the read's columns (every status but
 * ARCHIVED, each with its count) and never a task list of its own; a card
 * carries a status menu whose moves are the module's table for that
 * status, and picking one posts `POST /work/tasks/:id/status` with the
 * status alone (a reason only for BLOCKED); a refusal is shown as the
 * server said it — a 409 naming the unfinished prerequisites, by name;
 * the project picker sends `?projectId=`; the archive is its own read,
 * asked for only when its tab opens. There is no drag-and-drop.
 */

const { backend, toast, session } = vi.hoisted(() => ({
    backend: { calls: [] as { method: string; path: string; body?: unknown }[], refuse: false },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    session: { permissions: new Set<string>(["work.view", "work.edit"]) },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/tasks/board",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: (permission: string) => session.permissions.has(permission) }),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const person = { userId: "usr_a", name: "Asha Rao", kind: "EMPLOYEE", role: "Field lead", departmentName: "Operations" };
    const card = (id: string, title: string, status: string, extra: Record<string, unknown> = {}) => ({
        id,
        displayId: `TSK-${id}`,
        title,
        status,
        priority: "MEDIUM",
        progress: 20,
        deadline: "2026-09-30T18:29:59.999Z",
        startDate: "2026-09-01T00:00:00.000Z",
        project: { id: "prj_1", displayId: "PRJ-0001", name: "Mumbai launch", kind: "REGION" },
        assignees: [person],
        openIssues: 0,
        childCount: 0,
        overdue: false,
        tags: [],
        parentTaskId: null,
        updatedAt: "2026-09-10T00:00:00.000Z",
        ...extra,
    });
    const board = {
        columns: [
            { status: "DRAFT", count: 0, more: 0, tasks: [] },
            { status: "TODO", count: 2, more: 0, tasks: [card("t1", "Audit the metro stations", "TODO"), card("t2", "Brief the printer", "TODO")] },
            { status: "IN_PROGRESS", count: 101, more: 1, tasks: [card("t3", "Replace the Andheri hoarding", "IN_PROGRESS")] },
            { status: "PENDING_REVIEW", count: 0, more: 0, tasks: [] },
            { status: "VERIFIED", count: 1, more: 0, tasks: [card("t4", "Sign the Bandra lease", "VERIFIED", { progress: 100 })] },
            { status: "BLOCKED", count: 0, more: 0, tasks: [] },
        ],
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                if (path.startsWith("/work/board")) return board;
                if (path.startsWith("/work/projects")) return { items: [{ id: "prj_1", displayId: "PRJ-0001", name: "Mumbai launch", kind: "REGION", status: "ACTIVE" }], total: 1, page: 1, pageSize: 100, counts: {} };
                if (path.startsWith("/work/tasks?status=ARCHIVED")) return { items: [card("t9", "Old drive", "ARCHIVED")], total: 1, page: 1, pageSize: 100, counts: {} };
                throw new Error(`unexpected GET ${path}`);
            },
            post: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "POST", path, body });
                if (backend.refuse) {
                    throw new actual.ApiError(409, "CONFLICT", "A prerequisite is not finished", { prerequisites: [{ id: "t0", displayId: "TSK-t0", title: "Survey the sites", status: "TODO" }] });
                }
                return { id: "t1", status: (body as { status: string }).status };
            },
        },
    };
});

import { BoardLoader } from "./board-loader";

beforeEach(() => {
    backend.calls = [];
    backend.refuse = false;
    toast.success.mockClear();
    toast.error.mockClear();
    session.permissions = new Set(["work.view", "work.edit"]);
});

/** Radix opens a dropdown on pointer-down or the keyboard; jsdom has no pointer events, so the keyboard it is. */
const openMenu = (trigger: HTMLElement) => fireEvent.keyDown(trigger, { key: "ArrowDown" });

const openKanban = async () => {
    render(<BoardLoader />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "Kanban" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Kanban" }));
    await waitFor(() => expect(screen.getByTestId("board-column-TODO")).toBeInTheDocument());
};

describe("the task board", () => {
    it("draws the read's columns with their counts and a 'more' line past the cap", async () => {
        await openKanban();
        expect(backend.calls.map((call) => call.path)).toContain("/work/board");
        expect(backend.calls.some((call) => call.path.startsWith("/work/tasks"))).toBe(false);

        const todo = within(screen.getByTestId("board-column-TODO"));
        expect(todo.getAllByTestId("board-card")).toHaveLength(2);
        expect(todo.getByText("2")).toBeInTheDocument();
        expect(todo.getByRole("link", { name: "Audit the metro stations" })).toHaveAttribute("href", "/tasks/t1");

        const inProgress = within(screen.getByTestId("board-column-IN_PROGRESS"));
        expect(inProgress.getByText("101")).toBeInTheDocument();
        expect(inProgress.getByText(/1 more/)).toBeInTheDocument();
        expect(within(screen.getByTestId("board-column-VERIFIED")).getAllByTestId("board-card")).toHaveLength(1);
    });

    it("moves a card through its status menu with POST /work/tasks/:id/status and reloads the board", async () => {
        await openKanban();
        const todo = within(screen.getByTestId("board-column-TODO"));
        const [first] = todo.getAllByTestId("board-card");
        openMenu(within(first).getByRole("button", { name: "Status To do, change status" }));
        /* The moves the table allows from TODO: start, block, archive (work.edit). Never straight to review. */
        const start = await screen.findByRole("menuitem", { name: "In progress" });
        expect(screen.getByRole("menuitem", { name: "Blocked" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Archived" })).toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Pending review" })).toBeNull();
        expect(screen.queryByRole("menuitem", { name: "Verified" })).toBeNull();

        const before = backend.calls.filter((call) => call.method === "GET" && call.path.startsWith("/work/board")).length;
        fireEvent.click(start);
        await waitFor(() => expect(backend.calls.find((call) => call.method === "POST")).toBeTruthy());
        expect(backend.calls.find((call) => call.method === "POST")).toEqual({ method: "POST", path: "/work/tasks/t1/status", body: { status: "IN_PROGRESS" } });
        await waitFor(() => expect(backend.calls.filter((call) => call.method === "GET" && call.path.startsWith("/work/board")).length).toBe(before + 1));
        expect(toast.success).toHaveBeenCalledWith("Moved to In progress", expect.anything());
    });

    it("shows a refused move as the server said it, naming the unfinished prerequisites", async () => {
        backend.refuse = true;
        await openKanban();
        const [first] = within(screen.getByTestId("board-column-TODO")).getAllByTestId("board-card");
        openMenu(within(first).getByRole("button", { name: "Status To do, change status" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "In progress" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A prerequisite is not finished: TSK-t0"));
    });

    it("asks for the project on the query and reads the archive only when its tab opens", async () => {
        await openKanban();
        expect(backend.calls.some((call) => call.path.startsWith("/work/tasks?status=ARCHIVED"))).toBe(false);
        fireEvent.click(screen.getByRole("tab", { name: "Archived" }));
        await waitFor(() => expect(screen.getByText("Old drive")).toBeInTheDocument());
        expect(backend.calls.some((call) => call.path.startsWith("/work/tasks?status=ARCHIVED"))).toBe(true);
    });
});
