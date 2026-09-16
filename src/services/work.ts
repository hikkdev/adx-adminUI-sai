import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { AuditPage, AuditRow } from "@/services/audit";
import { advertiserService } from "@/services/advertisers";
import { campaignService } from "@/services/campaigns";
import { geoService } from "@/services/geo";
import { leadsService } from "@/services/leads";
import { listingsService } from "@/services/listings";
import { orderService } from "@/services/orders";
import { printPartnerService } from "@/services/print-partners";
import { supplyService } from "@/services/supply";
import { visitsService } from "@/services/visits";
import {
    WORK_ISSUE_SEVERITY_META,
    WORK_ISSUE_STATUS_META,
    WORK_PROJECT_KIND_LABEL,
    WORK_TASK_STATUS_META,
    workTaskStatusMeta,
    type WorkIssueSeverity,
    type WorkIssueStatus,
    type WorkPriority,
    type WorkProjectKind,
    type WorkTaskStatus,
} from "@/types";

/**
 * Work — Lot AA: the DR 10 Tasks section over the backend's `work` module
 * (`/api/v1/work`), package AA-C.
 *
 * Projects, tasks with sub-tasks, people, reviewers, prerequisites,
 * comments, hours and issues; the overview, the board and a person's own
 * list. Coordination only (Q70): a task assigned to an agent never pays.
 *
 * No fixture fallback. The seeded `TSK-*` tasks the HEAD screens drew are
 * gone rather than kept: their buffer, slack, overtime and baseline dates
 * were an engine the backend never had, a time log's "approved | pending"
 * was an approval workflow that does not exist, and a status change with a
 * reason was a `useState`. What is here is what the wire carries.
 *
 * Three rules this file keeps:
 *
 * - Every status, priority and severity is the backend's enum, spelled as
 *   the backend spells it (`@/types/work`). The `*_META` records there are
 *   registered in `scripts/check-contract.mjs`.
 *
 * - Days are Indian days: a `deadline` typed as `YYYY-MM-DD` is the last
 *   instant of that Indian day on the server, so "due on the 16th" is not
 *   overdue until the 17th begins. The wire answers instants; the screens
 *   print them through `formatDate`.
 *
 * - A task's history is the audit trail — `GET /audit/targets/WorkTask/:id`
 *   — not a table of its own. Status moves and date changes both arrive as
 *   diffs there, and `taskHistory` below is what the History tab draws.
 */

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export type WorkPersonKind = "EMPLOYEE" | "AGENT";

export const WORK_PERSON_KIND_LABEL: Record<WorkPersonKind, string> = {
    EMPLOYEE: "Employee",
    AGENT: "Agent",
};

/** A person as the sibling registries know them; `kind` null when they have left both. */
export interface WorkPerson {
    userId: string;
    name: string | null;
    kind: WorkPersonKind | null;
    /** The designation, or "Field agent". */
    role: string | null;
    departmentName: string | null;
}

export const personName = (person: Pick<WorkPerson, "name" | "userId"> | null | undefined): string =>
    person?.name?.trim() || (person ? `User ${person.userId.slice(-6)}` : "—");

export const personDetail = (person: WorkPerson): string =>
    [person.role, person.departmentName].filter(Boolean).join(" · ") || (person.kind ? WORK_PERSON_KIND_LABEL[person.kind] : "No longer on the registry");

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/** The list contract every catalogue read answers: the page, its total and the chips. */
export interface WorkListPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted with the status facet removed. */
    counts: Record<string, number>;
}

export interface WorkProjectLite {
    id: string;
    displayId: string | null;
    name: string;
    kind: WorkProjectKind;
}

export interface WorkProject {
    id: string;
    displayId: string | null;
    name: string;
    description: string | null;
    kind: WorkProjectKind;
    departmentId: string | null;
    cityId: string | null;
    ownerUserId: string;
    owner: WorkPerson;
    /** ACTIVE | ARCHIVED — a plain string column on the model. */
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface WorkProjectDetail extends WorkProject {
    counts: { tasks: Record<string, number>; openIssues: number; hoursLogged: number };
}

/** The card: what a list row, a board card and a `/me` row carry. */
export interface WorkTaskCard {
    id: string;
    displayId: string | null;
    title: string;
    status: WorkTaskStatus;
    priority: WorkPriority;
    progress: number;
    deadline: string | null;
    startDate: string | null;
    project: WorkProjectLite | null;
    assignees: WorkPerson[];
    openIssues: number;
    childCount: number;
    overdue: boolean;
    tags: string[];
    parentTaskId: string | null;
    updatedAt: string;
}

export interface WorkReviewer extends WorkPerson {
    approver: boolean;
    approvedAt: string | null;
    rejectedAt: string | null;
    note: string | null;
}

export type WorkRecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export const RECURRENCE_FREQUENCIES: readonly WorkRecurrenceFrequency[] = ["DAILY", "WEEKLY", "MONTHLY"];

export const RECURRENCE_FREQUENCY_LABEL: Record<WorkRecurrenceFrequency, string> = {
    DAILY: "Daily",
    WEEKLY: "Weekly",
    MONTHLY: "Monthly",
};

export interface WorkRecurrence {
    frequency: WorkRecurrenceFrequency;
    /** A weekday list, a day of the month — kept as the screen typed it. */
    occursOn?: string;
    endDate?: string;
    totalOccurrences?: number;
    /** How many copies have been spawned so far, the original counted as 1. */
    occurrence?: number;
}

export type WorkLinkedKind = "ORDER" | "LISTING" | "LEAD" | "VISIT" | "CITY" | "PUBLISHER" | "ADVERTISER" | "PRINT_PARTNER" | "CAMPAIGN";

export const LINKED_KINDS: readonly WorkLinkedKind[] = ["ORDER", "LISTING", "LEAD", "VISIT", "CITY", "PUBLISHER", "ADVERTISER", "PRINT_PARTNER", "CAMPAIGN"];

export const LINKED_KIND_LABEL: Record<WorkLinkedKind, string> = {
    ORDER: "Order",
    LISTING: "Listing",
    LEAD: "Lead",
    VISIT: "Visit",
    CITY: "City",
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
    PRINT_PARTNER: "Print partner",
    CAMPAIGN: "Campaign",
};

export interface WorkTaskRef {
    id: string;
    displayId: string | null;
    title: string;
}

export interface WorkTaskRefWithStatus extends WorkTaskRef {
    status: WorkTaskStatus;
}

export interface WorkChild extends WorkTaskRefWithStatus {
    progress: number;
    deadline: string | null;
}

export interface WorkComment {
    id: string;
    author: WorkPerson;
    body: string;
    createdAt: string;
}

export interface WorkTimeLog {
    id: string;
    taskId: string;
    /** Named on the week read (`GET /work/time-logs`), absent on a task's own rows. */
    task?: WorkTaskRef;
    person: WorkPerson;
    /** YYYY-MM-DD. */
    forDate: string;
    hours: number;
    billable: boolean;
    note: string | null;
    loggedAt: string;
}

export interface WorkTimeLogTotals {
    hours: number;
    billableHours: number;
}

export interface WorkIssue {
    id: string;
    displayId: string | null;
    projectId: string | null;
    taskId: string | null;
    title: string;
    description: string | null;
    severity: WorkIssueSeverity;
    status: WorkIssueStatus;
    raisedById: string;
    assigneeId: string | null;
    resolution: string | null;
    resolvedAt: string | null;
    createdAt: string;
    updatedAt: string;
    raisedBy: WorkPerson;
    assignee: WorkPerson | null;
    task: WorkTaskRef | null;
}

/** The whole record, as `GET /work/tasks/:id` answers it. */
export interface WorkTaskDetail {
    id: string;
    displayId: string | null;
    title: string;
    description: string | null;
    status: WorkTaskStatus;
    priority: WorkPriority;
    progress: number;
    startDate: string | null;
    deadline: string | null;
    actualStartDate: string | null;
    revisedEndDate: string | null;
    completedAt: string | null;
    effortEstimateH: number | null;
    recurrence: WorkRecurrence | null;
    tags: string[];
    blockedReason: string | null;
    overdue: boolean;
    /** An OPEN CRITICAL issue sits on the task — a read-time flag, never a status. */
    blockedByIssue: boolean;
    /** Every child is VERIFIED: the parent is offered VERIFIED, never moved there. */
    childrenAllVerified: boolean;
    createdBy: WorkPerson;
    assignedBy: WorkPerson | null;
    project: WorkProjectLite | null;
    parent: WorkTaskRef | null;
    children: WorkChild[];
    assignees: WorkPerson[];
    reviewers: WorkReviewer[];
    prerequisites: WorkTaskRefWithStatus[];
    dependents: WorkTaskRefWithStatus[];
    comments: WorkComment[];
    timeLogs: { rows: WorkTimeLog[]; totals: WorkTimeLogTotals };
    issues: WorkIssue[];
    linked: { kind: WorkLinkedKind; id: string; label: string | null } | null;
    createdAt: string;
    updatedAt: string;
}

export interface WorkOverview {
    window: { from: string; to: string };
    tasks: { total: number; byStatus: Record<string, number>; byPriority: Record<string, number>; overdue: number; dueThisWeek: number; verifiedInWindow: number };
    trend: { month: string; planned: number; completed: number }[];
    issues: { open: number; bySeverity: Record<string, number>; byStatus: Record<string, number> };
    workload: { person: WorkPerson; open: number; inProgress: number; overdue: number; hoursInWindow: number }[];
    overdueList: { id: string; displayId: string | null; title: string; deadline: string | null; assignees: WorkPerson[] }[];
    projects: { id: string; displayId: string | null; name: string; kind: WorkProjectKind; open: number; verified: number; progress: number }[];
}

export interface WorkBoardColumn {
    status: WorkTaskStatus;
    count: number;
    /** Rows past the 100 the column carries. */
    more: number;
    tasks: WorkTaskCard[];
}

export interface WorkBoard {
    columns: WorkBoardColumn[];
}

export interface WorkTimeLogsPage {
    items: WorkTimeLog[];
    totals: WorkTimeLogTotals;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export type WorkTaskSort = "DEADLINE" | "PRIORITY" | "UPDATED" | "CREATED";

export interface WorkTasksQuery {
    q?: string;
    status?: readonly WorkTaskStatus[];
    priority?: WorkPriority;
    projectId?: string;
    assigneeUserId?: string;
    reviewerUserId?: string;
    dueFrom?: string;
    dueTo?: string;
    overdue?: boolean;
    linkedKind?: WorkLinkedKind;
    linkedId?: string;
    parentTaskId?: string;
    tag?: string;
    sort?: WorkTaskSort;
    dir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
}

/** `?status=&priority=&…` exactly as `tasksQuerySchema` parses it; blanks left off. */
export function buildTasksQuery(query: WorkTasksQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.priority) params.set("priority", query.priority);
    if (query.projectId) params.set("projectId", query.projectId);
    if (query.assigneeUserId) params.set("assigneeUserId", query.assigneeUserId);
    if (query.reviewerUserId) params.set("reviewerUserId", query.reviewerUserId);
    if (query.dueFrom) params.set("dueFrom", query.dueFrom);
    if (query.dueTo) params.set("dueTo", query.dueTo);
    if (query.overdue) params.set("overdue", "true");
    if (query.linkedKind && query.linkedId) {
        params.set("linkedKind", query.linkedKind);
        params.set("linkedId", query.linkedId);
    }
    if (query.parentTaskId) params.set("parentTaskId", query.parentTaskId);
    if (query.tag) params.set("tag", query.tag);
    if (query.sort) params.set("sort", query.sort);
    if (query.dir) params.set("dir", query.dir);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    return params.toString();
}

export interface WorkIssuesQuery {
    q?: string;
    status?: readonly WorkIssueStatus[];
    severity?: WorkIssueSeverity;
    projectId?: string;
    taskId?: string;
    assigneeId?: string;
    sort?: "newest" | "severity";
    page?: number;
    pageSize?: number;
}

export function buildIssuesQuery(query: WorkIssuesQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.severity) params.set("severity", query.severity);
    if (query.projectId) params.set("projectId", query.projectId);
    if (query.taskId) params.set("taskId", query.taskId);
    if (query.assigneeId) params.set("assigneeId", query.assigneeId);
    if (query.sort) params.set("sort", query.sort);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    return params.toString();
}

export interface WorkProjectsQuery {
    q?: string;
    status?: readonly string[];
    kind?: WorkProjectKind;
    cityId?: string;
    departmentId?: string;
    sort?: "newest" | "name";
    page?: number;
    pageSize?: number;
}

export function buildProjectsQuery(query: WorkProjectsQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.kind) params.set("kind", query.kind);
    if (query.cityId) params.set("cityId", query.cityId);
    if (query.departmentId) params.set("departmentId", query.departmentId);
    if (query.sort) params.set("sort", query.sort);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    return params.toString();
}

export interface WorkOverviewQuery {
    projectId?: string;
    /** YYYY-MM-DD; left off, the server takes this Indian month. */
    from?: string;
    to?: string;
}

export function buildOverviewQuery(query: WorkOverviewQuery = {}): string {
    const params = new URLSearchParams();
    if (query.projectId) params.set("projectId", query.projectId);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    return params.toString();
}

export interface WorkTimeLogsQuery {
    userId?: string;
    from?: string;
    to?: string;
    projectId?: string;
}

export function buildTimeLogsQuery(query: WorkTimeLogsQuery = {}): string {
    const params = new URLSearchParams();
    if (query.userId) params.set("userId", query.userId);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.projectId) params.set("projectId", query.projectId);
    return params.toString();
}

/* ------------------------------------------------------------------ */
/* Bodies                                                              */
/* ------------------------------------------------------------------ */

export interface WorkReviewerInput {
    userId: string;
    approver: boolean;
}

export interface CreateTaskInput {
    title: string;
    description?: string;
    projectId?: string;
    parentTaskId?: string;
    priority: WorkPriority;
    status?: "DRAFT" | "TODO";
    startDate?: string;
    deadline?: string;
    effortEstimateH?: number;
    linkedKind?: WorkLinkedKind;
    linkedId?: string;
    recurrence?: Omit<WorkRecurrence, "occurrence">;
    tags?: string[];
    assigneeUserIds?: string[];
    reviewers?: WorkReviewerInput[];
    prerequisiteIds?: string[];
}

/** Any field; a null clears it. `progress` is 409 on a parent, `projectId` 409 on a sub-task. */
export interface PatchTaskInput {
    title?: string;
    description?: string | null;
    priority?: WorkPriority;
    startDate?: string | null;
    deadline?: string | null;
    revisedEndDate?: string | null;
    effortEstimateH?: number | null;
    progress?: number;
    linkedKind?: WorkLinkedKind | null;
    linkedId?: string | null;
    recurrence?: Omit<WorkRecurrence, "occurrence"> | null;
    tags?: string[];
    projectId?: string | null;
    blockedReason?: string | null;
}

export interface CreateProjectInput {
    name: string;
    description?: string;
    kind: WorkProjectKind;
    departmentId?: string;
    cityId?: string;
    ownerUserId: string;
    startsAt?: string;
    endsAt?: string;
}

/** Name, description, owner, dates; the department or city of its kind only — a null clears a nullable field. */
export interface PatchProjectInput {
    name?: string;
    description?: string | null;
    ownerUserId?: string;
    departmentId?: string;
    cityId?: string;
    startsAt?: string | null;
    endsAt?: string | null;
}

export interface CreateIssueInput {
    title: string;
    description?: string;
    severity: WorkIssueSeverity;
    projectId?: string;
    taskId?: string;
    assigneeId?: string;
}

export interface PatchIssueInput {
    title?: string;
    description?: string | null;
    severity?: WorkIssueSeverity;
    assigneeId?: string | null;
    status?: "OPEN" | "IN_PROGRESS";
}

export interface TimeLogInput {
    /** YYYY-MM-DD. */
    forDate: string;
    /** 0.25–24. */
    hours: number;
    billable?: boolean;
    note?: string;
}

/** What the create wizard holds; `createTaskBody` turns it into the POST. */
export interface TaskWizardForm {
    title: string;
    description: string;
    projectId: string;
    parentTaskId: string;
    priority: WorkPriority;
    status: "DRAFT" | "TODO";
    startDate: string;
    deadline: string;
    effort: string;
    frequency: WorkRecurrenceFrequency | "NONE";
    occursOn: string[];
    recurrenceEnd: string;
    totalOccurrences: string;
    linkedKind: WorkLinkedKind | "";
    linkedId: string;
    tags: string[];
    assigneeIds: string[];
    reviewers: WorkReviewerInput[];
    prerequisiteIds: string[];
}

export const EMPTY_WIZARD: TaskWizardForm = {
    title: "",
    description: "",
    projectId: "",
    parentTaskId: "",
    priority: "MEDIUM",
    status: "TODO",
    startDate: "",
    deadline: "",
    effort: "",
    frequency: "NONE",
    occursOn: [],
    recurrenceEnd: "",
    totalOccurrences: "",
    linkedKind: "",
    linkedId: "",
    tags: [],
    assigneeIds: [],
    reviewers: [],
    prerequisiteIds: [],
};

const number = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
};

/** The recurrence the form describes, or undefined when it does not repeat. */
export function recurrenceOf(form: Pick<TaskWizardForm, "frequency" | "occursOn" | "recurrenceEnd" | "totalOccurrences">): Omit<WorkRecurrence, "occurrence"> | undefined {
    if (form.frequency === "NONE") return undefined;
    const occursOn = form.occursOn.join(", ");
    const total = number(form.totalOccurrences);
    return {
        frequency: form.frequency,
        ...(occursOn ? { occursOn } : {}),
        ...(form.recurrenceEnd ? { endDate: form.recurrenceEnd } : {}),
        ...(total !== undefined && total >= 1 ? { totalOccurrences: Math.floor(total) } : {}),
    };
}

/** The create body from the wizard: blanks left off, the API's own trims applied. */
export function createTaskBody(form: TaskWizardForm): CreateTaskInput {
    const description = form.description.trim();
    const effort = number(form.effort);
    const recurrence = recurrenceOf(form);
    return {
        title: form.title.trim(),
        ...(description ? { description } : {}),
        ...(form.projectId ? { projectId: form.projectId } : {}),
        ...(form.parentTaskId ? { parentTaskId: form.parentTaskId } : {}),
        priority: form.priority,
        status: form.status,
        ...(form.startDate ? { startDate: form.startDate } : {}),
        ...(form.deadline ? { deadline: form.deadline } : {}),
        ...(effort !== undefined ? { effortEstimateH: effort } : {}),
        ...(form.linkedKind && form.linkedId ? { linkedKind: form.linkedKind, linkedId: form.linkedId } : {}),
        ...(recurrence ? { recurrence } : {}),
        tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
        assigneeUserIds: form.assigneeIds,
        reviewers: form.reviewers,
        prerequisiteIds: form.prerequisiteIds,
    };
}

/** What the wizard validates per step before anything goes on the wire. */
export function wizardStepError(form: TaskWizardForm, step: number): string | null {
    if (step === 0) {
        if (form.title.trim().length < 3) return "Give the task a title.";
        if (form.linkedKind && !form.linkedId) return "Pick the record the task is about, or clear the link.";
        return null;
    }
    if (step === 1) {
        if (form.startDate && form.deadline && form.deadline < form.startDate) return "The deadline must be on or after the start date.";
        const effort = number(form.effort);
        if (form.effort.trim() && (effort === undefined || effort < 0)) return "The effort estimate is hours, zero or more.";
        if (form.frequency !== "NONE" && !form.deadline) return "A repeating task needs a deadline to advance from.";
        return null;
    }
    if (step === 2) {
        if (form.assigneeIds.length === 0) return "Pick at least one assignee.";
        return null;
    }
    return null;
}

/** The edit form's fields — the ones `PATCH /work/tasks/:id` takes. */
export interface TaskEditForm {
    title: string;
    description: string;
    priority: WorkPriority;
    projectId: string;
    startDate: string;
    deadline: string;
    revisedEndDate: string;
    effort: string;
    progress: string;
    frequency: WorkRecurrenceFrequency | "NONE";
    occursOn: string;
    recurrenceEnd: string;
    totalOccurrences: string;
    tags: string;
    linkedKind: WorkLinkedKind | "";
    linkedId: string;
}

/** The Indian calendar day an instant falls on, as YYYY-MM-DD; "" for null. */
export function istDayOf(iso: string | null | undefined): string {
    if (!iso) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function editFormOf(task: WorkTaskDetail): TaskEditForm {
    return {
        title: task.title,
        description: task.description ?? "",
        priority: task.priority,
        projectId: task.project?.id ?? "",
        startDate: istDayOf(task.startDate),
        deadline: istDayOf(task.deadline),
        revisedEndDate: istDayOf(task.revisedEndDate),
        effort: task.effortEstimateH === null ? "" : String(task.effortEstimateH),
        progress: String(task.progress),
        frequency: task.recurrence?.frequency ?? "NONE",
        occursOn: task.recurrence?.occursOn ?? "",
        recurrenceEnd: task.recurrence?.endDate ?? "",
        totalOccurrences: task.recurrence?.totalOccurrences === undefined ? "" : String(task.recurrence.totalOccurrences),
        tags: task.tags.join(", "),
        linkedKind: task.linked?.kind ?? "",
        linkedId: task.linked?.id ?? "",
    };
}

/**
 * The patch from the edit form: only what moved; a cleared date or estimate
 * goes as null. `progress` is left off a parent — the server derives it —
 * and a project change on a sub-task is left to the server's 409.
 */
export function taskPatch(current: WorkTaskDetail, form: TaskEditForm): PatchTaskInput | null {
    const base = editFormOf(current);
    const patch: PatchTaskInput = {};
    const title = form.title.trim();
    if (title && title !== current.title) patch.title = title;
    if (form.description.trim() !== base.description.trim()) patch.description = form.description.trim() || null;
    if (form.priority !== current.priority) patch.priority = form.priority;
    if (form.projectId !== base.projectId) patch.projectId = form.projectId || null;
    if (form.startDate !== base.startDate) patch.startDate = form.startDate || null;
    if (form.deadline !== base.deadline) patch.deadline = form.deadline || null;
    if (form.revisedEndDate !== base.revisedEndDate) patch.revisedEndDate = form.revisedEndDate || null;
    if (form.effort.trim() !== base.effort) {
        const effort = number(form.effort);
        patch.effortEstimateH = effort === undefined ? null : effort;
    }
    if (current.children.length === 0 && form.progress.trim() !== base.progress) {
        const progress = number(form.progress);
        if (progress !== undefined) patch.progress = Math.max(0, Math.min(100, Math.round(progress)));
    }
    const recurrenceMoved =
        form.frequency !== base.frequency ||
        form.occursOn.trim() !== base.occursOn ||
        form.recurrenceEnd !== base.recurrenceEnd ||
        form.totalOccurrences.trim() !== base.totalOccurrences;
    if (recurrenceMoved) {
        patch.recurrence =
            form.frequency === "NONE"
                ? null
                : (recurrenceOf({
                      frequency: form.frequency,
                      occursOn: form.occursOn.trim() ? [form.occursOn.trim()] : [],
                      recurrenceEnd: form.recurrenceEnd,
                      totalOccurrences: form.totalOccurrences,
                  }) ?? null);
    }
    const tags = form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    if (tags.join(",") !== current.tags.join(",")) patch.tags = tags;
    if (form.linkedKind !== base.linkedKind || form.linkedId !== base.linkedId) {
        if (form.linkedKind && form.linkedId) {
            patch.linkedKind = form.linkedKind;
            patch.linkedId = form.linkedId;
        } else {
            patch.linkedKind = null;
            patch.linkedId = null;
        }
    }
    return Object.keys(patch).length ? patch : null;
}

/* ------------------------------------------------------------------ */
/* The project dialog                                                  */
/* ------------------------------------------------------------------ */

/**
 * What the project dialog holds (Lot AB, package AB-C): one draft for a
 * DEPARTMENT project and a REGION one, the kind deciding which of the two
 * ids the POST carries. `cityName` is what the city picker shows; only the
 * catalogued pick's id goes on the wire.
 */
export interface ProjectDraft {
    name: string;
    description: string;
    kind: WorkProjectKind;
    departmentId: string;
    cityId: string;
    cityName: string;
    ownerUserId: string;
    startsAt: string;
    endsAt: string;
}

export const EMPTY_PROJECT_DRAFT: ProjectDraft = {
    name: "",
    description: "",
    kind: "DEPARTMENT",
    departmentId: "",
    cityId: "",
    cityName: "",
    ownerUserId: "",
    startsAt: "",
    endsAt: "",
};

/** The dialog's own gates, before anything goes on the wire; the server's refinements say the same. */
export function projectDraftError(draft: ProjectDraft): string | null {
    if (!draft.name.trim()) return "Give the project a name.";
    if (draft.kind === "DEPARTMENT" && !draft.departmentId) return "Pick the department the project belongs to.";
    if (draft.kind === "REGION" && !draft.cityId) return "Pick a catalogued city for the region.";
    if (!draft.ownerUserId) return "Pick who owns the project.";
    if (draft.startsAt && draft.endsAt && draft.endsAt < draft.startsAt) return "The end date must be on or after the start date.";
    return null;
}

/** The POST body: the kind's own id and nothing invented, the blanks left off. */
export function createProjectBody(draft: ProjectDraft): CreateProjectInput {
    return {
        name: draft.name.trim(),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        kind: draft.kind,
        ...(draft.kind === "DEPARTMENT" ? { departmentId: draft.departmentId } : { cityId: draft.cityId }),
        ownerUserId: draft.ownerUserId,
        ...(draft.startsAt ? { startsAt: draft.startsAt } : {}),
        ...(draft.endsAt ? { endsAt: draft.endsAt } : {}),
    };
}

/** The draft the edit dialog opens on. */
export function projectDraftOf(project: WorkProject, cityName = ""): ProjectDraft {
    return {
        name: project.name,
        description: project.description ?? "",
        kind: project.kind,
        departmentId: project.departmentId ?? "",
        cityId: project.cityId ?? "",
        cityName,
        ownerUserId: project.ownerUserId,
        startsAt: project.startsAt ? project.startsAt.slice(0, 10) : "",
        endsAt: project.endsAt ? project.endsAt.slice(0, 10) : "",
    };
}

/** Only what moved, or null when nothing did — the server refuses an empty patch. The kind never moves. */
export function projectPatchOf(project: WorkProject, draft: ProjectDraft): PatchProjectInput | null {
    const base = projectDraftOf(project);
    const patch: PatchProjectInput = {};
    if (draft.name.trim() !== base.name) patch.name = draft.name.trim();
    if (draft.description.trim() !== base.description) patch.description = draft.description.trim() || null;
    if (draft.ownerUserId !== base.ownerUserId) patch.ownerUserId = draft.ownerUserId;
    if (project.kind === "DEPARTMENT" && draft.departmentId && draft.departmentId !== base.departmentId) patch.departmentId = draft.departmentId;
    if (project.kind === "REGION" && draft.cityId && draft.cityId !== base.cityId) patch.cityId = draft.cityId;
    if (draft.startsAt !== base.startsAt) patch.startsAt = draft.startsAt || null;
    if (draft.endsAt !== base.endsAt) patch.endsAt = draft.endsAt || null;
    return Object.keys(patch).length ? patch : null;
}

/** ACTIVE | ARCHIVED — a plain string column, so the labels live here. */
export const PROJECT_STATUS_META: Record<string, { label: string; tone: "success" | "neutral" }> = {
    ACTIVE: { label: "Active", tone: "success" },
    ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const projectStatusMeta = (status: string) => PROJECT_STATUS_META[status] ?? { label: status, tone: "neutral" as const };

/** The projects table's facets: status chips counted by the read, one kind. */
export function projectFacets(counts: Record<string, number>) {
    return [
        {
            id: "status",
            label: "Status",
            options: ["ACTIVE", "ARCHIVED"].map((status) => ({ value: status, label: projectStatusMeta(status).label, count: counts[status] ?? 0 })),
        },
        {
            id: "kind",
            label: "Kind",
            type: "single" as const,
            options: (["DEPARTMENT", "REGION"] as const).map((kind) => ({ value: kind, label: WORK_PROJECT_KIND_LABEL[kind] })),
        },
    ];
}

export function editFormError(form: TaskEditForm): string | null {
    if (!form.title.trim()) return "A title is required.";
    if (form.startDate && form.deadline && form.deadline < form.startDate) return "The deadline is before the start date.";
    if (form.linkedKind && !form.linkedId) return "Pick the record the task is about, or clear the link.";
    if (form.frequency !== "NONE" && !form.deadline) return "A repeating task needs a deadline to advance from.";
    return null;
}

/* ------------------------------------------------------------------ */
/* Status rules, as the screens read them                              */
/* ------------------------------------------------------------------ */

/** Workflow order for the status picker, not the declaration order of the enum. */
export const STATUS_FLOW: readonly WorkTaskStatus[] = ["DRAFT", "TODO", "IN_PROGRESS", "BLOCKED", "PENDING_REVIEW", "VERIFIED", "ARCHIVED"];

/** The statuses the board draws — every one but ARCHIVED, in workflow order. */
export const BOARD_STATUSES: readonly WorkTaskStatus[] = ["TODO", "IN_PROGRESS", "PENDING_REVIEW", "VERIFIED", "DRAFT", "BLOCKED"];

/**
 * Where a task may go from where it is, by the module's rules. DRAFT is
 * never a target (a task leaves it once); VERIFIED is reached through the
 * review bar, or outright by `work.approve`; ARCHIVED needs `work.edit`.
 */
export function statusTargets(status: WorkTaskStatus, permissions: { edit: boolean; approve: boolean }): WorkTaskStatus[] {
    const out: WorkTaskStatus[] = [];
    switch (status) {
        case "DRAFT":
            out.push("TODO");
            break;
        case "TODO":
            out.push("IN_PROGRESS", "BLOCKED");
            break;
        case "IN_PROGRESS":
            out.push("PENDING_REVIEW", "BLOCKED");
            break;
        case "PENDING_REVIEW":
            if (permissions.approve) out.push("VERIFIED");
            break;
        case "BLOCKED":
            out.push("TODO", "IN_PROGRESS");
            break;
        default:
            break;
    }
    if (permissions.edit && status !== "ARCHIVED") out.push("ARCHIVED");
    return out;
}

/** A move that needs a written reason. */
export const needsReason = (status: WorkTaskStatus): boolean => status === "BLOCKED";

export const isOpenIssue = (issue: Pick<WorkIssue, "status">): boolean => issue.status === "OPEN" || issue.status === "IN_PROGRESS";

/**
 * Whether the review bar shows: the task is under review and the operator
 * is one of its reviewers, or holds `work.approve` (which reviews a task
 * one is not a reviewer of).
 */
export function canReview(task: Pick<WorkTaskDetail, "status" | "reviewers">, userId: string | null | undefined, approve: boolean): boolean {
    if (task.status !== "PENDING_REVIEW") return false;
    if (approve) return true;
    return Boolean(userId) && task.reviewers.some((reviewer) => reviewer.userId === userId);
}

/** "3 days remaining" / "Due today" / "Overdue by 2 days", against the Indian day. */
export function scheduleNote(deadline: string | null, today: string): { text: string; late: boolean } | null {
    if (!deadline) return null;
    const due = istDayOf(deadline);
    const diff = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    if (diff > 0) return { text: `${diff} ${diff === 1 ? "day" : "days"} remaining`, late: false };
    if (diff === 0) return { text: "Due today", late: false };
    return { text: `Overdue by ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "day" : "days"}`, late: true };
}

export function recurrenceLabel(recurrence: WorkRecurrence | null | undefined): string {
    if (!recurrence) return "Does not repeat";
    const base = RECURRENCE_FREQUENCY_LABEL[recurrence.frequency] ?? recurrence.frequency;
    const on = recurrence.occursOn ? ` on ${recurrence.occursOn}` : "";
    const until = recurrence.endDate ? ` until ${recurrence.endDate}` : recurrence.totalOccurrences ? `, ${recurrence.totalOccurrences} times` : "";
    return `${base}${on}${until}`;
}

/** Where the console opens the record a task is linked to, or null when it has no page. */
export function linkedHref(linked: { kind: WorkLinkedKind | string; id: string }): string | null {
    const id = encodeURIComponent(linked.id);
    switch (linked.kind) {
        case "ORDER":
            return `/orders/${id}`;
        case "LISTING":
            return `/listings/${id}`;
        case "LEAD":
            return `/leads/${id}`;
        case "VISIT":
            return "/visits";
        case "PUBLISHER":
            return `/publishers/${id}`;
        case "ADVERTISER":
            return `/advertisers/${id}`;
        case "PRINT_PARTNER":
            return `/print-partners/${id}`;
        case "CAMPAIGN":
            return `/campaigns/${id}`;
        default:
            return null;
    }
}

/* ------------------------------------------------------------------ */
/* History — the audit trail, as the History tab draws it              */
/* ------------------------------------------------------------------ */

export interface TaskStatusChange {
    id: string;
    actor: string;
    from: string;
    to: string;
    at: string;
    reason: string | null;
    /** `status` for a move, `review` for one the review endpoint made. */
    via: string;
}

export interface TaskDateChange {
    id: string;
    /** "Planned start", "Deadline", "Revised end". */
    kind: string;
    oldDate: string | null;
    newDate: string | null;
    updatedBy: string;
    at: string;
}

export interface TaskActivity {
    id: string;
    action: string;
    actor: string;
    at: string;
    detail: string;
}

const DATE_FIELD_LABEL: Record<string, string> = {
    startDate: "Planned start",
    deadline: "Deadline",
    revisedEndDate: "Revised end",
};

const ACTION_LABEL: Record<string, string> = {
    WORK_TASK_CREATED: "Created",
    WORK_TASK_UPDATED: "Updated",
    WORK_TASK_DELETED: "Deleted",
    WORK_TASK_STATUS_CHANGED: "Status changed",
    WORK_TASK_REVIEWED: "Reviewed",
    WORK_TASK_RECURRED: "Recurred",
    WORK_TASK_ASSIGNEES_SET: "Assignees set",
    WORK_TASK_REVIEWERS_SET: "Reviewers set",
    WORK_TASK_PREREQUISITES_SET: "Prerequisites set",
    WORK_TASK_COMMENTED: "Commented",
    WORK_TIME_LOGGED: "Time logged",
    WORK_TIME_LOG_DELETED: "Time log deleted",
};

const text = (value: unknown): string | null => (value === null || value === undefined || value === "" ? null : String(value));

const actorOf = (row: AuditRow): string => row.user?.name?.trim() || row.user?.email || row.userId;

/**
 * The trail split three ways: every row whose diff moves `status` is a
 * status change (its reason and route from the metadata); every diff on
 * `startDate`, `deadline` or `revisedEndDate` is a date change — one row
 * per field; and the rest is the activity line. Newest first, as the
 * trail arrives. There are no baseline rows: the backend keeps no
 * baseline (Q70).
 */
export function taskHistory(rows: readonly AuditRow[]): { status: TaskStatusChange[]; dates: TaskDateChange[]; activity: TaskActivity[] } {
    const status: TaskStatusChange[] = [];
    const dates: TaskDateChange[] = [];
    const activity: TaskActivity[] = [];
    for (const row of rows) {
        const diff = row.diff ?? {};
        const metadata = row.metadata ?? {};
        const actor = actorOf(row);
        if (diff.status) {
            status.push({
                id: row.id,
                actor,
                from: workTaskStatusMeta(String(diff.status.before)).label,
                to: workTaskStatusMeta(String(diff.status.after)).label,
                at: row.createdAt,
                reason: text(metadata.reason),
                via: text(metadata.via) ?? "status",
            });
        }
        for (const field of Object.keys(DATE_FIELD_LABEL)) {
            const change = diff[field];
            if (!change) continue;
            dates.push({
                id: `${row.id}:${field}`,
                kind: DATE_FIELD_LABEL[field],
                oldDate: text(change.before),
                newDate: text(change.after),
                updatedBy: actor,
                at: row.createdAt,
            });
        }
        if (!diff.status) {
            const fields = Object.keys(diff).filter((field) => !(field in DATE_FIELD_LABEL));
            const decision = text(metadata.decision);
            const detail =
                row.action === "WORK_TASK_REVIEWED" && decision
                    ? `${decision === "APPROVE" ? "Approved" : "Rejected"}${text(metadata.note) ? ` — ${text(metadata.note)}` : ""}`
                    : fields.length
                      ? `${fields.join(", ")} changed`
                      : "";
            activity.push({ id: row.id, action: ACTION_LABEL[row.action] ?? row.action, actor, at: row.createdAt, detail });
        }
    }
    return { status, dates, activity };
}

/* ------------------------------------------------------------------ */
/* Overview helpers                                                    */
/* ------------------------------------------------------------------ */

/** The status split as the donut draws it — the statuses in the ring, zeros left out. */
export function statusSplit(byStatus: Record<string, number>): { status: WorkTaskStatus; label: string; value: number }[] {
    const ring: WorkTaskStatus[] = ["VERIFIED", "IN_PROGRESS", "PENDING_REVIEW", "TODO", "BLOCKED", "DRAFT"];
    return ring.map((status) => ({ status, label: WORK_TASK_STATUS_META[status].label, value: byStatus[status] ?? 0 })).filter((segment) => segment.value > 0);
}

/** "Sep" from "2026-09". */
export function monthLabel(month: string): string {
    const [year, m] = month.split("-").map(Number);
    if (!year || !m) return month;
    return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 1)));
}

/** The sum of every status but ARCHIVED — the tasks on somebody's plate or in review. */
export const activeCount = (byStatus: Record<string, number>): number =>
    Object.entries(byStatus).reduce((n, [status, count]) => (status === "ARCHIVED" ? n : n + count), 0);

/** The facets the risk log offers, with the chip counts the list read carries. */
export function issueFacets(counts: Record<string, number>, severityCounts?: Record<string, number>) {
    return [
        {
            id: "status",
            label: "Status",
            options: (Object.keys(WORK_ISSUE_STATUS_META) as WorkIssueStatus[]).map((value) => ({ value, label: WORK_ISSUE_STATUS_META[value].label, count: counts[value] ?? 0 })),
        },
        {
            id: "severity",
            label: "Severity",
            type: "single" as const,
            options: (Object.keys(WORK_ISSUE_SEVERITY_META) as WorkIssueSeverity[]).map((value) => ({
                value,
                label: WORK_ISSUE_SEVERITY_META[value].label,
                ...(severityCounts ? { count: severityCounts[value] ?? 0 } : {}),
            })),
        },
    ];
}

/* ------------------------------------------------------------------ */
/* Linked records — the picker's search over each section's own list   */
/* ------------------------------------------------------------------ */

export interface LinkedCandidate {
    id: string;
    label: string;
    description?: string;
}

const LINKED_LIMIT = 15;

/**
 * The linked-record picker: `kind` plus a search over that section's list
 * service, each answered as `{ id, label }` the way the task will print
 * it. A section whose list has no search matches the query here.
 */
export async function searchLinked(kind: WorkLinkedKind, q: string): Promise<LinkedCandidate[]> {
    const needle = q.trim();
    switch (kind) {
        case "ORDER": {
            const page = await orderService.page({ q: needle || undefined, pageSize: LINKED_LIMIT, sort: "NEWEST" });
            return page.items.map((order) => ({ id: order.id, label: order.campaignName ?? order.listing, description: [order.listing, order.city].filter(Boolean).join(" · ") }));
        }
        case "LISTING": {
            const page = await listingsService.list({ q: needle || undefined, pageSize: LINKED_LIMIT });
            return page.items.map((listing) => ({ id: listing.id, label: listing.title, description: listing.displayId ?? undefined }));
        }
        case "LEAD": {
            const page = await leadsService.list({ q: needle || undefined, pageSize: LINKED_LIMIT });
            return page.items.map((lead) => ({ id: lead.id, label: lead.businessName, description: [lead.displayId, lead.city].filter(Boolean).join(" · ") || undefined }));
        }
        case "VISIT": {
            const page = await visitsService.board({ q: needle || undefined, pageSize: LINKED_LIMIT });
            return page.items.map((visit) => ({ id: visit.id, label: visit.businessName, description: [visit.displayId, visit.city].filter(Boolean).join(" · ") || undefined }));
        }
        case "CITY": {
            const page = await geoService.cities({ q: needle || undefined, pageSize: LINKED_LIMIT, sort: "name" });
            return page.items.map((city) => ({ id: city.id, label: city.name, description: city.state ?? undefined }));
        }
        case "PUBLISHER": {
            const rows = await supplyService.search(needle, LINKED_LIMIT);
            return rows.map((publisher) => ({ id: publisher.id, label: publisher.name, description: publisher.displayId ?? undefined }));
        }
        case "ADVERTISER": {
            if (!needle) return [];
            const rows = await advertiserService.search(needle, LINKED_LIMIT);
            return rows.map((advertiser) => ({ id: advertiser.id, label: advertiser.name, description: advertiser.displayId ?? undefined }));
        }
        case "PRINT_PARTNER": {
            const page = await printPartnerService.list({ q: needle || undefined, pageSize: LINKED_LIMIT });
            return page.items.map((partner) => ({ id: partner.id, label: partner.name, description: partner.displayId ?? undefined }));
        }
        case "CAMPAIGN": {
            const page = await campaignService.list({ q: needle || undefined, pageSize: LINKED_LIMIT });
            return page.items.map((campaign) => ({ id: campaign.id, label: campaign.name, description: campaign.reference }));
        }
        default:
            return [];
    }
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to — the workspace fixtures are gone — so a request that would
 * have gone out stops here instead.
 */
function live() {
    if (!isLive("work")) throw new Error("The Tasks section reads the API; connect the console to the ADX backend first.");
    return http;
}

const id = (value: string) => encodeURIComponent(value);
const withQuery = (path: string, qs: string) => (qs ? `${path}?${qs}` : path);

function shapePage<T>(page: Partial<WorkListPage<T>>): WorkListPage<T> {
    return { items: page.items ?? [], total: page.total ?? 0, page: page.page ?? 1, pageSize: page.pageSize ?? 20, counts: page.counts ?? {} };
}

export const workService = {
    /** The assignee picker: up to 50 active employees and agents. */
    people: (q?: string, kind?: WorkPersonKind): Promise<WorkPerson[]> => {
        const params = new URLSearchParams();
        if (q?.trim()) params.set("q", q.trim());
        if (kind) params.set("kind", kind);
        return live().get<WorkPerson[]>(withQuery("/work/people", params.toString()));
    },

    /** The numbers the overview draws; default window this Indian month. */
    overview: (query: WorkOverviewQuery = {}): Promise<WorkOverview> => live().get<WorkOverview>(withQuery("/work/overview", buildOverviewQuery(query))),

    /** Columns per status but ARCHIVED, 100 newest-updated each with a `more` count. */
    board: (query: { projectId?: string; assigneeUserId?: string } = {}): Promise<WorkBoard> => {
        const params = new URLSearchParams();
        if (query.projectId) params.set("projectId", query.projectId);
        if (query.assigneeUserId) params.set("assigneeUserId", query.assigneeUserId);
        return live().get<WorkBoard>(withQuery("/work/board", params.toString()));
    },

    /** A person's week: the rows and their totals. */
    timeLogs: (query: WorkTimeLogsQuery = {}): Promise<WorkTimeLogsPage> => live().get<WorkTimeLogsPage>(withQuery("/work/time-logs", buildTimeLogsQuery(query))),

    projects: {
        list: async (query: WorkProjectsQuery = {}): Promise<WorkListPage<WorkProject>> =>
            shapePage(await live().get<Partial<WorkListPage<WorkProject>>>(withQuery("/work/projects", buildProjectsQuery(query)))),
        /** 201 PRJ-; 404 when the department or city is not a row. */
        create: (input: CreateProjectInput): Promise<WorkProject> => live().post<WorkProject>("/work/projects", input),
        get: (projectId: string): Promise<WorkProjectDetail> => live().get<WorkProjectDetail>(`/work/projects/${id(projectId)}`),
        /** An empty patch is 400; a department on a REGION project (or a city on a DEPARTMENT one) is 409. */
        patch: (projectId: string, patch: PatchProjectInput): Promise<WorkProject> => live().patch<WorkProject>(`/work/projects/${id(projectId)}`, patch),
        archive: (projectId: string): Promise<WorkProject> => live().post<WorkProject>(`/work/projects/${id(projectId)}/archive`, {}),
    },

    tasks: {
        /** The list contract; ARCHIVED hidden unless the status facet names it, the chips still counting them. */
        list: async (query: WorkTasksQuery = {}): Promise<WorkListPage<WorkTaskCard>> =>
            shapePage(await live().get<Partial<WorkListPage<WorkTaskCard>>>(withQuery("/work/tasks", buildTasksQuery(query)))),
        /** 201 TSK-; 404 naming a linked record that is not a row, 409 on a sub-task naming another project. */
        create: (input: CreateTaskInput): Promise<WorkTaskDetail> => live().post<WorkTaskDetail>("/work/tasks", input),
        get: (taskId: string): Promise<WorkTaskDetail> => live().get<WorkTaskDetail>(`/work/tasks/${id(taskId)}`),
        patch: (taskId: string, patch: PatchTaskInput): Promise<WorkTaskDetail> => live().patch<WorkTaskDetail>(`/work/tasks/${id(taskId)}`, patch),
        /** 204 for a childless DRAFT; anything else is archived and answers `{ archived: true }`. */
        remove: (taskId: string): Promise<{ archived: true } | null> => live().delete<{ archived: true } | null>(`/work/tasks/${id(taskId)}`),
        /** The status rules live on the server: a 409 names the unfinished prerequisites, a 400 asks for the reason. */
        setStatus: (taskId: string, status: WorkTaskStatus, reason?: string): Promise<WorkTaskDetail> =>
            live().post<WorkTaskDetail>(`/work/tasks/${id(taskId)}/status`, { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) }),
        /** By a reviewer of the task, or `work.approve` (404 otherwise). */
        review: (taskId: string, decision: "APPROVE" | "REJECT", note?: string): Promise<WorkTaskDetail> =>
            live().post<WorkTaskDetail>(`/work/tasks/${id(taskId)}/review`, { decision, ...(note?.trim() ? { note: note.trim() } : {}) }),
        setAssignees: (taskId: string, userIds: string[]): Promise<WorkTaskDetail> => live().put<WorkTaskDetail>(`/work/tasks/${id(taskId)}/assignees`, { userIds }),
        setReviewers: (taskId: string, reviewers: WorkReviewerInput[]): Promise<WorkTaskDetail> => live().put<WorkTaskDetail>(`/work/tasks/${id(taskId)}/reviewers`, { reviewers }),
        /** No self, no cycle — a 409 names the path. */
        setPrerequisites: (taskId: string, ids: string[]): Promise<WorkTaskDetail> => live().put<WorkTaskDetail>(`/work/tasks/${id(taskId)}/prerequisites`, { ids }),
        comment: (taskId: string, body: string): Promise<WorkComment> => live().post<WorkComment>(`/work/tasks/${id(taskId)}/comments`, { body: body.trim() }),
        logTime: (taskId: string, input: TimeLogInput): Promise<WorkTimeLog> => live().post<WorkTimeLog>(`/work/tasks/${id(taskId)}/time-logs`, input),
        deleteTimeLog: (taskId: string, logId: string): Promise<null> => live().delete<null>(`/work/tasks/${id(taskId)}/time-logs/${id(logId)}`),
        /** The record's trail — every audit row that named it, newest first. Status moves and date changes both arrive as diffs. */
        history: async (taskId: string): Promise<AuditRow[]> => {
            const page = await live().get<Partial<AuditPage>>(`/audit/targets/WorkTask/${id(taskId)}?pageSize=50&sort=newest`);
            return page.items ?? [];
        },
    },

    issues: {
        list: async (query: WorkIssuesQuery = {}): Promise<WorkListPage<WorkIssue>> =>
            shapePage(await live().get<Partial<WorkListPage<WorkIssue>>>(withQuery("/work/issues", buildIssuesQuery(query)))),
        /** 201 ISS-; takes the task's project when both are given. */
        create: (input: CreateIssueInput): Promise<WorkIssue> => live().post<WorkIssue>("/work/issues", input),
        get: (issueId: string): Promise<WorkIssue> => live().get<WorkIssue>(`/work/issues/${id(issueId)}`),
        patch: (issueId: string, patch: PatchIssueInput): Promise<WorkIssue> => live().patch<WorkIssue>(`/work/issues/${id(issueId)}`, patch),
        resolve: (issueId: string, status: "RESOLVED" | "WONT_FIX", resolution: string): Promise<WorkIssue> =>
            live().post<WorkIssue>(`/work/issues/${id(issueId)}/resolve`, { status, resolution: resolution.trim() }),
        reopen: (issueId: string): Promise<WorkIssue> => live().post<WorkIssue>(`/work/issues/${id(issueId)}/reopen`, {}),
    },
};
