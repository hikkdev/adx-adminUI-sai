import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot AB — the Projects tab over `GET /work/projects` (package AB-C).
 *
 * What is pinned: every facet goes on the query — the status chips as a
 * csv (ACTIVE by default), one kind, the search — and the chip counts are
 * the read's own `counts`; a row names its department or city off the
 * side reads and its open / verified / progress off the overview; a row
 * click opens the Board filtered to the project; the dialog posts exactly
 * the create body for a DEPARTMENT project (its department) and a REGION
 * one (the catalogued city's id, never the typed name); Edit sends only
 * what moved; Archive confirms, then `POST /work/projects/:id/archive`.
 */

const { backend, toast, router } = vi.hoisted(() => ({
    backend: { calls: [] as { method: string; path: string; body?: unknown }[] },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    router: { push: vi.fn(), replace: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/tasks/projects",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/use-debounced", () => ({ useDebounced: <T,>(value: T) => value }));

const person = (userId: string, name: string) => ({ userId, name, kind: "EMPLOYEE", role: "Head of ops", departmentName: "Operations" });

const project = (id: string, name: string, kind: "DEPARTMENT" | "REGION", status: string, extra: Record<string, unknown> = {}) => ({
    id,
    displayId: `PRJ-${id}`,
    name,
    description: null,
    kind,
    departmentId: kind === "DEPARTMENT" ? "dep_ops" : null,
    cityId: kind === "REGION" ? "c_pune" : null,
    ownerUserId: "usr_r",
    owner: person("usr_r", "Ravi Menon"),
    status,
    startsAt: null,
    endsAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...extra,
});

const city = {
    id: "c_pune",
    slug: "pune",
    name: "Pune",
    state: "Maharashtra",
    aliases: [],
    isActive: true,
    stateId: null,
    districtId: null,
    latitude: null,
    longitude: null,
    population: 100_000,
    kind: "TOWN",
    geonameId: null,
    source: "GEONAMES",
    stage: "LAUNCHED",
    switches: { supplyIntake: false, publishing: false, demand: false, agentOnboarding: false, printPartners: false, leadFeeds: false },
    launchedAt: null,
    pausedAt: null,
    withdrawnAt: null,
    rolloutNote: null,
    geoState: { code: "MH", name: "Maharashtra" },
    geoDistrict: null,
};

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                if (path.startsWith("/work/projects")) {
                    const archived = path.includes("status=ARCHIVED");
                    return {
                        items: archived ? [project("p3", "Old drive", "REGION", "ARCHIVED")] : [project("p1", "Q4 sales push", "DEPARTMENT", "ACTIVE"), project("p2", "Pune launch", "REGION", "ACTIVE")],
                        total: archived ? 1 : 2,
                        page: 1,
                        pageSize: 100,
                        counts: { ACTIVE: 2, ARCHIVED: 1 },
                    };
                }
                if (path.startsWith("/work/overview")) {
                    return {
                        window: { from: "2026-09-01", to: "2026-09-30" },
                        tasks: { total: 0, byStatus: {}, byPriority: {}, overdue: 0, dueThisWeek: 0, verifiedInWindow: 0 },
                        trend: [],
                        issues: { open: 0, bySeverity: {}, byStatus: {} },
                        workload: [],
                        overdueList: [],
                        projects: [{ id: "p1", displayId: "PRJ-p1", name: "Q4 sales push", kind: "DEPARTMENT", open: 4, verified: 2, progress: 40 }],
                    };
                }
                if (path.startsWith("/hr/departments")) {
                    return { items: [{ id: "dep_ops", name: "Operations", code: "OPS" }, { id: "dep_sales", name: "Sales", code: "SALES" }], total: 2, page: 1, pageSize: 100 };
                }
                if (path.startsWith("/geo/cities")) return { items: [city], total: 1, page: 1, pageSize: 20, counts: {} };
                if (path.startsWith("/work/people")) return [person("usr_r", "Ravi Menon"), person("usr_a", "Asha Rao")];
                throw new Error(`unexpected GET ${path}`);
            },
            post: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "POST", path, body });
                if (path.endsWith("/archive")) return project("p1", "Q4 sales push", "DEPARTMENT", "ARCHIVED");
                const input = body as { name: string; kind: "DEPARTMENT" | "REGION" };
                return project("p_new", input.name, input.kind, "ACTIVE");
            },
            patch: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "PATCH", path, body });
                return project("p1", "Q4 sales push (renamed)", "DEPARTMENT", "ACTIVE");
            },
        },
    };
});

import { ProjectsLoader, projectsQueryOf } from "./projects-loader";
import { ProjectDialog } from "./project-dialog";

beforeEach(() => {
    backend.calls = [];
    toast.success.mockClear();
    toast.error.mockClear();
    toast.info.mockClear();
    router.push.mockClear();
});

const posts = () => backend.calls.filter((call) => call.method === "POST");

/* Radix opens a dropdown on the keyboard in jsdom, where a click's pointer events never arrive. */
const openActions = (name: string) => fireEvent.keyDown(screen.getByRole("button", { name: `Actions for ${name}` }), { key: "ArrowDown" });

describe("the projects table", () => {
    it("serialises the facets as the read takes them", () => {
        expect(projectsQueryOf({ status: ["ACTIVE"] }, "")).toEqual({ status: ["ACTIVE"], sort: "name", pageSize: 100 });
        expect(projectsQueryOf({ status: [], kind: ["REGION"] }, " pune ")).toEqual({ q: "pune", kind: "REGION", sort: "name", pageSize: 100 });
        expect(projectsQueryOf({ status: ["ACTIVE", "ARCHIVED"], kind: [] }, "")).toEqual({ status: ["ACTIVE", "ARCHIVED"], sort: "name", pageSize: 100 });
    });

    it("reads the active projects by default, names each row's scope and stats off the side reads, and a row opens the Board", async () => {
        render(<ProjectsLoader />);
        await waitFor(() => expect(screen.getByText("Q4 sales push")).toBeInTheDocument());

        const read = backend.calls.find((call) => call.path.startsWith("/work/projects"));
        expect(read?.path).toBe("/work/projects?status=ACTIVE&sort=name&pageSize=100");

        /* The department off GET /hr/departments, the city off GET /geo/cities. */
        await waitFor(() => expect(screen.getByText("Operations")).toBeInTheDocument());
        expect(screen.getByText("Pune")).toBeInTheDocument();

        /* The overview's numbers for the project it names; a dash for the rest. */
        const rows = screen.getAllByRole("row").slice(1);
        expect(rows[0]).toHaveTextContent("PRJ-p1");
        expect(within(rows[0]).getByText("4")).toBeInTheDocument();
        expect(within(rows[0]).getByText("40%")).toBeInTheDocument();
        expect(rows[1]).toHaveTextContent("PRJ-p2");
        expect(within(rows[1]).getAllByText("—").length).toBeGreaterThan(0);

        /* The status chips carry the read's counts, the status facet removed. */
        fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
        await waitFor(() => expect(screen.getByText("Archived")).toBeInTheDocument());
        expect(screen.getByText("Archived").parentElement).toHaveTextContent("1");
        /* The kind facet holds one value: a radio per kind. */
        expect(screen.getAllByRole("radio")).toHaveLength(2);

        fireEvent.click(screen.getByText("Q4 sales push"));
        expect(router.push).toHaveBeenCalledWith("/tasks/board?projectId=p1");
    });

    it("opens a DEPARTMENT project with POST /work/projects carrying its department and owner", async () => {
        render(<ProjectsLoader />);
        await waitFor(() => expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "New project" }));
        const dialog = await screen.findByRole("dialog");

        /* The gates: a name, a department, an owner. */
        fireEvent.click(within(dialog).getByRole("button", { name: "Open project" }));
        expect(toast.error).toHaveBeenLastCalledWith("Give the project a name.");
        fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Q1 field audit" } });
        fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Every launched city." } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Open project" }));
        expect(toast.error).toHaveBeenLastCalledWith("Pick the department the project belongs to.");

        /* The department combobox lists GET /hr/departments. */
        fireEvent.click(within(dialog).getByRole("combobox", { name: "Department" }));
        await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
        fireEvent.click(within(screen.getByRole("listbox")).getByText("Sales"));
        fireEvent.click(within(dialog).getByRole("button", { name: "Open project" }));
        expect(toast.error).toHaveBeenLastCalledWith("Pick who owns the project.");

        /* The owner off GET /work/people. */
        await waitFor(() => expect(within(dialog).getAllByRole("button", { name: /Asha Rao/ }).length).toBeGreaterThan(0));
        fireEvent.click(within(dialog).getByRole("list", { name: "People" }).querySelectorAll("button")[1] as HTMLElement);
        fireEvent.change(within(dialog).getByLabelText("Starts"), { target: { value: "2026-10-01" } });
        fireEvent.change(within(dialog).getByLabelText("Ends"), { target: { value: "2026-12-31" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Open project" }));

        await waitFor(() => expect(posts()).toHaveLength(1));
        expect(posts()[0]).toEqual({
            method: "POST",
            path: "/work/projects",
            body: { name: "Q1 field audit", description: "Every launched city.", kind: "DEPARTMENT", departmentId: "dep_sales", ownerUserId: "usr_a", startsAt: "2026-10-01", endsAt: "2026-12-31" },
        });
        expect(toast.success).toHaveBeenCalledWith("PRJ-p_new opened", { description: "A department project." });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        /* The table re-reads. */
        expect(backend.calls.filter((call) => call.path.startsWith("/work/projects?")).length).toBeGreaterThan(1);
    });

    it("opens a REGION project with the catalogued city's id, never the typed name", async () => {
        const onSaved = vi.fn();
        render(<ProjectDialog open onOpenChange={vi.fn()} initialKind="REGION" onSaved={onSaved} />);
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Pune launch" } });

        /* A typed name alone is not a city. */
        const input = within(dialog).getByLabelText("City");
        fireEvent.change(input, { target: { value: "Pun" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Open project" }));
        expect(toast.error).toHaveBeenLastCalledWith("Pick a catalogued city for the region.");

        fireEvent.focus(input);
        const list = await screen.findByRole("listbox", { name: "Matching cities" });
        fireEvent.click(within(list).getByRole("option", { name: /Pune/ }));
        expect(input).toHaveValue("Pune");

        await waitFor(() => expect(within(dialog).getAllByRole("button", { name: /Ravi Menon/ }).length).toBeGreaterThan(0));
        fireEvent.click(within(dialog).getByRole("list", { name: "People" }).querySelectorAll("button")[0] as HTMLElement);
        fireEvent.click(within(dialog).getByRole("button", { name: "Open project" }));

        await waitFor(() => expect(posts()).toHaveLength(1));
        expect(posts()[0]).toEqual({ method: "POST", path: "/work/projects", body: { name: "Pune launch", kind: "REGION", cityId: "c_pune", ownerUserId: "usr_r" } });
        expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "p_new", kind: "REGION" }));
    });

    it("edits a project with only what moved, and archives one after confirming", async () => {
        render(<ProjectsLoader />);
        await waitFor(() => expect(screen.getByText("Q4 sales push")).toBeInTheDocument());

        openActions("Q4 sales push");
        fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByLabelText("Name")).toHaveValue("Q4 sales push");
        fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Q4 sales push (renamed)" } });
        fireEvent.change(within(dialog).getByLabelText("Ends"), { target: { value: "2026-12-31" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(backend.calls.find((call) => call.method === "PATCH")).toEqual({ method: "PATCH", path: "/work/projects/p1", body: { name: "Q4 sales push (renamed)", endsAt: "2026-12-31" } }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        openActions("Q4 sales push");
        fireEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));
        const confirm = await screen.findByRole("alertdialog");
        expect(confirm).toHaveTextContent("Archive PRJ-p1?");
        expect(posts()).toHaveLength(0);
        fireEvent.click(within(confirm).getByRole("button", { name: "Archive" }));
        await waitFor(() => expect(posts()).toEqual([{ method: "POST", path: "/work/projects/p1/archive", body: {} }]));
        expect(toast.success).toHaveBeenCalledWith("PRJ-p1 archived", expect.anything());
    });
});
