import { api as http, saveBlob } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * Reports — Lot G (Q129/Q143), the `reports` module as the console reads
 * it: twelve kinds defined in code (`GET /reports/catalogue`), rendered on
 * demand as CSV or PDF into a private file (`POST /reports/run`), listed as
 * runs (`GET /reports/runs`) and scheduled daily, weekly or monthly at
 * 06:00 IST with a time-limited link mailed to each recipient
 * (`/reports/schedules`).
 *
 * The catalogue is the contract: a filter a kind does not declare is a 400,
 * never silently ignored, so the run form draws exactly the filters the
 * catalogue names for the kind chosen. The file behind a run is private —
 * the only way to it without an admin token is the link the schedule
 * mailed — so Download goes through the blob helper like every other file.
 *
 * No fixtures: the five seeded schedules and four seeded tiles the exports
 * page used to draw are gone. A seeded schedule would have been a report
 * nobody receives, mailed to nobody, on a cadence nothing ticks.
 */

export const REPORT_FORMATS = ["CSV", "PDF"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_CADENCES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ReportCadence = (typeof REPORT_CADENCES)[number];

/** What each cadence renders when it fires, at 06:00 IST. */
export const CADENCE_LABEL: Record<ReportCadence, string> = {
    DAILY: "Daily · yesterday",
    WEEKLY: "Weekly, Mondays · the seven days before",
    MONTHLY: "Monthly, the 1st · the previous month",
};

export const WINDOW_PRESETS = ["today", "yesterday", "last7", "last30", "lastMonth", "monthToDate"] as const;
export type WindowPreset = (typeof WINDOW_PRESETS)[number];

export const WINDOW_PRESET_LABEL: Record<WindowPreset, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last7: "Last 7 days",
    last30: "Last 30 days",
    lastMonth: "Last month",
    monthToDate: "Month to date",
};

/** A preset, or a custom window of Indian days, inclusive, at most 366 apart. */
export type ReportWindow = { preset: WindowPreset } | { from: string; to: string };

export const MAX_WINDOW_DAYS = 366;

export const RUN_STATUSES = ["RUNNING", "READY", "FAILED"] as const;
export type ReportRunStatus = (typeof RUN_STATUSES)[number];

export const RUN_STATUS_META: Record<ReportRunStatus, StatusMeta> = {
    RUNNING: { label: "Running", tone: "info" },
    READY: { label: "Ready", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
};

export const SCHEDULE_STATUSES = ["ENABLED", "DISABLED"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const SCHEDULE_STATUS_META: Record<ScheduleStatus, StatusMeta> = {
    ENABLED: { label: "Active", tone: "success" },
    DISABLED: { label: "Paused", tone: "neutral" },
};

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

/** One filter a kind declares: free text, a record id, or one of a fixed set. */
export type ReportFilterDef =
    | { key: string; label: string; type: "string" }
    | { key: string; label: string; type: "id" }
    | { key: string; label: string; type: "enum"; values: string[] };

export interface ReportColumn {
    key: string;
    label: string;
    align?: "left" | "right";
}

/** One of the twelve — `GET /reports/catalogue`, no query function on the wire. */
export interface ReportKind {
    kind: string;
    name: string;
    description: string;
    filters: ReportFilterDef[];
    columns: ReportColumn[];
    /** G11-2: `{ [field]: label }`, for printing a stored filter by its label. Absent on a backend older than the field. */
    filterLabels?: Record<string, string>;
}

export interface ReportRun {
    id: string;
    scheduleId: string | null;
    kind: string;
    format: ReportFormat;
    status: ReportRunStatus;
    filters: Record<string, string> | null;
    fileId: string | null;
    rowCount: number | null;
    /** Clipped by the server; why a FAILED run failed. */
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
    /** Thirty days after the run; the file answers 410 past it. */
    expiresAt: string | null;
    requestedById: string | null;
    /** G11-2: how many addresses took the schedule's mail and when — null for a run by hand or one that failed. Absent on a backend older than the field. */
    mailedTo?: number | null;
    mailedAt?: string | null;
}

/** G13-B: a fixed date range a schedule renders instead of its cadence's own window — Indian days, inclusive, at most 366 apart. */
export interface FixedWindow {
    from: string;
    to: string;
}

/** The reserved key a schedule's fixed window sits under in its `filters` — never a filter a kind declares. */
export const SCHEDULE_WINDOW_KEY = "window";

/** A schedule's `filters` JSON: the kind's strings, plus (G13-B) the optional fixed window under the reserved key (`null` on a PATCH drops it). */
export type ScheduleFilters = Record<string, string | FixedWindow | null | undefined>;

/** The kind's own string filters off a schedule's `filters`, the window key left out. */
export function declaredFilters(filters: ScheduleFilters | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters ?? {})) {
        if (key !== SCHEDULE_WINDOW_KEY && typeof value === "string") out[key] = value;
    }
    return out;
}

/** The fixed window a schedule carries, if any — read leniently, the way the server reads it back. */
export function scheduleWindow(filters: ScheduleFilters | null | undefined): FixedWindow | null {
    const value = filters?.[SCHEDULE_WINDOW_KEY];
    if (!value || typeof value !== "object") return null;
    return typeof value.from === "string" && typeof value.to === "string" ? { from: value.from, to: value.to } : null;
}

/**
 * The `filters` a create sends: the declared strings and, with one set, the
 * window beside them. (A PATCH replaces the whole object, so
 * `schedulePatch` writes `window: null` to drop one.)
 */
export function scheduleFiltersBody(declared: Record<string, string>, window: FixedWindow | null): ScheduleFilters {
    return window ? { ...declared, [SCHEDULE_WINDOW_KEY]: window } : { ...declared };
}

export interface ReportSchedule {
    id: string;
    kind: string;
    name: string;
    cadence: ReportCadence;
    format: ReportFormat;
    /** Empty means every live ADMIN account with an email, resolved when the schedule fires. */
    recipients: string[];
    filters: ScheduleFilters | null;
    enabled: boolean;
    createdById: string;
    lastRunAt: string | null;
    /** The next 06:00 IST the cadence names; null while disabled. */
    nextRunAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/** One page of the designed-list contract. */
export interface ListPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

/**
 * G13-B: the tiles beside the runs page — READY runs started this Indian
 * week (Monday 00:00 IST), runs mailed this week by their `mailedAt`, and
 * the distinct addresses across the enabled schedules' recipient sets (an
 * empty set counting as every admin with an email).
 */
export interface RunsSummary {
    readyThisWeek: number;
    mailedThisWeek: number;
    uniqueRecipients: number;
}

/** `GET /reports/runs`: the page, with the summary beside it (absent on a server one release behind). */
export interface RunsPage extends ListPage<ReportRun> {
    summary?: RunsSummary;
}

/* ------------------------------------------------------------------ */
/* Queries and bodies                                                  */
/* ------------------------------------------------------------------ */

export interface RunsQuery {
    q?: string;
    status?: readonly ReportRunStatus[];
    sort?: "newest" | "oldest";
    kind?: string;
    scheduleId?: string;
    page?: number;
    pageSize?: number;
}

export interface SchedulesQuery {
    q?: string;
    status?: readonly ScheduleStatus[];
    sort?: "newest" | "oldest";
    kind?: string;
    page?: number;
    pageSize?: number;
}

function listQuery(query: { q?: string; status?: readonly string[]; sort?: string; kind?: string; scheduleId?: string; page?: number; pageSize?: number }): string {
    const params = new URLSearchParams();
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.sort) params.set("sort", query.sort);
    if (query.kind) params.set("kind", query.kind);
    if (query.scheduleId) params.set("scheduleId", query.scheduleId);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    return params.toString();
}

/** `?q=&status=&sort=&kind=&scheduleId=&page=&pageSize=` for `GET /reports/runs`, blanks left off. */
export const runsQuery = (query: RunsQuery = {}): string => listQuery(query);

/** The same shape for `GET /reports/schedules`. */
export const schedulesQuery = (query: SchedulesQuery = {}): string => listQuery(query);

export interface RunInput {
    kind: string;
    format: ReportFormat;
    filters: Record<string, string>;
    window: ReportWindow;
}

export interface ScheduleInput {
    kind: string;
    name: string;
    cadence: ReportCadence;
    format: ReportFormat;
    recipients: string[];
    /** The kind's strings, plus (G13-B) an optional `window: { from, to } | null`. */
    filters: ScheduleFilters;
    enabled: boolean;
}

export type SchedulePatch = Partial<Omit<ScheduleInput, "kind">>;

/**
 * The filters as the server takes them: only the keys the kind declares,
 * blanks dropped. A key the kind does not declare is left off here because
 * the server would refuse the whole run for it (400), and a form that
 * changed kind mid-way should not carry the last kind's filter along.
 */
export function filtersFor(kind: Pick<ReportKind, "filters"> | null | undefined, typed: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    if (!kind) return out;
    for (const def of kind.filters) {
        const value = typed[def.key]?.trim();
        if (value) out[def.key] = value;
    }
    return out;
}

/** The server's own refusals on a custom window, said before the round trip. */
export function windowProblem(window: ReportWindow): string | null {
    if ("preset" in window) return null;
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!day.test(window.from) || !day.test(window.to)) return "Both dates are needed, as YYYY-MM-DD.";
    if (window.from > window.to) return "The window's start is after its end.";
    if ((Date.parse(window.to) - Date.parse(window.from)) / 86_400_000 >= MAX_WINDOW_DAYS) return `A window spans at most ${MAX_WINDOW_DAYS} days.`;
    return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "a@x.in, b@y.in" → the list, lower-cased, deduplicated; a bad address is the problem named. */
export function parseRecipients(text: string): { recipients: string[]; problem: string | null } {
    const recipients: string[] = [];
    for (const raw of text.split(/[,\s;]+/)) {
        const address = raw.trim().toLowerCase();
        if (!address) continue;
        if (!EMAIL.test(address)) return { recipients: [], problem: `"${raw.trim()}" is not an email address.` };
        if (!recipients.includes(address)) recipients.push(address);
    }
    if (recipients.length > 20) return { recipients: [], problem: "At most 20 recipients." };
    return { recipients, problem: null };
}

/** The server's bounds on a schedule, said before the round trip. */
export function scheduleProblem(input: { name: string; recipientsText: string }): string | null {
    const name = input.name.trim();
    if (name.length < 3 || name.length > 120) return "The name is 3 to 120 characters.";
    return parseRecipients(input.recipientsText).problem;
}

/**
 * Only what moved, so a PATCH that changed nothing is not sent: the server
 * refuses an empty patch, audits the diff, and recomputes `nextRunAt` on a
 * cadence change or a re-enable.
 */
export function schedulePatch(before: ReportSchedule, next: Omit<ScheduleInput, "kind">): SchedulePatch {
    const patch: SchedulePatch = {};
    if (next.name.trim() !== before.name) patch.name = next.name.trim();
    if (next.cadence !== before.cadence) patch.cadence = next.cadence;
    if (next.format !== before.format) patch.format = next.format;
    if (next.recipients.join(",") !== before.recipients.join(",")) patch.recipients = next.recipients;
    /* G13-B: the declared strings and the fixed window are compared apart; a PATCH replaces the whole object, so a dropped window goes as null. */
    const declaredMoved = JSON.stringify(declaredFilters(next.filters)) !== JSON.stringify(declaredFilters(before.filters));
    const windowMoved = JSON.stringify(scheduleWindow(next.filters)) !== JSON.stringify(scheduleWindow(before.filters));
    if (declaredMoved || windowMoved) patch.filters = { ...declaredFilters(next.filters), [SCHEDULE_WINDOW_KEY]: scheduleWindow(next.filters) };
    if (next.enabled !== before.enabled) patch.enabled = next.enabled;
    return patch;
}

/** `bookings-gmv.csv` when the server named nothing. */
export const runFilename = (run: Pick<ReportRun, "kind" | "format">, named: string | null): string =>
    named ?? `${run.kind}.${run.format === "PDF" ? "pdf" : "csv"}`;

/** Whether Download is drawn: READY, with a file, and not yet past its thirty days. */
export function canDownload(run: ReportRun, now = new Date()): boolean {
    if (run.status !== "READY" || !run.fileId) return false;
    if (run.expiresAt && Date.parse(run.expiresAt) <= now.getTime()) return false;
    return true;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** These screens read the API or say they cannot; a seeded report would be a file nobody rendered. */
export const reportsReadApi = (): boolean => isLive("reports");

export const reportsService = {
    catalogue: () => http.get<ReportKind[]>("/reports/catalogue"),

    /**
     * Rendered in the request: 201 with the run READY (`fileId`, `rowCount`,
     * `expiresAt`), or 500 `REPORT_FAILED` with the run id and the error —
     * the run row says why. Audited `REPORT_RUN`.
     */
    run: (input: RunInput) => http.post<ReportRun>("/reports/run", input),

    /** The page under the list contract and, G13-B, the week's summary beside it. */
    runs: (query: RunsQuery = {}) => http.get<RunsPage>(`/reports/runs?${runsQuery(query)}`),

    runRecord: (id: string) => http.get<ReportRun>(`/reports/runs/${encodeURIComponent(id)}`),

    /**
     * The bytes as an attachment, through the blob helper — the admin token
     * is the guard here; the signed `?t=` link is the schedule's mail. 409
     * while RUNNING, 404 for FAILED, 410 past thirty days.
     */
    download: async (run: Pick<ReportRun, "id" | "kind" | "format">): Promise<{ filename: string; bytes: number }> => {
        const result = await http.blob(`/reports/runs/${encodeURIComponent(run.id)}/file`);
        const filename = runFilename(run, result.filename);
        saveBlob(result.blob, filename);
        return { filename, bytes: result.blob.size };
    },

    schedules: (query: SchedulesQuery = {}) => http.get<ListPage<ReportSchedule>>(`/reports/schedules?${schedulesQuery(query)}`),

    /** 201 with `nextRunAt` set. Audited `REPORT_SCHEDULE_CREATED`. */
    createSchedule: (input: ScheduleInput) => http.post<ReportSchedule>("/reports/schedules", input),

    /** Any subset; a cadence change or a re-enable recomputes `nextRunAt`. Audited with the diff. */
    updateSchedule: (id: string, patch: SchedulePatch) => http.patch<ReportSchedule>(`/reports/schedules/${encodeURIComponent(id)}`, patch),

    /** Audited `REPORT_SCHEDULE_DELETED`; past runs keep their files with the schedule id cleared. */
    deleteSchedule: (id: string) => http.delete<{ id: string; deleted: boolean }>(`/reports/schedules/${encodeURIComponent(id)}`),
};
