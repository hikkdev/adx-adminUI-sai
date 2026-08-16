import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Internal work tasks (ported from the ADX-AdminUI milestones module) */
/* ------------------------------------------------------------------ */

export interface TeamMember {
    id: string;
    name: string;
    role: string;
}

export type WorkTaskStatus =
    | "todo"
    | "in_progress"
    | "pending_review"
    | "verified"
    | "draft"
    | "blocked"
    | "archived";

export const WORK_TASK_STATUS_META: Record<WorkTaskStatus, StatusMeta> = {
    todo: { label: "To do", tone: "neutral" },
    in_progress: { label: "In progress", tone: "info" },
    pending_review: { label: "Pending review", tone: "warning" },
    verified: { label: "Verified", tone: "success" },
    draft: { label: "Draft", tone: "neutral" },
    blocked: { label: "Blocked", tone: "danger" },
    archived: { label: "Archived", tone: "neutral" },
};

export type WorkTaskPriority = "high" | "medium" | "low";

export const WORK_TASK_PRIORITY_META: Record<WorkTaskPriority, StatusMeta> = {
    high: { label: "High", tone: "danger" },
    medium: { label: "Medium", tone: "warning" },
    low: { label: "Low", tone: "neutral" },
};

export type RecurrenceFrequency =
    | "none"
    | "daily"
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly";

export interface TaskRecurrence {
    frequency: RecurrenceFrequency;
    /** Comma separated weekday list for weekly cadences, e.g. "Mon, Tue, Thu". */
    occursOn: string | null;
    endDate: string | null;
    totalOccurrences: number | null;
}

export interface TaskApprover extends TeamMember {
    approved: boolean;
}

export interface WorkTask {
    id: string;
    title: string;
    description: string;
    /** Department name or "Agents" for field work. */
    project: string;
    projectType: "Department" | "Region";
    location: string;
    team: TeamMember[];
    status: WorkTaskStatus;
    priority: WorkTaskPriority;
    progress: number;
    startDate: string;
    deadline: string;
    actualStartDate: string;
    revisedEndDate: string;
    timeLogged: string;
    effortEstimate: string;
    bufferTime: string;
    slackTime: string;
    overtimeHours: string;
    billableHours: string;
    pendingApprovals: number;
    openIssues: number;
    dependencies: number;
    createdBy: TeamMember;
    assignedBy: TeamMember;
    parentTask: string | null;
    recurrence: TaskRecurrence;
    reviewers: TeamMember[];
    approvers: TaskApprover[];
}

export interface SubTask {
    id: string;
    title: string;
    status: WorkTaskStatus;
    completed: boolean;
    window: string;
    progress: number;
}

export interface TaskStatusChange {
    id: string;
    actor: string;
    from: string;
    to: string;
    at: string;
    reason: string;
}

export interface TaskTimeLog {
    id: string;
    member: string;
    date: string;
    hours: number;
    minutes: number;
    kind: "billable" | "non_billable";
    note: string;
    state: "approved" | "pending";
    overtime: boolean;
}

export interface TaskDateChange {
    id: string;
    kind: string;
    oldDate: string;
    newDate: string;
    reason: string;
    updatedBy: string;
}

export interface TaskDates {
    plannedStart: string;
    plannedEnd: string;
    actualStart: string;
    actualEnd: string;
    baselineStart: string;
    baselineEnd: string;
    revisedStart: string;
    revisedEnd: string;
    durationDays: number;
    history: TaskDateChange[];
}

export interface TaskTracking {
    taskId: string;
    statusHistory: TaskStatusChange[];
    timeLogs: TaskTimeLog[];
    subTasks: SubTask[];
    dates: TaskDates;
}

/* ------------------------- Risk and issues ------------------------- */

export type TaskIssueType = "bug" | "blocker" | "change_request" | "query";

export const TASK_ISSUE_TYPE_META: Record<TaskIssueType, StatusMeta> = {
    bug: { label: "Bug", tone: "danger" },
    blocker: { label: "Blocker", tone: "danger" },
    change_request: { label: "Change request", tone: "info" },
    query: { label: "Query", tone: "neutral" },
};

export type TaskIssueSeverity = "critical" | "high" | "medium" | "low";

export const TASK_ISSUE_SEVERITY_META: Record<TaskIssueSeverity, StatusMeta> = {
    critical: { label: "Critical", tone: "danger" },
    high: { label: "High", tone: "warning" },
    medium: { label: "Medium", tone: "info" },
    low: { label: "Low", tone: "neutral" },
};

export type TaskIssueStatus = "open" | "in_progress" | "resolved" | "closed";

export const TASK_ISSUE_STATUS_META: Record<TaskIssueStatus, StatusMeta> = {
    open: { label: "Open", tone: "danger" },
    in_progress: { label: "In progress", tone: "info" },
    resolved: { label: "Resolved", tone: "success" },
    closed: { label: "Closed", tone: "neutral" },
};

export interface TaskIssue {
    id: string;
    taskId: string;
    taskTitle: string;
    project: string;
    topic: string;
    description: string;
    type: TaskIssueType;
    severity: TaskIssueSeverity;
    status: TaskIssueStatus;
    assignedTo: string;
    raisedBy: string;
    resolvedBy: string | null;
    resolutionDate: string | null;
    resolutionDetails: string | null;
    rootCause: string | null;
}

/* ----------------------------- Schedule ---------------------------- */

export type ScheduleStatus = "pending" | "in_progress" | "paused" | "completed";

export const SCHEDULE_STATUS_META: Record<ScheduleStatus, StatusMeta> = {
    pending: { label: "Pending", tone: "neutral" },
    in_progress: { label: "In progress", tone: "info" },
    paused: { label: "Paused", tone: "warning" },
    completed: { label: "Completed", tone: "success" },
};

export interface ScheduleEntry {
    id: string;
    /** ISO date, e.g. "2026-08-10". */
    date: string;
    time: string;
    title: string;
    assignee: string;
    department: string;
    status: ScheduleStatus;
}

export interface ScheduleLogEntry {
    id: string;
    at: string;
    entry: string;
    action: string;
    detail: string;
}
