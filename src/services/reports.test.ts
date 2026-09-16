import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reports — Lot G (Q129), package CG4.
 *
 * The catalogue is the contract: a filter a kind does not declare is a 400
 * for the whole run, so what the console sends is pinned — only the keys
 * the kind names, blanks dropped. A schedule PATCH is only what moved,
 * because the server refuses an empty one and recomputes `nextRunAt` on a
 * cadence change. Download goes through the blob helper with the admin
 * token, never a link the console builds itself.
 */

const { calls, saved } = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    saved: [] as { filename: string; size: number }[],
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return {
        ...actual,
        api: {
            get: record("GET"),
            post: record("POST"),
            patch: record("PATCH"),
            put: record("PUT"),
            delete: record("DELETE"),
            blob: async (path: string) => {
                calls.push({ method: "BLOB", path });
                return { blob: new Blob(["kind,name\n"]), filename: path.includes("named") ? "bookings-gmv-2026-09-01-to-2026-09-13.csv" : null, contentType: "text/csv" };
            },
        },
        saveBlob: (blob: Blob, filename: string) => {
            saved.push({ filename, size: blob.size });
        },
    };
});

import {
    canDownload,
    declaredFilters,
    filtersFor,
    scheduleFiltersBody,
    scheduleWindow,
    parseRecipients,
    reportsService,
    runFilename,
    runsQuery,
    schedulePatch,
    scheduleProblem,
    schedulesQuery,
    windowProblem,
    type ReportKind,
    type ReportRun,
    type ReportSchedule,
} from "./reports";

const kind: ReportKind = {
    kind: "bookings-gmv",
    name: "Bookings and GMV",
    description: "Every campaign and package paid in the window.",
    filters: [
        { key: "advertiserId", label: "Advertiser", type: "id" },
        { key: "agentId", label: "Agent", type: "id" },
        { key: "kind", label: "Kind", type: "enum", values: ["CAMPAIGN", "PACKAGE"] },
    ],
    columns: [{ key: "kind", label: "Kind" }],
};

const run = (over: Partial<ReportRun> = {}): ReportRun => ({
    id: "run_1",
    scheduleId: null,
    kind: "bookings-gmv",
    format: "CSV",
    status: "READY",
    filters: null,
    fileId: "file_1",
    rowCount: 12,
    error: null,
    startedAt: "2026-09-14T06:00:00.000Z",
    finishedAt: "2026-09-14T06:00:02.000Z",
    expiresAt: "2026-10-14T06:00:02.000Z",
    requestedById: "usr_1",
    ...over,
});

const schedule = (over: Partial<ReportSchedule> = {}): ReportSchedule => ({
    id: "sch_1",
    kind: "bookings-gmv",
    name: "GMV to finance",
    cadence: "WEEKLY",
    format: "CSV",
    recipients: ["finance@example.com"],
    filters: { kind: "CAMPAIGN" },
    enabled: true,
    createdById: "usr_1",
    lastRunAt: null,
    nextRunAt: "2026-09-21T00:30:00.000Z",
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    ...over,
});

beforeEach(() => {
    calls.length = 0;
    saved.length = 0;
});

describe("filtersFor", () => {
    it("keeps only the keys the kind declares and drops blanks", () => {
        expect(filtersFor(kind, { advertiserId: " adv_1 ", agentId: "", kind: "CAMPAIGN", city: "Bengaluru" })).toEqual({ advertiserId: "adv_1", kind: "CAMPAIGN" });
    });

    it("is empty with no kind", () => {
        expect(filtersFor(null, { advertiserId: "adv_1" })).toEqual({});
    });
});

describe("windowProblem", () => {
    it("accepts a preset and a custom window inside a year", () => {
        expect(windowProblem({ preset: "last30" })).toBeNull();
        expect(windowProblem({ from: "2026-01-01", to: "2026-12-31" })).toBeNull();
    });

    it("refuses a reversed, unfinished or over-long window the way the server does", () => {
        expect(windowProblem({ from: "2026-09-14", to: "2026-09-01" })).toMatch(/after its end/);
        expect(windowProblem({ from: "2026-09-14", to: "" })).toMatch(/Both dates/);
        expect(windowProblem({ from: "2026-01-01", to: "2027-01-02" })).toMatch(/366 days/);
    });
});

describe("recipients and the schedule's bounds", () => {
    it("splits, lower-cases and deduplicates", () => {
        expect(parseRecipients("Finance@Example.com, ops@example.com finance@example.com")).toEqual({
            recipients: ["finance@example.com", "ops@example.com"],
            problem: null,
        });
    });

    it("names the bad address", () => {
        expect(parseRecipients("finance@example.com, not-an-address").problem).toBe('"not-an-address" is not an email address.');
    });

    it("an empty list is fine — every admin with an email", () => {
        expect(parseRecipients("")).toEqual({ recipients: [], problem: null });
        expect(scheduleProblem({ name: "GMV to finance", recipientsText: "" })).toBeNull();
    });

    it("refuses a name outside 3 to 120", () => {
        expect(scheduleProblem({ name: "ab", recipientsText: "" })).toMatch(/3 to 120/);
    });
});

describe("schedulePatch", () => {
    const before = schedule();
    const same = { name: before.name, cadence: before.cadence, format: before.format, recipients: before.recipients, filters: { kind: "CAMPAIGN" }, enabled: true };

    it("is empty when nothing moved", () => {
        expect(schedulePatch(before, same)).toEqual({});
    });

    it("carries only the leaves that moved", () => {
        expect(schedulePatch(before, { ...same, cadence: "DAILY", enabled: false })).toEqual({ cadence: "DAILY", enabled: false });
        expect(schedulePatch(before, { ...same, recipients: [] })).toEqual({ recipients: [] });
        expect(schedulePatch(before, { ...same, filters: {} })).toEqual({ filters: { window: null } });
    });

    it("G13-B: reads a schedule's fixed window apart from its declared filters, and drops one with null", () => {
        const withWindow = schedule({ filters: { kind: "CAMPAIGN", window: { from: "2026-09-01", to: "2026-09-30" } } });
        expect(declaredFilters(withWindow.filters)).toEqual({ kind: "CAMPAIGN" });
        expect(scheduleWindow(withWindow.filters)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
        expect(scheduleWindow(before.filters)).toBeNull();
        expect(scheduleFiltersBody({ kind: "CAMPAIGN" }, null)).toEqual({ kind: "CAMPAIGN" });
        expect(scheduleFiltersBody({ kind: "CAMPAIGN" }, { from: "2026-09-01", to: "2026-09-30" })).toEqual({ kind: "CAMPAIGN", window: { from: "2026-09-01", to: "2026-09-30" } });
        // Setting one on a schedule that had none, and dropping it again.
        expect(schedulePatch(before, { ...same, filters: scheduleFiltersBody({ kind: "CAMPAIGN" }, { from: "2026-09-01", to: "2026-09-30" }) })).toEqual({
            filters: { kind: "CAMPAIGN", window: { from: "2026-09-01", to: "2026-09-30" } },
        });
        expect(schedulePatch(withWindow, { ...same, filters: { kind: "CAMPAIGN" } })).toEqual({ filters: { kind: "CAMPAIGN", window: null } });
        expect(schedulePatch(withWindow, { ...same, filters: withWindow.filters! })).toEqual({});
    });
});

describe("the queries", () => {
    it("names every facet the list contract cuts on and leaves blanks off", () => {
        expect(runsQuery({ status: ["READY", "FAILED"], kind: "bookings-gmv", scheduleId: "sch_1", sort: "newest", q: " " })).toBe(
            "status=READY%2CFAILED&sort=newest&kind=bookings-gmv&scheduleId=sch_1&page=1&pageSize=20",
        );
        expect(schedulesQuery({ status: ["ENABLED"], pageSize: 50 })).toBe("status=ENABLED&page=1&pageSize=50");
    });
});

describe("canDownload and the filename", () => {
    it("is READY with a file inside its thirty days", () => {
        const now = new Date("2026-09-20T00:00:00.000Z");
        expect(canDownload(run(), now)).toBe(true);
        expect(canDownload(run({ status: "FAILED", fileId: null }), now)).toBe(false);
        expect(canDownload(run({ status: "RUNNING", fileId: null }), now)).toBe(false);
        expect(canDownload(run({ expiresAt: "2026-09-19T00:00:00.000Z" }), now)).toBe(false);
    });

    it("falls back to the kind and the format's extension", () => {
        expect(runFilename(run({ format: "PDF" }), null)).toBe("bookings-gmv.pdf");
        expect(runFilename(run(), "named.csv")).toBe("named.csv");
    });
});

describe("reportsService", () => {
    it("runs a report with the kind, format, filters and window", async () => {
        await reportsService.run({ kind: "bookings-gmv", format: "PDF", filters: { kind: "CAMPAIGN" }, window: { preset: "lastMonth" } });
        expect(calls).toEqual([{ method: "POST", path: "/reports/run", body: { kind: "bookings-gmv", format: "PDF", filters: { kind: "CAMPAIGN" }, window: { preset: "lastMonth" } } }]);
    });

    it("downloads a run's file through the blob helper and hands it to the browser", async () => {
        const outcome = await reportsService.download(run({ id: "named" }));
        expect(calls).toEqual([{ method: "BLOB", path: "/reports/runs/named/file" }]);
        expect(outcome.filename).toBe("bookings-gmv-2026-09-01-to-2026-09-13.csv");
        expect(saved).toEqual([{ filename: "bookings-gmv-2026-09-01-to-2026-09-13.csv", size: outcome.bytes }]);
    });

    it("names the file itself when the server did not", async () => {
        const outcome = await reportsService.download(run({ id: "run_2", format: "PDF" }));
        expect(outcome.filename).toBe("bookings-gmv.pdf");
    });

    it("creates, patches and deletes a schedule on its routes", async () => {
        await reportsService.createSchedule({ kind: "bookings-gmv", name: "GMV to finance", cadence: "WEEKLY", format: "CSV", recipients: [], filters: {}, enabled: true });
        await reportsService.updateSchedule("sch_1", { enabled: false });
        await reportsService.deleteSchedule("sch_1");
        expect(calls.map((call) => [call.method, call.path])).toEqual([
            ["POST", "/reports/schedules"],
            ["PATCH", "/reports/schedules/sch_1"],
            ["DELETE", "/reports/schedules/sch_1"],
        ]);
        expect(calls[1]?.body).toEqual({ enabled: false });
    });

    it("reads the catalogue, the runs and the schedules under the list contract", async () => {
        await reportsService.catalogue();
        await reportsService.runs({ status: ["READY"] });
        await reportsService.schedules();
        expect(calls.map((call) => call.path)).toEqual(["/reports/catalogue", "/reports/runs?status=READY&page=1&pageSize=20", "/reports/schedules?page=1&pageSize=20"]);
    });
});
