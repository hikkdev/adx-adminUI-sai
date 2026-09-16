import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Package O-C — the employees overview over
 * `GET /section-overviews/employees`.
 *
 * What is pinned: the page reads the section's one route (no separate
 * `/employees`, `/employees/overview` or `/employees/workload` reads); the
 * headcount and the open positions come off the `overview` it carries,
 * who joined in the window moves against the window before, the KYC mix
 * leads into the employees' queue with the chip on, the tenure mix and
 * the four breakdowns draw the new fields (a department row opens the
 * console's department page), and the workload chart is drawn from the
 * `workload` the read carries. The HR-tool door, the Work card (Lot AA,
 * over `GET /work/overview`) and the holidays still to come are side
 * reads that fail soft.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: { calls: [] as string[] },
    router: { replace: vi.fn(), push: vi.fn(), search: "" },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/employees",
    useSearchParams: () => new URLSearchParams(router.search),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/use-now", () => ({ useNow: () => Date.parse("2026-09-15T10:00:00.000Z") }));

vi.mock("@/components/charts/lazy", () => ({
    WorkloadChart: ({ data }: { data: { label: string }[] }) => <div data-testid="workload-chart">{data.map((point) => point.label).join(",")}</div>,
    OverviewSeriesChart: () => <div data-testid="series-chart" />,
}));

vi.mock("@/services/integrations", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/integrations")>();
    return {
        ...actual,
        integrationsService: {
            ...actual.integrationsService,
            get: async () => {
                backend.calls.push("/integrations");
                throw new Error("integrations down");
            },
        },
    };
});

vi.mock("@/services/employees", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/employees")>();
    return {
        ...actual,
        employeesService: {
            ...actual.employeesService,
            holidays: async (year: number) => {
                backend.calls.push(`/hr/holidays?year=${year}`);
                return [];
            },
        },
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const list = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 100, counts: {} });
    const overview = {
        section: "employees",
        window: { from: "2026-08-17", to: "2026-09-15", start: "", end: "", days: 30 },
        previousWindow: { from: "2026-07-18", to: "2026-08-16", start: "", end: "", days: 30 },
        city: null,
        generatedAt: "2026-09-15T10:00:00.000Z",
        overview: { headcount: { total: 48, active: 45, inactive: 3 }, openPositions: 6 },
        tiles: {
            joined: { value: 4, previous: 1, delta: 3 },
            kyc: { awaitingDocuments: 2, requested: 0, pending: 3, needsInfo: 1, rejected: 0, verified: 42 },
            tenure: { under1y: 20, from1to3y: 15, over3y: 10 },
            holidays: { value: 2, previous: 1, delta: 1 },
        },
        breakdowns: {
            byDepartment: list([
                { key: "dep_ops", label: "Operations", href: "/hr/departments/dep_ops", headcount: 18, openRoles: 2 },
                { key: "dep_fin", label: "Finance", href: "/hr/departments/dep_fin", headcount: 6, openRoles: 0 },
            ]),
            byWorkMode: list([{ key: "REMOTE", label: "Remote", href: "/employees?workMode=REMOTE", count: 12 }]),
            byEmploymentType: list([{ key: "FULL_TIME", label: "Full Time", href: "/employees?employmentType=FULL_TIME", count: 40 }]),
            byRegion: list([{ key: "South", label: "South", href: "/employees?region=South", count: 30 }]),
        },
        workload: {
            from: "2026-08-17",
            to: "2026-09-15",
            granularity: "month",
            thresholds: { medium: 10, high: 25 },
            weights: { open: { kyc: 2, tickets: 1, fraud: 3 }, schedule: 1, actions: { decisions: 1, replies: 1 } },
            buckets: [
                { start: "2026-08-01", end: "2026-09-01", days: 31, staff: 45, counts: { LOW: 30, MEDIUM: 10, HIGH: 5 }, share: { LOW: 0.667, MEDIUM: 0.222, HIGH: 0.111 } },
                { start: "2026-09-01", end: "2026-10-01", days: 30, staff: 45, counts: { LOW: 25, MEDIUM: 15, HIGH: 5 }, share: { LOW: 0.556, MEDIUM: 0.333, HIGH: 0.111 } },
            ],
            employees: [],
        },
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (path.startsWith("/section-overviews/employees")) return overview;
                /* Lot AA: the Work card, off the work module's own overview. */
                if (path === "/work/overview") {
                    return {
                        window: { from: "2026-09-01", to: "2026-09-30" },
                        tasks: { total: 12, byStatus: { TODO: 4, IN_PROGRESS: 3, PENDING_REVIEW: 2, VERIFIED: 2, BLOCKED: 1, DRAFT: 0 }, byPriority: {}, overdue: 3, dueThisWeek: 2, verifiedInWindow: 2 },
                        trend: [],
                        issues: { open: 1, bySeverity: {}, byStatus: {} },
                        workload: [],
                        overdueList: [],
                        projects: [],
                    };
                }
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import { EmployeesLoader } from "./employees-loader";

beforeEach(() => {
    backend.calls = [];
    router.search = "";
});

describe("the employees overview", () => {
    it("reads the section route once and draws the headcount, the joins, the KYC mix, tenure, the breakdowns and the workload off it", async () => {
        render(<EmployeesLoader />);
        await waitFor(() => expect(screen.getByText("Joined in window")).toBeInTheDocument());

        const sectionReads = backend.calls.filter((path) => path.startsWith("/section-overviews/employees"));
        expect(sectionReads).toHaveLength(1);
        expect(sectionReads[0]).toMatch(/^\/section-overviews\/employees\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
        expect(backend.calls.some((path) => path === "/employees" || path.startsWith("/employees/"))).toBe(false);

        /* The headcount and the open positions off the carried overview. */
        expect(screen.getByText("Total employees").nextElementSibling).toHaveTextContent("48");
        expect(screen.getByText("across 2 departments")).toBeInTheDocument();
        expect(screen.getByText("Active records").nextElementSibling).toHaveTextContent("45");
        expect(screen.getByText("3 inactive")).toBeInTheDocument();
        expect(screen.getByText("Open positions").nextElementSibling).toHaveTextContent("6");

        /* Joined moves against the previous window. */
        expect(screen.getAllByTestId("stat-delta").map((node) => node.textContent)).toEqual(expect.arrayContaining(["+3", "+1"]));

        /* The KYC mix into the employees' queue. */
        expect(screen.getByRole("link", { name: "Pending review" })).toHaveAttribute("href", "/kyc/employees?state=pending");
        expect(screen.getByRole("link", { name: "Awaiting documents" })).toHaveAttribute("href", "/kyc/employees?state=awaiting_documents");

        /* Tenure. */
        expect(screen.getByText("45 active staff by time since their record was created.")).toBeInTheDocument();
        expect(screen.getByText("One to three years")).toBeInTheDocument();

        /* The breakdowns: a department opens its console page; a work mode has no route and stays a label. */
        expect(screen.getByRole("link", { name: "Operations" })).toHaveAttribute("href", "/employees/departments/dep_ops");
        expect(screen.queryByRole("link", { name: "Remote" })).toBeNull();
        expect(screen.getByText("Remote")).toBeInTheDocument();
        expect(screen.getByText("Full Time")).toBeInTheDocument();
        expect(screen.getByText("South")).toBeInTheDocument();

        /* The workload chart, from the read's own buckets. */
        expect(screen.getByTestId("workload-chart")).toHaveTextContent("Aug,Sep");
        expect(screen.getByText(/below 10 items a week/)).toBeInTheDocument();

        /* The side reads fail soft; the Work card (Lot AA) draws open / overdue / awaiting review off `GET /work/overview` and opens the Tasks section. */
        await waitFor(() => expect(screen.getAllByText("The integrations row could not be read, so the tool cannot be named here.")).toHaveLength(1));
        await waitFor(() => expect(screen.getByText("Awaiting review")).toBeInTheDocument());
        expect(backend.calls).toContain("/work/overview");
        expect(screen.getByText("Open").nextElementSibling).toHaveTextContent("10");
        expect(screen.getByText("Overdue").nextElementSibling).toHaveTextContent("3");
        expect(screen.getByText("Awaiting review").nextElementSibling).toHaveTextContent("2");
        expect(screen.getByRole("link", { name: "Open Tasks" })).toHaveAttribute("href", "/tasks");
        await waitFor(() => expect(screen.getByText("No holidays left this year.")).toBeInTheDocument());
        expect(backend.calls).toContain("/hr/holidays?year=2026");
    });
});
