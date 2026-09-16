import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot AA — the create wizard over `POST /work/tasks` (package AA-C).
 *
 * What is pinned: the four steps gate on their own rules (a title, a
 * deadline after the start, at least one assignee) before anything goes
 * on the wire; the people picker searches `GET /work/people?q`; and the
 * one POST carries exactly the create body — the title, the project, the
 * priority, the dates, the estimate, the assignees, the reviewers with
 * their approver mark, the tags — with nothing invented and the blanks
 * left off; a created task opens its own page.
 */

const { backend, toast, router } = vi.hoisted(() => ({
    backend: { calls: [] as { method: string; path: string; body?: unknown }[] },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/tasks/new",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/use-debounced", () => ({ useDebounced: <T,>(value: T) => value }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const people = [
        { userId: "usr_a", name: "Asha Rao", kind: "EMPLOYEE", role: "Field lead", departmentName: "Operations" },
        { userId: "usr_r", name: "Ravi Menon", kind: "EMPLOYEE", role: "Head of ops", departmentName: "Operations" },
        { userId: "usr_g", name: "Ganesh", kind: "AGENT", role: "Field agent", departmentName: null },
    ];
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                if (path.startsWith("/work/people")) {
                    const q = new URLSearchParams(path.split("?")[1] ?? "").get("q")?.toLowerCase() ?? "";
                    return people.filter((person) => person.name.toLowerCase().includes(q));
                }
                /* The inline project dialog's department picker (Lot AB). */
                if (path.startsWith("/hr/departments")) return { items: [{ id: "dep_sales", name: "Sales", code: "SALES" }], total: 1, page: 1, pageSize: 100 };
                throw new Error(`unexpected GET ${path}`);
            },
            post: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "POST", path, body });
                if (path === "/work/projects") {
                    const input = body as { name: string; kind: string; ownerUserId: string };
                    return { id: "prj_new", displayId: "PRJ-0007", name: input.name, description: null, kind: input.kind, departmentId: "dep_sales", cityId: null, ownerUserId: input.ownerUserId, owner: people[1], status: "ACTIVE", startsAt: null, endsAt: null, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
                }
                return { id: "tsk_new", displayId: "TSK-000042", title: (body as { title: string }).title, assignees: [people[0], people[2]] };
            },
        },
    };
});

import { CreateTaskWizard } from "./create-task-wizard";

const projects = [
    { id: "prj_1", displayId: "PRJ-0001", name: "Mumbai launch", description: null, kind: "REGION" as const, departmentId: null, cityId: "city_1", ownerUserId: "usr_r", owner: { userId: "usr_r", name: "Ravi Menon", kind: "EMPLOYEE" as const, role: "Head of ops", departmentName: "Operations" }, status: "ACTIVE", startsAt: null, endsAt: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
];

beforeEach(() => {
    backend.calls = [];
    toast.success.mockClear();
    toast.error.mockClear();
    router.push.mockClear();
});

const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));

describe("the create wizard", () => {
    it("gates each step before the wire, then posts the create body once", async () => {
        render(<CreateTaskWizard projects={projects} tasks={[]} initial={{ projectId: "prj_1" }} />);

        /* Basics: a title is required. */
        next();
        expect(toast.error).toHaveBeenLastCalledWith("Give the task a title.");
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Audit the metro stations" } });
        fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Every platform, both lines." } });
        fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "audit" } });
        fireEvent.keyDown(screen.getByLabelText("Tags"), { key: "Enter" });
        next();

        /* Schedule: the deadline cannot precede the start. */
        fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-09-10" } });
        fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2026-09-01" } });
        next();
        expect(toast.error).toHaveBeenLastCalledWith("The deadline must be on or after the start date.");
        fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2026-09-30" } });
        fireEvent.change(screen.getByLabelText("Effort estimate (hours)"), { target: { value: "40" } });
        next();

        /* Team: at least one assignee, from the people picker over GET /work/people. */
        await waitFor(() => expect(screen.getAllByRole("button", { name: /Asha Rao/ }).length).toBeGreaterThan(0));
        expect(backend.calls.some((call) => call.path.startsWith("/work/people"))).toBe(true);
        next();
        expect(toast.error).toHaveBeenLastCalledWith("Pick at least one assignee.");

        const [assignees, reviewers] = screen.getAllByRole("list", { name: "People" });
        fireEvent.click(assignees.querySelector('button[aria-pressed="false"]') as HTMLElement); // Asha
        fireEvent.click(assignees.querySelectorAll('button[aria-pressed="false"]')[1] as HTMLElement); // Ganesh, the agent
        fireEvent.click(reviewers.querySelectorAll('button[aria-pressed="false"]')[1] as HTMLElement); // Ravi
        fireEvent.click(screen.getByRole("checkbox", { name: "Ravi Menon is an approver" }));
        next();

        /* Review, then the one POST. */
        expect(screen.getByText("Assignees").nextElementSibling).toHaveTextContent("Asha Rao, Ganesh");
        expect(screen.getByText("Reviewers").nextElementSibling).toHaveTextContent("Ravi Menon (approver)");
        fireEvent.click(screen.getByRole("button", { name: "Create task" }));

        await waitFor(() => expect(backend.calls.filter((call) => call.method === "POST")).toHaveLength(1));
        expect(backend.calls.find((call) => call.method === "POST")).toEqual({
            method: "POST",
            path: "/work/tasks",
            body: {
                title: "Audit the metro stations",
                description: "Every platform, both lines.",
                projectId: "prj_1",
                priority: "MEDIUM",
                status: "TODO",
                startDate: "2026-09-10",
                deadline: "2026-09-30",
                effortEstimateH: 40,
                tags: ["audit"],
                assigneeUserIds: ["usr_a", "usr_g"],
                reviewers: [{ userId: "usr_r", approver: true }],
                prerequisiteIds: [],
            },
        });
        expect(router.push).toHaveBeenCalledWith("/tasks/tsk_new");
    });

    it("opens a project from the combobox's last item and files the task under it (Lot AB)", async () => {
        render(<CreateTaskWizard projects={projects} tasks={[]} />);

        fireEvent.click(screen.getByRole("combobox", { name: "Project" }));
        const list = await screen.findByRole("listbox");
        expect(within(list).getByText("Mumbai launch")).toBeInTheDocument();
        fireEvent.click(within(list).getByText("New project…"));

        /* The same dialog as the Projects tab, inline; nothing was picked yet (the wizard behind it is aria-hidden while it is open). */
        const dialog = await screen.findByRole("dialog", { name: "New project" });
        expect(screen.getByRole("combobox", { name: "Project", hidden: true })).toHaveTextContent("No project");
        fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Q1 field audit" } });
        fireEvent.click(within(dialog).getByRole("combobox", { name: "Department" }));
        await waitFor(() => expect(within(screen.getAllByRole("listbox").at(-1) as HTMLElement).getByText("Sales")).toBeInTheDocument());
        fireEvent.click(within(screen.getAllByRole("listbox").at(-1) as HTMLElement).getByText("Sales"));
        await waitFor(() => expect(within(dialog).getAllByRole("button", { name: /Ravi Menon/ }).length).toBeGreaterThan(0));
        fireEvent.click(within(dialog).getByRole("button", { name: /Ravi Menon/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Open project" }));

        await waitFor(() => expect(backend.calls.find((call) => call.method === "POST")).toEqual({ method: "POST", path: "/work/projects", body: { name: "Q1 field audit", kind: "DEPARTMENT", departmentId: "dep_sales", ownerUserId: "usr_r" } }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        /* The created project is selected, and sits in the list beside the ones the loader read. */
        expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent("Q1 field audit");
        fireEvent.click(screen.getByRole("combobox", { name: "Project" }));
        const reopened = await screen.findByRole("listbox");
        expect(within(reopened).getByText("Q1 field audit")).toBeInTheDocument();
        expect(within(reopened).getByText("Mumbai launch")).toBeInTheDocument();
        fireEvent.keyDown(reopened, { key: "Escape" });

        /* And it is what the task is filed under. */
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Audit Pune" } });
        next();
        next();
        await waitFor(() => expect(screen.getAllByRole("list", { name: "People" }).length).toBe(2));
        const [assignees] = screen.getAllByRole("list", { name: "People" });
        await waitFor(() => expect(assignees.querySelector('button[aria-pressed="false"]')).not.toBeNull());
        fireEvent.click(assignees.querySelector('button[aria-pressed="false"]') as HTMLElement);
        next();
        expect(screen.getByText("Project").nextElementSibling).toHaveTextContent("Q1 field audit");
        fireEvent.click(screen.getByRole("button", { name: "Create task" }));
        await waitFor(() => expect(backend.calls.filter((call) => call.method === "POST")).toHaveLength(2));
        expect((backend.calls.filter((call) => call.method === "POST")[1].body as { projectId: string }).projectId).toBe("prj_new");
    });
});
