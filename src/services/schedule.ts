import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { Holiday } from "@/services/employees";
import type { StatusMeta } from "@/types";

/**
 * The staff diary — Lot E's `schedule` module (Q72/Q99), package CE3.
 *
 * ADX owns the entries: a meeting, a call, a day at the printer, put against
 * a person the registry knows — staff or agent, both assignable. The field
 * work of a person who is also an agent is never copied in; when the grid
 * asks for it (`include=visits,milestones,jobs`) and a person is selected,
 * the server overlays their visits, site visits and jobs in the window as
 * read-only rows, each with a link to where the console opens it.
 *
 * No fixture fallback. The seeded `SCH-*` entries named people by string
 * and carried no assignee id the registry knows, and the seeded log had a
 * "Clear all" the backend never had; both are gone. With the API off the
 * page says so.
 *
 * Three rules this file keeps:
 *
 * - The window is what the grid can see, and it is asked for on every
 *   navigation: `from` and `to` are the first and last day of the month on
 *   screen, well inside the API's 93-day ceiling.
 *
 * - Days are Indian days. An entry's `date` is a calendar day and arrives
 *   as one; an overlay row's `at` is an instant, and it is put on the day
 *   it names in Asia/Kolkata, because that is the calendar the server cut
 *   the window by.
 *
 * - The log is read, never cleared. The trail is the record of the diary,
 *   not part of it.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type ScheduleStatus = "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";

export const SCHEDULE_STATUSES: readonly ScheduleStatus[] = ["PENDING", "IN_PROGRESS", "PAUSED", "COMPLETED"];

export const SCHEDULE_STATUS_META: Record<ScheduleStatus, StatusMeta> = {
    PENDING: { label: "Pending", tone: "neutral" },
    IN_PROGRESS: { label: "In progress", tone: "info" },
    PAUSED: { label: "Paused", tone: "warning" },
    COMPLETED: { label: "Completed", tone: "success" },
};

export const scheduleStatusMeta = (status: string): StatusMeta =>
    SCHEDULE_STATUS_META[status as ScheduleStatus] ?? { label: status, tone: "neutral" };

export type OverlayKind = "FIELD_VISIT" | "SITE_VISIT" | "JOB";

export const OVERLAY_KIND_META: Record<OverlayKind, StatusMeta> = {
    FIELD_VISIT: { label: "Field visit", tone: "warning" },
    SITE_VISIT: { label: "Site visit", tone: "info" },
    JOB: { label: "Job", tone: "info" },
};

export const overlayKindMeta = (kind: string): StatusMeta =>
    OVERLAY_KIND_META[kind as OverlayKind] ?? { label: kind, tone: "neutral" };

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/** One diary row, exactly as every schedule route sends it. */
export interface ScheduleEntry {
    id: string;
    /** YYYY-MM-DD. */
    date: string;
    /** HH:mm. */
    startTime: string;
    endTime: string | null;
    title: string;
    notes: string | null;
    assigneeUserId: string;
    /** E10-1: the assignee by name on the window read, active or not — an entry against a person who has left still says who. */
    assignee?: UserLabel;
    department: string | null;
    status: ScheduleStatus | string;
    createdByUserId: string;
    createdAt: string;
    updatedAt: string;
}

/** A person by id and name; the name is null for an account the platform no longer has. */
export interface UserLabel {
    id: string;
    name: string | null;
}

/** A read-only row from the field: the agent's own tables, folded by the server. */
export interface OverlayRow {
    kind: OverlayKind | string;
    id: string;
    title: string;
    where: string | null;
    /** ISO instant, or null for a site visit with no slot yet. */
    at: string | null;
    status: string;
    /** Where the backend says the console opens it: `/visits/:id`, `/orders/:orderId/milestones/:id`, `/orders/:id`. */
    link: string;
    outcome?: string | null;
    visitKind?: string;
    campaignTag?: string | null;
}

/** `GET /schedule` — the window. */
export interface ScheduleWindow {
    from: string;
    to: string;
    entries: ScheduleEntry[];
    holidays: Holiday[];
    overlay: OverlayRow[];
}

/** One row of `GET /schedule/log`. */
export interface ScheduleLogRow {
    id: string;
    action: string;
    targetId: string | null;
    at: string;
    actor: { id: string; name: string | null };
    /** E10-1: the person `metadata.assigneeUserId` names, or null when the row names nobody. */
    assignee?: UserLabel | null;
    diff: Record<string, { before: unknown; after: unknown }> | null;
    metadata: Record<string, unknown> | null;
}

export interface ScheduleLogPage {
    items: ScheduleLogRow[];
    total: number;
    page: number;
    pageSize: number;
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

/** `2026-08-05` from parts; month is 0-based like `Date`. */
export const isoDay = (year: number, month0: number, day: number): string =>
    `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The first and last calendar day of a month: the window the grid asks for. */
export function monthRange(year: number, month0: number): { from: string; to: string } {
    const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
    return { from: isoDay(year, month0, 1), to: isoDay(year, month0, last) };
}

/** The Indian day an instant falls on, as YYYY-MM-DD. */
export function istDayOf(iso: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(iso));
}

/** HH:mm in the Indian day, for an overlay row's slot. */
export function istTimeOf(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(iso));
}

/** The year and 0-based month of a YYYY-MM-DD, for the grid's view state. */
export function monthOf(isoDate: string): { year: number; month: number } {
    const [year, month] = isoDate.split("-").map(Number);
    return { year, month: month - 1 };
}

/** "Monday 10 August", from the calendar day alone. */
export function prettyDay(isoDate: string): string {
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
        new Date(Date.UTC(year, month - 1, day)),
    );
}

/** The diary's entries on one day, earliest first. */
export function entriesOn(window: Pick<ScheduleWindow, "entries">, day: string): ScheduleEntry[] {
    return window.entries
        .filter((entry) => entry.date === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
}

/**
 * The field rows on one day, earliest first; an unslotted row (a site visit
 * that is due but not booked) has no day and is drawn on none.
 */
export function overlayOn(window: Pick<ScheduleWindow, "overlay">, day: string): OverlayRow[] {
    return window.overlay
        .filter((row) => row.at !== null && istDayOf(row.at) === day)
        .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

/** The days that carry anything — an entry or a field row — for the grid's dots. */
export function busyDays(window: Pick<ScheduleWindow, "entries" | "overlay">): Set<string> {
    const days = new Set<string>();
    for (const entry of window.entries) days.add(entry.date);
    for (const row of window.overlay) if (row.at) days.add(istDayOf(row.at));
    return days;
}

/** The holidays keyed by day, so a cell can be shaded and named in one lookup. */
export function holidaysByDay(window: Pick<ScheduleWindow, "holidays">): Map<string, Holiday[]> {
    const byDay = new Map<string, Holiday[]>();
    for (const holiday of window.holidays) {
        const list = byDay.get(holiday.date) ?? [];
        list.push(holiday);
        byDay.set(holiday.date, list);
    }
    return byDay;
}

/**
 * Where the console opens an overlay row.
 *
 * The backend's link names the record's own address (`/visits/:id`,
 * `/orders/:orderId/milestones/:id`, `/orders/:id`); the console has an
 * order page but no visit or milestone page, so a field visit opens the
 * dispatch board and a site visit opens the order it belongs to.
 */
export function overlayHref(row: Pick<OverlayRow, "kind" | "link" | "id">): string {
    if (row.kind === "FIELD_VISIT") return "/visits";
    const order = /^\/orders\/([^/?#]+)/.exec(row.link);
    if (order) return `/orders/${order[1]}`;
    return row.link;
}

/** "09:00 – 10:30", or "09:00" when the entry has no end. */
export function entrySlot(entry: Pick<ScheduleEntry, "startTime" | "endTime">): string {
    return entry.endTime ? `${entry.startTime} – ${entry.endTime}` : entry.startTime;
}

/* ------------------------------------------------------------------ */
/* The log                                                             */
/* ------------------------------------------------------------------ */

export interface LogLine {
    id: string;
    /** The entry's title as the metadata recorded it, or the target id. */
    entry: string;
    /** "created", "updated", "deleted" — or the status word when that is what moved. */
    action: string;
    /** What changed, in a sentence, or the day for a create/delete. */
    detail: string;
    actor: string;
    at: string;
    tone: "info" | "warning" | "success" | "danger" | "neutral";
}

const ACTION_WORD: Record<string, string> = {
    SCHEDULE_ENTRY_CREATED: "created",
    SCHEDULE_ENTRY_UPDATED: "updated",
    SCHEDULE_ENTRY_DELETED: "deleted",
};

const FIELD_WORD: Record<string, string> = {
    date: "day",
    startTime: "start",
    endTime: "end",
    title: "title",
    assigneeUserId: "assignee",
    department: "department",
    status: "status",
};

const text = (value: unknown): string => (value === null || value === undefined || value === "" ? "—" : String(value));

/**
 * Every person the window and the log name, by user id — E10-1.
 *
 * The entries carry `assignee { id, name }` and the log rows carry the
 * person each was written against, active or not, so an entry or a change
 * against somebody who has since left is still named without the registry
 * listing them. The registry's labels are folded in first; a server name
 * wins over a fallback label, and a null name is skipped rather than
 * blanking a name another row supplied.
 */
export function assigneeNames(
    diary: Pick<ScheduleWindow, "entries"> | null,
    log: Pick<ScheduleLogPage, "items"> | null,
    registry: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
    const names = new Map(registry);
    const add = (label: UserLabel | null | undefined) => {
        const name = label?.name?.trim();
        if (label && name) names.set(label.id, name);
    };
    for (const entry of diary?.entries ?? []) add(entry.assignee);
    for (const row of log?.items ?? []) add(row.assignee);
    return names;
}

/**
 * One audit row as the change log draws it.
 *
 * An update whose diff is only the status reads as that status ("completed",
 * "paused") the way the frame's log does; any other update lists the fields
 * that moved. A name in the diff is a user id — the row's own `assignee`
 * (E10-1) names the person it was written against, and the caller's map
 * names the rest.
 */
export function logLine(row: ScheduleLogRow, names: ReadonlyMap<string, string> = new Map()): LogLine {
    const metadata = row.metadata ?? {};
    const entry = typeof metadata.title === "string" && metadata.title ? metadata.title : (row.targetId ?? "Entry");
    const day = typeof metadata.date === "string" ? prettyDay(metadata.date) : null;
    const actor = row.actor.name?.trim() || names.get(row.actor.id) || row.actor.id;
    const base = { id: row.id, entry, actor, at: row.at };
    const nameOf = (id: string): string =>
        (row.assignee && row.assignee.id === id && row.assignee.name?.trim()) || names.get(id) || id;

    if (row.action === "SCHEDULE_ENTRY_CREATED") {
        return { ...base, action: "created", detail: day ? `Added to ${day}.` : "Added to the diary.", tone: "info" };
    }
    if (row.action === "SCHEDULE_ENTRY_DELETED") {
        return { ...base, action: "deleted", detail: day ? `Removed from ${day}.` : "Removed from the diary.", tone: "danger" };
    }

    const diff = row.diff ?? {};
    const fields = Object.keys(diff);
    const statusChange = diff.status;
    if (fields.length === 1 && statusChange) {
        const to = String(statusChange.after);
        return {
            ...base,
            action: scheduleStatusMeta(to).label.toLowerCase(),
            detail: `Previously ${scheduleStatusMeta(String(statusChange.before)).label.toLowerCase()}.`,
            tone: to === "COMPLETED" ? "success" : to === "PAUSED" ? "warning" : "info",
        };
    }
    const changes = fields.map((field) => {
        const change = diff[field];
        const before = field === "assigneeUserId" ? nameOf(text(change.before)) : text(change.before);
        const after = field === "assigneeUserId" ? nameOf(text(change.after)) : text(change.after);
        return `${FIELD_WORD[field] ?? field} ${before} → ${after}`;
    });
    return {
        ...base,
        action: ACTION_WORD[row.action] ?? row.action.toLowerCase(),
        detail: changes.length ? `${changes.join(", ")}.` : "No field changed.",
        tone: "warning",
    };
}

/* ------------------------------------------------------------------ */
/* Queries and bodies                                                  */
/* ------------------------------------------------------------------ */

export interface ScheduleQuery {
    from: string;
    to: string;
    assigneeUserId?: string;
    /** Which of the three tables to overlay; nothing means no overlay. */
    include?: readonly ("visits" | "milestones" | "jobs")[];
}

export const ALL_OVERLAYS = ["visits", "milestones", "jobs"] as const;

/** `?from&to&assigneeUserId&include=` exactly as `scheduleQuerySchema` parses it. */
export function buildScheduleQuery(query: ScheduleQuery): string {
    const params = new URLSearchParams();
    params.set("from", query.from);
    params.set("to", query.to);
    if (query.assigneeUserId) params.set("assigneeUserId", query.assigneeUserId);
    if (query.include?.length) params.set("include", query.include.join(","));
    return params.toString();
}

export interface CreateEntryInput {
    date: string;
    startTime: string;
    endTime?: string;
    title: string;
    notes?: string;
    assigneeUserId: string;
    department?: string;
}

/** Any field; `endTime: null` clears the end, `department: null` clears it. An empty patch is 400. */
export interface PatchEntryInput {
    date?: string;
    startTime?: string;
    endTime?: string | null;
    title?: string;
    notes?: string | null;
    assigneeUserId?: string;
    department?: string | null;
    status?: ScheduleStatus;
}

export interface EntryForm {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    notes: string;
    assigneeUserId: string;
    department: string;
}

/** The create body from the dialog: blanks left off, the API's own trims applied. */
export function createBody(form: EntryForm): CreateEntryInput {
    return {
        date: form.date,
        startTime: form.startTime,
        ...(form.endTime ? { endTime: form.endTime } : {}),
        title: form.title.trim(),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        assigneeUserId: form.assigneeUserId,
        ...(form.department.trim() ? { department: form.department.trim() } : {}),
    };
}

/** The patch from the edit dialog: only what moved; a cleared end or department goes as null. */
export function entryPatch(current: ScheduleEntry, form: EntryForm): PatchEntryInput | null {
    const patch: PatchEntryInput = {};
    if (form.date !== current.date) patch.date = form.date;
    if (form.startTime !== current.startTime) patch.startTime = form.startTime;
    if ((form.endTime || null) !== current.endTime) patch.endTime = form.endTime || null;
    const title = form.title.trim();
    if (title && title !== current.title) patch.title = title;
    if ((form.notes.trim() || null) !== current.notes) patch.notes = form.notes.trim() || null;
    if (form.assigneeUserId && form.assigneeUserId !== current.assigneeUserId) patch.assigneeUserId = form.assigneeUserId;
    if ((form.department.trim() || null) !== current.department) patch.department = form.department.trim() || null;
    return Object.keys(patch).length ? patch : null;
}

/** What the dialog validates before anything goes on the wire. */
export function entryFormError(form: EntryForm): string | null {
    if (!form.title.trim()) return "Give the entry a title.";
    if (!form.assigneeUserId) return "Pick who it is for.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return "Pick a day.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime)) return "Pick a start time.";
    if (form.endTime && form.endTime <= form.startTime) return "The end is not after the start.";
    return null;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to — the diary fixtures are gone — so a request that would have
 * gone out stops here instead.
 */
function live() {
    if (!isLive("schedule")) throw new Error("The schedule reads the API; connect the console to the ADX backend first.");
    return http;
}

export const scheduleService = {
    /** The window: entries (each with its assignee by name, E10-1), the holidays to shade, and the overlay when a person is selected and asked for. */
    window: async (query: ScheduleQuery): Promise<ScheduleWindow> => {
        const window = await live().get<ScheduleWindow>(`/schedule?${buildScheduleQuery(query)}`);
        return {
            from: window.from,
            to: window.to,
            entries: window.entries ?? [],
            holidays: window.holidays ?? [],
            overlay: window.overlay ?? [],
        };
    },

    /** The trail over the window's Indian days, newest first; E10-1: each row names the person it was written against. There is no delete. */
    log: async (from: string, to: string, page = 1, pageSize = 50): Promise<ScheduleLogPage> => {
        const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(pageSize) });
        const result = await live().get<ScheduleLogPage>(`/schedule/log?${params.toString()}`);
        return { items: result.items ?? [], total: result.total, page: result.page, pageSize: result.pageSize };
    },

    /** 201; 404 when the assignee is nobody the registry knows. */
    create: (input: CreateEntryInput): Promise<ScheduleEntry> => live().post<ScheduleEntry>("/schedule", input),

    update: (id: string, patch: PatchEntryInput): Promise<ScheduleEntry> =>
        live().patch<ScheduleEntry>(`/schedule/${encodeURIComponent(id)}`, patch),

    setStatus: (id: string, status: ScheduleStatus): Promise<ScheduleEntry> =>
        live().patch<ScheduleEntry>(`/schedule/${encodeURIComponent(id)}`, { status }),

    remove: (id: string): Promise<{ message: string }> =>
        live().delete<{ message: string }>(`/schedule/${encodeURIComponent(id)}`),
};
