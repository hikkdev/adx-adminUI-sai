import type { StatusMeta } from "./common";

/* ------------------------------------------------------------------ */
/* Work — Lot AA: the DR 10 Tasks section on the `work` module          */
/* ------------------------------------------------------------------ */

/**
 * The four enums of `prisma/schema.prisma` the section draws, spelled as
 * the backend spells them. The HEAD copy of this file (`workspace.ts`)
 * carried lowercase unions of its own ("in_progress", "pending_review");
 * those were a vocabulary the fixtures invented and are not here — every
 * record below is registered in `scripts/check-contract.mjs` against its
 * enum, so a value the backend adds or drops fails the check.
 */

export type WorkTaskStatus = "DRAFT" | "TODO" | "IN_PROGRESS" | "PENDING_REVIEW" | "VERIFIED" | "BLOCKED" | "ARCHIVED";

export const WORK_TASK_STATUSES: readonly WorkTaskStatus[] = ["DRAFT", "TODO", "IN_PROGRESS", "PENDING_REVIEW", "VERIFIED", "BLOCKED", "ARCHIVED"];

export const WORK_TASK_STATUS_META: Record<WorkTaskStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    TODO: { label: "To do", tone: "neutral" },
    IN_PROGRESS: { label: "In progress", tone: "info" },
    PENDING_REVIEW: { label: "Pending review", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    BLOCKED: { label: "Blocked", tone: "danger" },
    ARCHIVED: { label: "Archived", tone: "neutral" },
};

export type WorkPriority = "HIGH" | "MEDIUM" | "LOW";

export const WORK_PRIORITIES: readonly WorkPriority[] = ["HIGH", "MEDIUM", "LOW"];

export const WORK_PRIORITY_META: Record<WorkPriority, StatusMeta> = {
    HIGH: { label: "High", tone: "danger" },
    MEDIUM: { label: "Medium", tone: "warning" },
    LOW: { label: "Low", tone: "neutral" },
};

export type WorkIssueStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "WONT_FIX";

export const WORK_ISSUE_STATUSES: readonly WorkIssueStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "WONT_FIX"];

export const WORK_ISSUE_STATUS_META: Record<WorkIssueStatus, StatusMeta> = {
    OPEN: { label: "Open", tone: "danger" },
    IN_PROGRESS: { label: "In progress", tone: "info" },
    RESOLVED: { label: "Resolved", tone: "success" },
    WONT_FIX: { label: "Won't fix", tone: "neutral" },
};

export type WorkIssueSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const WORK_ISSUE_SEVERITIES: readonly WorkIssueSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const WORK_ISSUE_SEVERITY_META: Record<WorkIssueSeverity, StatusMeta> = {
    CRITICAL: { label: "Critical", tone: "danger" },
    HIGH: { label: "High", tone: "warning" },
    MEDIUM: { label: "Medium", tone: "info" },
    LOW: { label: "Low", tone: "neutral" },
};

export type WorkProjectKind = "DEPARTMENT" | "REGION";

export const WORK_PROJECT_KIND_LABEL: Record<WorkProjectKind, string> = {
    DEPARTMENT: "Department",
    REGION: "Region",
};

/** A safe lookup for a status the console has not heard of yet. */
export const workTaskStatusMeta = (status: string): StatusMeta => WORK_TASK_STATUS_META[status as WorkTaskStatus] ?? { label: status, tone: "neutral" };
export const workPriorityMeta = (priority: string): StatusMeta => WORK_PRIORITY_META[priority as WorkPriority] ?? { label: priority, tone: "neutral" };
export const workIssueStatusMeta = (status: string): StatusMeta => WORK_ISSUE_STATUS_META[status as WorkIssueStatus] ?? { label: status, tone: "neutral" };
export const workIssueSeverityMeta = (severity: string): StatusMeta => WORK_ISSUE_SEVERITY_META[severity as WorkIssueSeverity] ?? { label: severity, tone: "neutral" };
