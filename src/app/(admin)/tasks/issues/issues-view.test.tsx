import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot AA — the risk log over `GET /work/issues` (package AA-C).
 *
 * What is pinned: every facet goes on the query — the status chips as a
 * csv (open ones by default), one severity, one project, the search — and
 * the chip counts are the read's own `counts`, counted with the status
 * facet removed; the queue draws the page and the pane the selected row,
 * whose task is a link; resolve posts `POST /work/issues/:id/resolve`
 * with the outcome and the resolution, reopen posts `/reopen`, and
 * raising one posts `POST /work/issues`.
 */

const { backend, toast } = vi.hoisted(() => ({
    backend: { calls: [] as { method: string; path: string; body?: unknown }[] },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/tasks/issues",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/use-debounced", () => ({ useDebounced: <T,>(value: T) => value }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const person = (userId: string, name: string) => ({ userId, name, kind: "EMPLOYEE", role: "Field lead", departmentName: "Operations" });
    const issue = (id: string, title: string, severity: string, status: string, extra: Record<string, unknown> = {}) => ({
        id,
        displayId: `ISS-${id}`,
        projectId: "prj_1",
        taskId: "tsk_1",
        title,
        description: "The gate was locked.",
        severity,
        status,
        raisedById: "usr_a",
        assigneeId: "usr_b",
        resolution: null,
        resolvedAt: null,
        createdAt: "2026-09-10T10:00:00.000Z",
        updatedAt: "2026-09-10T10:00:00.000Z",
        raisedBy: person("usr_a", "Asha Rao"),
        assignee: person("usr_b", "Bala Iyer"),
        task: { id: "tsk_1", displayId: "TSK-000001", title: "Audit the metro stations" },
        ...extra,
    });
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                if (path.startsWith("/work/issues")) {
                    const closed = path.includes("status=RESOLVED");
                    return {
                        items: closed
                            ? [issue("i3", "Permit lapsed", "LOW", "RESOLVED", { resolution: "Renewed", resolvedAt: "2026-09-12T10:00:00.000Z" })]
                            : [issue("i1", "Site access refused", "CRITICAL", "OPEN"), issue("i2", "Wrong artwork size", "MEDIUM", "IN_PROGRESS")],
                        total: closed ? 1 : 2,
                        page: 1,
                        pageSize: 100,
                        counts: { OPEN: 1, IN_PROGRESS: 1, RESOLVED: 1, WONT_FIX: 0 },
                    };
                }
                if (path.startsWith("/work/projects")) return { items: [{ id: "prj_1", displayId: "PRJ-0001", name: "Mumbai launch", kind: "REGION", status: "ACTIVE" }], total: 1, page: 1, pageSize: 100, counts: {} };
                if (path.startsWith("/work/tasks")) return { items: [], total: 0, page: 1, pageSize: 100, counts: {} };
                if (path.startsWith("/work/people")) return [person("usr_b", "Bala Iyer")];
                throw new Error(`unexpected GET ${path}`);
            },
            post: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "POST", path, body });
                return issue("i1", "Site access refused", "CRITICAL", "RESOLVED");
            },
            patch: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "PATCH", path, body });
                return issue("i1", "Site access refused", "CRITICAL", "IN_PROGRESS");
            },
        },
    };
});

import { IssuesLoader, issuesQueryOf } from "./issues-loader";

beforeEach(() => {
    backend.calls = [];
    toast.success.mockClear();
    toast.error.mockClear();
});

describe("the risk log", () => {
    it("serialises the facets as the read takes them", () => {
        expect(issuesQueryOf({ status: ["OPEN", "IN_PROGRESS"] }, "")).toEqual({ status: ["OPEN", "IN_PROGRESS"], sort: "severity", pageSize: 100 });
        expect(issuesQueryOf({ status: [], severity: ["CRITICAL"], project: ["prj_1"] }, " gate ")).toEqual({ q: "gate", severity: "CRITICAL", projectId: "prj_1", sort: "severity", pageSize: 100 });
    });

    it("reads the open queue by default, draws the chip counts off the read and links an issue to its task", async () => {
        render(<IssuesLoader />);
        await waitFor(() => expect(screen.getByTestId("issue-queue")).toBeInTheDocument());

        const read = backend.calls.find((call) => call.path.startsWith("/work/issues"));
        expect(read?.path).toBe("/work/issues?status=OPEN%2CIN_PROGRESS&sort=severity&pageSize=100");

        const queue = within(screen.getByTestId("issue-queue"));
        expect(queue.getAllByRole("button")).toHaveLength(2);
        expect(queue.getByText("ISS-i1")).toBeInTheDocument();

        /* The tiles are what needs a decision, off the page in hand. */
        expect(screen.getByText("Needs triage now").nextElementSibling).toHaveTextContent("1");
        expect(screen.getByText("Being worked").nextElementSibling).toHaveTextContent("1");

        /* The pane: the first row, its task a link, its people named. */
        expect(screen.getByRole("heading", { name: "ISS-i1: Site access refused" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Audit the metro stations/ })).toHaveAttribute("href", "/tasks/tsk_1");
        expect(screen.getByText("Raised by").nextElementSibling).toHaveTextContent("Asha Rao");

        /* The status chips carry the read's counts, the status facet removed. */
        fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
        await waitFor(() => expect(screen.getByText("Resolved")).toBeInTheDocument());
        expect(screen.getByText("Resolved").parentElement).toHaveTextContent("1");
    });

    it("resolves the selected issue with the outcome and the resolution, and starts work through a PATCH", async () => {
        render(<IssuesLoader />);
        await waitFor(() => expect(screen.getByRole("heading", { name: "ISS-i1: Site access refused" })).toBeInTheDocument());

        fireEvent.click(screen.getByRole("button", { name: "Start work" }));
        await waitFor(() => expect(backend.calls.find((call) => call.method === "PATCH")).toEqual({ method: "PATCH", path: "/work/issues/i1", body: { status: "IN_PROGRESS" } }));

        fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Resolution"), { target: { value: "The gate was opened by the station master." } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Resolved" }));
        await waitFor(() =>
            expect(backend.calls.find((call) => call.method === "POST")).toEqual({
                method: "POST",
                path: "/work/issues/i1/resolve",
                body: { status: "RESOLVED", resolution: "The gate was opened by the station master." },
            }),
        );
        expect(toast.success).toHaveBeenCalledWith("ISS-i1 resolved");
    });

    it("raises an issue with POST /work/issues", async () => {
        render(<IssuesLoader />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Raise an issue" })).toBeInTheDocument());
        fireEvent.click(screen.getByRole("button", { name: "Raise an issue" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Ladder too short" } });
        fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Needs the 12 ft one." } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Raise issue" }));
        await waitFor(() =>
            expect(backend.calls.find((call) => call.method === "POST")).toEqual({
                method: "POST",
                path: "/work/issues",
                body: { title: "Ladder too short", description: "Needs the 12 ft one.", severity: "MEDIUM" },
            }),
        );
    });
});
