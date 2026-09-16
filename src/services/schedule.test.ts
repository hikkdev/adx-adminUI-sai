import { describe, expect, it } from "vitest";

import {
    assigneeNames,
    buildScheduleQuery,
    busyDays,
    createBody,
    entriesOn,
    entryFormError,
    entryPatch,
    holidaysByDay,
    istDayOf,
    logLine,
    monthRange,
    overlayHref,
    overlayOn,
    type EntryForm,
    type ScheduleEntry,
    type ScheduleLogRow,
    type ScheduleWindow,
} from "./schedule";

/**
 * The staff diary — Lot E's `schedule` module, package CE3.
 *
 * What this file pins is the range and the overlay shaping, not a layout:
 *
 * 1. The window is the month on screen, first day to last, and the query
 *    carries the person and the overlay tables only when a person is
 *    picked — the server refuses to overlay for everybody, and the console
 *    does not ask it to.
 *
 * 2. Overlay rows are put on Indian days. `at` is an instant; a visit at
 *    20:30 UTC is the next morning in Asia/Kolkata and lands there, and an
 *    unslotted row lands nowhere.
 *
 * 3. Each overlay row opens where the console can take it: a field visit
 *    the dispatch board, a site visit or a job the order it belongs to.
 *
 * 4. The log reads the audit row: a status-only diff is that status, any
 *    other update names the fields, and a create or delete names the day.
 *
 * 5. E10-1: every assignee is named by the rows themselves — the entries'
 *    and the log rows' `assignee { id, name }` — so a person who has left
 *    the registry is still named, and a row's own name outranks a label
 *    guessed from elsewhere.
 */

const entry = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
    id: "cld_sch_1",
    date: "2026-09-14",
    startTime: "10:00",
    endTime: "11:00",
    title: "Client onboarding call",
    notes: null,
    assigneeUserId: "cld_user_1",
    department: "Operations",
    status: "PENDING",
    createdByUserId: "cld_admin",
    createdAt: "2026-09-13T04:00:00.000Z",
    updatedAt: "2026-09-13T04:00:00.000Z",
    ...over,
});

const diary = (over: Partial<ScheduleWindow> = {}): ScheduleWindow => ({
    from: "2026-09-01",
    to: "2026-09-30",
    entries: [],
    holidays: [],
    overlay: [],
    ...over,
});

describe("the range", () => {
    it("asks for the whole month on screen, first day to last, leap years included", () => {
        expect(monthRange(2026, 8)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
        expect(monthRange(2028, 1)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
        expect(monthRange(2026, 11)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    });

    it("sends the person and the overlay tables only when a person is picked", () => {
        expect(buildScheduleQuery({ from: "2026-09-01", to: "2026-09-30" })).toBe("from=2026-09-01&to=2026-09-30");
        expect(
            buildScheduleQuery({ from: "2026-09-01", to: "2026-09-30", assigneeUserId: "cld_user_1", include: ["visits", "milestones", "jobs"] }),
        ).toBe("from=2026-09-01&to=2026-09-30&assigneeUserId=cld_user_1&include=visits%2Cmilestones%2Cjobs");
    });
});

describe("the overlay — days", () => {
    const window = diary({
        entries: [entry(), entry({ id: "cld_sch_2", startTime: "09:00", title: "Stand-up" })],
        overlay: [
            { kind: "FIELD_VISIT", id: "v1", title: "Onboarding · Sri Balaji Sweets", where: "Jayanagar", at: "2026-09-14T04:30:00.000Z", status: "SCHEDULED", link: "/visits/v1" },
            // 20:30 UTC on the 14th is 02:00 on the 15th in Asia/Kolkata.
            { kind: "JOB", id: "o1", title: "Install · Nykaa", where: null, at: "2026-09-14T20:30:00.000Z", status: "ASSIGNED", link: "/orders/o1" },
            { kind: "SITE_VISIT", id: "m1", title: "Site check", where: null, at: null, status: "PENDING", link: "/orders/o2/milestones/m1" },
        ],
    });

    it("puts an instant on the Indian day it falls in", () => {
        expect(istDayOf("2026-09-14T20:30:00.000Z")).toBe("2026-09-15");
        expect(istDayOf("2026-09-14T04:30:00.000Z")).toBe("2026-09-14");
    });

    it("draws a day's field rows beside its entries, earliest first, and an unslotted row on no day", () => {
        expect(overlayOn(window, "2026-09-14").map((row) => row.id)).toEqual(["v1"]);
        expect(overlayOn(window, "2026-09-15").map((row) => row.id)).toEqual(["o1"]);
        expect(entriesOn(window, "2026-09-14").map((row) => row.title)).toEqual(["Stand-up", "Client onboarding call"]);
        expect(overlayOn(window, "2026-09-16")).toEqual([]);
    });

    it("marks every day that carries an entry or a field row", () => {
        expect([...busyDays(window)].sort()).toEqual(["2026-09-14", "2026-09-15"]);
    });

    it("keys the holidays by day so the grid can shade them", () => {
        const byDay = holidaysByDay(diary({ holidays: [{ id: "h", date: "2026-09-04", name: "Janmashtami", region: null }] }));
        expect(byDay.get("2026-09-04")?.[0].name).toBe("Janmashtami");
        expect(byDay.has("2026-09-05")).toBe(false);
    });
});

describe("the overlay — links", () => {
    it("opens a field visit on the board and a site visit or job on its order", () => {
        expect(overlayHref({ kind: "FIELD_VISIT", id: "v1", link: "/visits/v1" })).toBe("/visits");
        expect(overlayHref({ kind: "SITE_VISIT", id: "m1", link: "/orders/o2/milestones/m1" })).toBe("/orders/o2");
        expect(overlayHref({ kind: "JOB", id: "o1", link: "/orders/o1" })).toBe("/orders/o1");
    });

    it("passes an unknown link through rather than inventing one", () => {
        expect(overlayHref({ kind: "SOMETHING", id: "x", link: "/somewhere/x" })).toBe("/somewhere/x");
    });
});

describe("the bodies", () => {
    const form: EntryForm = {
        title: "  Client onboarding call ",
        date: "2026-09-14",
        startTime: "10:00",
        endTime: "",
        notes: "  ",
        assigneeUserId: "cld_user_1",
        department: "",
    };

    it("leaves blanks off a create and trims the rest", () => {
        expect(createBody(form)).toEqual({ date: "2026-09-14", startTime: "10:00", title: "Client onboarding call", assigneeUserId: "cld_user_1" });
        expect(createBody({ ...form, endTime: "11:00", notes: "bring the deck", department: "Operations" })).toMatchObject({
            endTime: "11:00",
            notes: "bring the deck",
            department: "Operations",
        });
    });

    it("patches only what moved, clearing an end or a department with null", () => {
        const current = entry();
        expect(entryPatch(current, { ...form, title: "Client onboarding call", department: "Operations", endTime: "11:00" })).toBeNull();
        expect(entryPatch(current, { ...form, title: "Client onboarding call" })).toEqual({ endTime: null, department: null });
        expect(entryPatch(current, { ...form, title: "Renamed", endTime: "11:00", department: "Operations", assigneeUserId: "cld_user_2" })).toEqual({
            title: "Renamed",
            assigneeUserId: "cld_user_2",
        });
    });

    it("refuses what the server would refuse before anything goes on the wire", () => {
        expect(entryFormError(form)).toBeNull();
        expect(entryFormError({ ...form, title: " " })).toBe("Give the entry a title.");
        expect(entryFormError({ ...form, assigneeUserId: "" })).toBe("Pick who it is for.");
        expect(entryFormError({ ...form, endTime: "09:30" })).toBe("The end is not after the start.");
    });
});

describe("the log", () => {
    const row = (over: Partial<ScheduleLogRow> = {}): ScheduleLogRow => ({
        id: "log_1",
        action: "SCHEDULE_ENTRY_UPDATED",
        targetId: "cld_sch_1",
        at: "2026-09-13T04:12:00.000Z",
        actor: { id: "cld_admin", name: "Priya Rao" },
        diff: null,
        metadata: { title: "Client onboarding call", date: "2026-09-14" },
        ...over,
    });

    it("reads a status-only update as that status, the way the frame's log does", () => {
        const line = logLine(row({ diff: { status: { before: "IN_PROGRESS", after: "COMPLETED" } } }));
        expect(line.action).toBe("completed");
        expect(line.detail).toBe("Previously in progress.");
        expect(line.tone).toBe("success");
        expect(line.entry).toBe("Client onboarding call");
        expect(line.actor).toBe("Priya Rao");
    });

    it("names the fields on any other update, with the registry naming an assignee", () => {
        const names = new Map([["cld_user_1", "Asha Rao"], ["cld_user_2", "Bina"]]);
        const line = logLine(row({ diff: { startTime: { before: "10:00", after: "11:00" }, assigneeUserId: { before: "cld_user_1", after: "cld_user_2" } } }), names);
        expect(line.action).toBe("updated");
        expect(line.detail).toBe("start 10:00 → 11:00, assignee Asha Rao → Bina.");
    });

    it("names the day on a create and a delete", () => {
        expect(logLine(row({ action: "SCHEDULE_ENTRY_CREATED" }))).toMatchObject({ action: "created", detail: "Added to Monday 14 September.", tone: "info" });
        expect(logLine(row({ action: "SCHEDULE_ENTRY_DELETED" }))).toMatchObject({ action: "deleted", detail: "Removed from Monday 14 September.", tone: "danger" });
    });

    it("falls back to the target id and the actor id when the row carries no names", () => {
        const line = logLine(row({ metadata: null, actor: { id: "cld_admin", name: null } }));
        expect(line.entry).toBe("cld_sch_1");
        expect(line.actor).toBe("cld_admin");
    });

    it("names the person the row was written against from its own assignee, with nobody in the registry", () => {
        const line = logLine(
            row({
                assignee: { id: "cld_user_2", name: "Bina Shah" },
                diff: { assigneeUserId: { before: "cld_user_1", after: "cld_user_2" } },
            }),
        );
        expect(line.detail).toBe("assignee cld_user_1 → Bina Shah.");
    });

    it("prefers the row's own name over the registry's label and keeps the id for a nameless account", () => {
        const names = new Map([["cld_user_2", "B. Shah (registry)"]]);
        const named = logLine(row({ assignee: { id: "cld_user_2", name: "Bina Shah" }, diff: { assigneeUserId: { before: "cld_user_1", after: "cld_user_2" } } }), names);
        expect(named.detail).toBe("assignee cld_user_1 → Bina Shah.");
        const nameless = logLine(row({ assignee: { id: "cld_user_2", name: null }, diff: { assigneeUserId: { before: "cld_user_1", after: "cld_user_2" } } }));
        expect(nameless.detail).toBe("assignee cld_user_1 → cld_user_2.");
    });
});

describe("assigneeNames — E10-1", () => {
    const logRow = (over: Partial<ScheduleLogRow> = {}): ScheduleLogRow => ({
        id: "log_1",
        action: "SCHEDULE_ENTRY_CREATED",
        targetId: "cld_sch_1",
        at: "2026-09-13T04:12:00.000Z",
        actor: { id: "cld_admin", name: "Priya Rao" },
        diff: null,
        metadata: { title: "Call", date: "2026-09-14", assigneeUserId: "cld_user_3" },
        ...over,
    });

    it("names every assignee the window and the log carry, inactive people included", () => {
        const names = assigneeNames(
            diary({
                entries: [
                    entry({ assignee: { id: "cld_user_1", name: "Asha Rao" } }),
                    entry({ id: "cld_sch_2", assigneeUserId: "cld_user_9", assignee: { id: "cld_user_9", name: "Left Lastyear" } }),
                ],
            }),
            { items: [logRow({ assignee: { id: "cld_user_3", name: "Chirag" } }), logRow({ id: "log_2", assignee: null })] },
        );
        expect([...names.entries()]).toEqual([
            ["cld_user_1", "Asha Rao"],
            ["cld_user_9", "Left Lastyear"],
            ["cld_user_3", "Chirag"],
        ]);
    });

    it("folds the registry in first and lets a row's name win, without a null name blanking a known one", () => {
        const registry = new Map([
            ["cld_user_1", "A. Rao"],
            ["cld_user_2", "Bina"],
        ]);
        const names = assigneeNames(
            diary({
                entries: [
                    entry({ assignee: { id: "cld_user_1", name: "Asha Rao" } }),
                    entry({ id: "cld_sch_2", assigneeUserId: "cld_user_2", assignee: { id: "cld_user_2", name: null } }),
                ],
            }),
            null,
            registry,
        );
        expect(names.get("cld_user_1")).toBe("Asha Rao");
        expect(names.get("cld_user_2")).toBe("Bina");
        expect(registry.get("cld_user_1")).toBe("A. Rao");
    });

    it("copes with a window older than the join — no assignee on the rows — and with nothing loaded", () => {
        expect(assigneeNames(diary({ entries: [entry()] }), null).size).toBe(0);
        expect(assigneeNames(null, null).size).toBe(0);
    });
});
