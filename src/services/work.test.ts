import { describe, expect, it } from "vitest";
import type { AuditRow } from "@/services/audit";
import {
    EMPTY_WIZARD,
    activeCount,
    buildIssuesQuery,
    buildProjectsQuery,
    buildTasksQuery,
    canReview,
    createTaskBody,
    editFormOf,
    linkedHref,
    monthLabel,
    needsReason,
    recurrenceLabel,
    scheduleNote,
    statusSplit,
    statusTargets,
    taskHistory,
    taskPatch,
    wizardStepError,
    type WorkTaskDetail,
} from "./work";

/**
 * Lot AA — the console side of the `work` module (package AA-C).
 *
 * What is pinned: the queries go on the wire exactly as the backend's
 * schemas parse them (a chip list as csv, blanks left off); the wizard's
 * POST is the create body with nothing invented; the edit patch is only
 * what moved, a cleared field as null, and never a parent's progress; the
 * status menu offers the moves the module's table allows and nothing
 * else; the review bar shows to a reviewer or `work.approve` while under
 * review; and the History tab is drawn from audit diffs — a status move
 * and a date change both — with no baseline rows, because there are none.
 */

const detail = (overrides: Partial<WorkTaskDetail> = {}): WorkTaskDetail => ({
    id: "tsk_1",
    displayId: "TSK-000001",
    title: "Audit the metro stations",
    description: "Every platform, both lines.",
    status: "IN_PROGRESS",
    priority: "HIGH",
    progress: 40,
    startDate: "2026-09-01T00:00:00.000Z",
    deadline: "2026-09-30T18:29:59.999Z",
    actualStartDate: "2026-09-02T04:00:00.000Z",
    revisedEndDate: null,
    completedAt: null,
    effortEstimateH: 40,
    recurrence: null,
    tags: ["audit", "mumbai"],
    blockedReason: null,
    overdue: false,
    blockedByIssue: false,
    childrenAllVerified: false,
    createdBy: { userId: "usr_ops", name: "Ops", kind: "EMPLOYEE", role: "Ops manager", departmentName: "Operations" },
    assignedBy: null,
    project: { id: "prj_1", displayId: "PRJ-0001", name: "Mumbai launch", kind: "REGION" },
    parent: null,
    children: [],
    assignees: [{ userId: "usr_a", name: "Asha", kind: "EMPLOYEE", role: "Field lead", departmentName: "Operations" }],
    reviewers: [{ userId: "usr_r", name: "Ravi", kind: "EMPLOYEE", role: "Head of ops", departmentName: "Operations", approver: true, approvedAt: null, rejectedAt: null, note: null }],
    prerequisites: [],
    dependents: [],
    comments: [],
    timeLogs: { rows: [], totals: { hours: 0, billableHours: 0 } },
    issues: [],
    linked: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
});

describe("the queries", () => {
    it("serialises the task facets the way tasksQuerySchema parses them, blanks left off", () => {
        expect(buildTasksQuery({ status: ["TODO", "BLOCKED"], priority: "HIGH", assigneeUserId: "usr_a", overdue: true, sort: "DEADLINE", dir: "asc", page: 2, pageSize: 50 })).toBe(
            "status=TODO%2CBLOCKED&priority=HIGH&assigneeUserId=usr_a&overdue=true&sort=DEADLINE&dir=asc&page=2&pageSize=50",
        );
        expect(buildTasksQuery({ q: "  ", overdue: false })).toBe("");
        /* The linked pair goes together or not at all. */
        expect(buildTasksQuery({ linkedKind: "ORDER" })).toBe("");
        expect(buildTasksQuery({ linkedKind: "ORDER", linkedId: "ord_1" })).toBe("linkedKind=ORDER&linkedId=ord_1");
    });

    it("serialises the issue and project facets under the list contract", () => {
        expect(buildIssuesQuery({ status: ["OPEN", "IN_PROGRESS"], severity: "CRITICAL", projectId: "prj_1", sort: "severity", pageSize: 100 })).toBe(
            "status=OPEN%2CIN_PROGRESS&severity=CRITICAL&projectId=prj_1&sort=severity&pageSize=100",
        );
        expect(buildProjectsQuery({ cityId: "city_1", status: ["ACTIVE"], sort: "name" })).toBe("status=ACTIVE&cityId=city_1&sort=name");
    });
});

describe("the wizard's POST body", () => {
    it("is the create body with blanks left off and the recurrence folded from the form", () => {
        const body = createTaskBody({
            ...EMPTY_WIZARD,
            title: "  Audit the metro stations ",
            description: "",
            projectId: "prj_1",
            priority: "HIGH",
            status: "TODO",
            startDate: "2026-09-01",
            deadline: "2026-09-30",
            effort: "40",
            frequency: "WEEKLY",
            occursOn: ["Mon", "Thu"],
            recurrenceEnd: "2026-12-31",
            totalOccurrences: "",
            linkedKind: "CITY",
            linkedId: "city_1",
            tags: ["audit", " mumbai "],
            assigneeIds: ["usr_a", "usr_b"],
            reviewers: [{ userId: "usr_r", approver: true }],
            prerequisiteIds: ["tsk_0"],
        });
        expect(body).toEqual({
            title: "Audit the metro stations",
            projectId: "prj_1",
            priority: "HIGH",
            status: "TODO",
            startDate: "2026-09-01",
            deadline: "2026-09-30",
            effortEstimateH: 40,
            linkedKind: "CITY",
            linkedId: "city_1",
            recurrence: { frequency: "WEEKLY", occursOn: "Mon, Thu", endDate: "2026-12-31" },
            tags: ["audit", "mumbai"],
            assigneeUserIds: ["usr_a", "usr_b"],
            reviewers: [{ userId: "usr_r", approver: true }],
            prerequisiteIds: ["tsk_0"],
        });
        expect(body).not.toHaveProperty("description");
        expect(body).not.toHaveProperty("parentTaskId");
    });

    it("leaves a half-picked link off and validates each step before the wire", () => {
        const body = createTaskBody({ ...EMPTY_WIZARD, title: "Call the printer", linkedKind: "ORDER", linkedId: "", assigneeIds: ["usr_a"] });
        expect(body).not.toHaveProperty("linkedKind");
        expect(body.recurrence).toBeUndefined();
        expect(wizardStepError({ ...EMPTY_WIZARD, title: "ab" }, 0)).toBe("Give the task a title.");
        expect(wizardStepError({ ...EMPTY_WIZARD, title: "Call", linkedKind: "ORDER" }, 0)).toMatch(/clear the link/);
        expect(wizardStepError({ ...EMPTY_WIZARD, startDate: "2026-09-10", deadline: "2026-09-01" }, 1)).toMatch(/on or after/);
        expect(wizardStepError({ ...EMPTY_WIZARD, frequency: "DAILY" }, 1)).toMatch(/needs a deadline/);
        expect(wizardStepError(EMPTY_WIZARD, 2)).toBe("Pick at least one assignee.");
        expect(wizardStepError({ ...EMPTY_WIZARD, assigneeIds: ["usr_a"] }, 2)).toBeNull();
    });
});

describe("the edit patch", () => {
    it("is only what moved; a cleared estimate goes as null; a parent's progress is never sent", () => {
        const task = detail({ children: [{ id: "c1", displayId: null, title: "Platform 1", status: "TODO", progress: 0, deadline: null }] });
        const form = editFormOf(task);
        expect(form.deadline).toBe("2026-09-30");
        expect(taskPatch(task, form)).toBeNull();
        expect(taskPatch(task, { ...form, title: "Audit every station", effort: "", progress: "90", tags: "audit, mumbai, q3" })).toEqual({
            title: "Audit every station",
            effortEstimateH: null,
            tags: ["audit", "mumbai", "q3"],
        });
    });

    it("sends a recurrence, a link and a date as the backend takes them, null to clear", () => {
        const task = detail({ recurrence: { frequency: "WEEKLY", occursOn: "Mon", occurrence: 2 }, linked: { kind: "CITY", id: "city_1", label: "Mumbai" } });
        const form = editFormOf(task);
        expect(taskPatch(task, { ...form, frequency: "NONE", linkedKind: "", linkedId: "", revisedEndDate: "2026-10-15", progress: "55" })).toEqual({
            revisedEndDate: "2026-10-15",
            progress: 55,
            recurrence: null,
            linkedKind: null,
            linkedId: null,
        });
        expect(taskPatch(task, { ...form, frequency: "MONTHLY", occursOn: "1st", totalOccurrences: "6" })).toEqual({
            recurrence: { frequency: "MONTHLY", occursOn: "1st", totalOccurrences: 6 },
        });
    });
});

describe("the status rules as the screens read them", () => {
    it("offers the module's moves and nothing else — VERIFIED only to work.approve, ARCHIVED only to work.edit", () => {
        expect(statusTargets("DRAFT", { edit: true, approve: false })).toEqual(["TODO", "ARCHIVED"]);
        expect(statusTargets("TODO", { edit: false, approve: false })).toEqual(["IN_PROGRESS", "BLOCKED"]);
        expect(statusTargets("IN_PROGRESS", { edit: true, approve: false })).toEqual(["PENDING_REVIEW", "BLOCKED", "ARCHIVED"]);
        expect(statusTargets("PENDING_REVIEW", { edit: false, approve: false })).toEqual([]);
        expect(statusTargets("PENDING_REVIEW", { edit: true, approve: true })).toEqual(["VERIFIED", "ARCHIVED"]);
        expect(statusTargets("BLOCKED", { edit: false, approve: false })).toEqual(["TODO", "IN_PROGRESS"]);
        expect(statusTargets("VERIFIED", { edit: true, approve: true })).toEqual(["ARCHIVED"]);
        expect(statusTargets("ARCHIVED", { edit: true, approve: true })).toEqual([]);
        expect(needsReason("BLOCKED")).toBe(true);
        expect(needsReason("TODO")).toBe(false);
    });

    it("shows the review bar to a reviewer of the task, or work.approve, while it is under review", () => {
        const underReview = detail({ status: "PENDING_REVIEW" });
        expect(canReview(underReview, "usr_r", false)).toBe(true);
        expect(canReview(underReview, "usr_x", false)).toBe(false);
        expect(canReview(underReview, "usr_x", true)).toBe(true);
        expect(canReview(underReview, null, false)).toBe(false);
        expect(canReview(detail({ status: "IN_PROGRESS" }), "usr_r", true)).toBe(false);
    });

    it("reads the deadline against the Indian day", () => {
        expect(scheduleNote("2026-09-30T18:29:59.999Z", "2026-09-27")).toEqual({ text: "3 days remaining", late: false });
        expect(scheduleNote("2026-09-30T18:29:59.999Z", "2026-09-30")).toEqual({ text: "Due today", late: false });
        expect(scheduleNote("2026-09-30T18:29:59.999Z", "2026-10-02")).toEqual({ text: "Overdue by 2 days", late: true });
        expect(scheduleNote(null, "2026-10-02")).toBeNull();
    });
});

describe("the history from the audit trail", () => {
    const row = (overrides: Partial<AuditRow>): AuditRow => ({
        id: "aud_1",
        userId: "usr_ops",
        action: "WORK_TASK_UPDATED",
        module: "work",
        targetType: "WorkTask",
        targetId: "tsk_1",
        requestId: null,
        ipAddress: null,
        userAgent: null,
        metadata: null,
        diff: null,
        createdAt: "2026-09-10T10:00:00.000Z",
        user: { id: "usr_ops", name: "Ops", email: null },
        ...overrides,
    });

    it("draws a status move from a diff on status, with its reason and route, and a date change per date field", () => {
        const trail = taskHistory([
            row({
                id: "a3",
                action: "WORK_TASK_STATUS_CHANGED",
                diff: { status: { before: "IN_PROGRESS", after: "BLOCKED" }, blockedReason: { before: null, after: "Site access refused" } },
                metadata: { from: "IN_PROGRESS", to: "BLOCKED", requested: "BLOCKED", reason: "Site access refused", via: "status" },
                createdAt: "2026-09-12T10:00:00.000Z",
            }),
            row({
                id: "a2",
                action: "WORK_TASK_UPDATED",
                diff: { deadline: { before: "2026-09-30T18:29:59.999Z", after: "2026-10-15T18:29:59.999Z" }, startDate: { before: null, after: "2026-09-01T00:00:00.000Z" }, title: { before: "Audit", after: "Audit the metro" } },
                metadata: { fields: ["deadline", "startDate", "title"] },
                createdAt: "2026-09-11T10:00:00.000Z",
            }),
            row({
                id: "a1",
                action: "WORK_TASK_REVIEWED",
                metadata: { decision: "REJECT", note: "Platform 3 is missing" },
                user: { id: "usr_r", name: "Ravi", email: null },
                createdAt: "2026-09-10T10:00:00.000Z",
            }),
            row({ id: "a0", action: "WORK_TASK_CREATED", metadata: { displayId: "TSK-000001" }, createdAt: "2026-09-01T10:00:00.000Z" }),
        ]);

        expect(trail.status).toEqual([{ id: "a3", actor: "Ops", from: "In progress", to: "Blocked", at: "2026-09-12T10:00:00.000Z", reason: "Site access refused", via: "status" }]);
        expect(trail.dates).toEqual([
            { id: "a2:startDate", kind: "Planned start", oldDate: null, newDate: "2026-09-01T00:00:00.000Z", updatedBy: "Ops", at: "2026-09-11T10:00:00.000Z" },
            { id: "a2:deadline", kind: "Deadline", oldDate: "2026-09-30T18:29:59.999Z", newDate: "2026-10-15T18:29:59.999Z", updatedBy: "Ops", at: "2026-09-11T10:00:00.000Z" },
        ]);
        /* No baseline rows — the backend keeps no baseline (Q70). */
        expect(trail.dates.some((change) => /baseline/i.test(change.kind))).toBe(false);
        expect(trail.activity.map((entry) => [entry.action, entry.detail, entry.actor])).toEqual([
            ["Updated", "title changed", "Ops"],
            ["Reviewed", "Rejected — Platform 3 is missing", "Ravi"],
            ["Created", "", "Ops"],
        ]);
    });
});

describe("the overview helpers", () => {
    it("splits the statuses for the donut, counts the active ones and labels a month", () => {
        expect(statusSplit({ VERIFIED: 3, IN_PROGRESS: 2, TODO: 0, ARCHIVED: 9, DRAFT: 1 })).toEqual([
            { status: "VERIFIED", label: "Verified", value: 3 },
            { status: "IN_PROGRESS", label: "In progress", value: 2 },
            { status: "DRAFT", label: "Draft", value: 1 },
        ]);
        expect(activeCount({ VERIFIED: 3, IN_PROGRESS: 2, ARCHIVED: 9 })).toBe(5);
        expect(monthLabel("2026-09")).toBe("Sept");
        expect(recurrenceLabel({ frequency: "WEEKLY", occursOn: "Mon, Thu", endDate: "2026-12-31" })).toBe("Weekly on Mon, Thu until 2026-12-31");
        expect(recurrenceLabel(null)).toBe("Does not repeat");
        expect(linkedHref({ kind: "ORDER", id: "ord 1" })).toBe("/orders/ord%201");
        expect(linkedHref({ kind: "CITY", id: "city_1" })).toBeNull();
    });
});
