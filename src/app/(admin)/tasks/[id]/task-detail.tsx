"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DetailShell } from "@/components/adx/detail-shell";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import {
    TASK_ISSUE_SEVERITY_META,
    TASK_ISSUE_STATUS_META,
    WORK_TASK_PRIORITY_META,
    WORK_TASK_STATUS_META,
    type SubTask,
    type TaskIssue,
    type TaskTimeLog,
    type TaskTracking,
    type WorkTask,
} from "@/types";

interface TaskDetailProps {
    task: WorkTask;
    tracking: TaskTracking;
    issues: TaskIssue[];
}

const daysRemaining = (deadline: string) => {
    const diff = Math.ceil(
        (new Date(deadline).getTime() - new Date("2026-08-10").getTime()) / 86400000
    );
    if (diff > 0) return `${diff} days remaining`;
    if (diff === 0) return "Due today";
    return "Past deadline";
};

const recurrenceLabel = (task: WorkTask) => {
    const { recurrence } = task;
    if (recurrence.frequency === "none") return "Does not repeat";
    const base = recurrence.frequency[0].toUpperCase() + recurrence.frequency.slice(1);
    return recurrence.occursOn ? `${base} on ${recurrence.occursOn}` : base;
};

export function TaskDetail({ task, tracking, issues }: TaskDetailProps) {
    const overviewTab = (
        <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
                <SectionCard title="Basic information">
                    <FieldList
                        items={[
                            ["Task ID", task.id],
                            ["Project", `${task.project} (${task.projectType})`],
                            ["Location", task.location],
                            [
                                "Priority",
                                <StatusBadge
                                    key="priority"
                                    status={WORK_TASK_PRIORITY_META[task.priority]}
                                />,
                            ],
                            [
                                "Status",
                                <StatusBadge
                                    key="status"
                                    status={WORK_TASK_STATUS_META[task.status]}
                                />,
                            ],
                            ["Parent task", task.parentTask ?? "None"],
                            ["Created by", task.createdBy.name],
                            ["Assigned by", task.assignedBy.name],
                        ]}
                    />
                </SectionCard>
                <SectionCard title="Time estimates">
                    <FieldList
                        items={[
                            ["Effort estimate", task.effortEstimate],
                            ["Time logged", task.timeLogged],
                            ["Billable hours", task.billableHours],
                            ["Overtime", task.overtimeHours],
                            ["Buffer time", task.bufferTime],
                            ["Slack time", task.slackTime],
                        ]}
                    />
                </SectionCard>
                <SectionCard title="Key dates">
                    <FieldList
                        items={[
                            ["Planned start", formatDate(tracking.dates.plannedStart)],
                            ["Planned end", formatDate(tracking.dates.plannedEnd)],
                            ["Actual start", formatDate(tracking.dates.actualStart)],
                            [
                                "Revised end",
                                formatDate(tracking.dates.revisedEnd),
                            ],
                            ["Duration", `${tracking.dates.durationDays} days`],
                        ]}
                    />
                </SectionCard>
            </div>
            <div className="space-y-4">
                <SectionCard title="Description">
                    <p className="text-sm text-foreground">{task.description}</p>
                </SectionCard>
                <SectionCard title={`Team (${task.team.length})`}>
                    <ul className="space-y-3">
                        {task.team.map((member) => (
                            <li key={member.id} className="flex items-center gap-3">
                                <InitialsAvatar name={member.name} />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {member.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{member.role}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </SectionCard>
                <SectionCard title="Recurrence">
                    <FieldList
                        items={[
                            ["Repeats", recurrenceLabel(task)],
                            [
                                "Ends",
                                task.recurrence.endDate
                                    ? formatDate(task.recurrence.endDate)
                                    : task.recurrence.totalOccurrences
                                      ? `After ${task.recurrence.totalOccurrences} occurrences`
                                      : "Open ended",
                            ],
                        ]}
                    />
                </SectionCard>
                <SectionCard title="Linked issues">
                    {issues.length ? (
                        <ul className="space-y-2.5">
                            {issues.map((issue) => (
                                <li key={issue.id} className="flex items-center gap-2.5">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {issue.id}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                        {issue.description}
                                    </span>
                                    <StatusBadge
                                        status={TASK_ISSUE_SEVERITY_META[issue.severity]}
                                    />
                                    <StatusBadge status={TASK_ISSUE_STATUS_META[issue.status]} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No issues raised against this task.
                        </p>
                    )}
                </SectionCard>
            </div>
        </div>
    );

    const checklistTab = (
        <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title={`Sub tasks (${tracking.subTasks.length})`}>
                <ul className="space-y-3">
                    {tracking.subTasks.map((subTask: SubTask) => (
                        <li key={subTask.id} className="flex items-center gap-3">
                            {subTask.completed ? (
                                <CheckCircle2 className="size-4 shrink-0 text-success" />
                            ) : (
                                <Circle className="size-4 shrink-0 text-muted-foreground/50" />
                            )}
                            <div className="min-w-0 flex-1">
                                <p
                                    className={cn(
                                        "truncate text-sm font-medium",
                                        subTask.completed
                                            ? "text-muted-foreground line-through"
                                            : "text-foreground"
                                    )}
                                >
                                    {subTask.title}
                                </p>
                                <p className="text-xs text-muted-foreground">{subTask.window}</p>
                            </div>
                            <div className="flex w-28 items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary"
                                        style={{ width: `${subTask.progress}%` }}
                                    />
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {subTask.progress}%
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            </SectionCard>
            <SectionCard title="Date change history">
                {tracking.dates.history.length ? (
                    <SimpleTable
                        columns={[
                            { key: "kind", label: "Change", render: (row) => row.kind },
                            {
                                key: "from",
                                label: "From",
                                render: (row) => formatDate(row.oldDate),
                            },
                            { key: "to", label: "To", render: (row) => formatDate(row.newDate) },
                            { key: "reason", label: "Reason", render: (row) => row.reason },
                            { key: "by", label: "Updated by", render: (row) => row.updatedBy },
                        ]}
                        rows={tracking.dates.history}
                        rowKey={(row) => row.id}
                    />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Dates have not been revised on this task.
                    </p>
                )}
            </SectionCard>
        </div>
    );

    const timeTab = (
        <SimpleTable
            columns={[
                { key: "member", label: "Member", render: (row: TaskTimeLog) => row.member },
                { key: "date", label: "Date", render: (row) => formatDate(row.date) },
                {
                    key: "duration",
                    label: "Duration",
                    render: (row) => `${row.hours}h ${String(row.minutes).padStart(2, "0")}m`,
                },
                {
                    key: "kind",
                    label: "Type",
                    render: (row) => (row.kind === "billable" ? "Billable" : "Non billable"),
                },
                { key: "note", label: "Note", render: (row) => row.note },
                {
                    key: "overtime",
                    label: "Overtime",
                    render: (row) => (row.overtime ? "Yes" : "No"),
                },
                {
                    key: "state",
                    label: "State",
                    render: (row) => (
                        <StatusBadge
                            status={
                                row.state === "approved"
                                    ? { label: "Approved", tone: "success" }
                                    : { label: "Pending", tone: "warning" }
                            }
                        />
                    ),
                },
            ]}
            rows={tracking.timeLogs}
            rowKey={(row) => row.id}
            emptyMessage="No time logged yet."
        />
    );

    const historyTab = (
        <SectionCard title="Status history">
            <ol className="relative space-y-5 border-l pl-5">
                {tracking.statusHistory.map((change) => (
                    <li key={change.id} className="relative">
                        <span className="absolute -left-[26px] top-1 size-2.5 rounded-full border-2 border-card bg-primary" />
                        <p className="text-sm font-medium text-foreground">
                            {change.from} to {change.to}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {change.actor} · {formatDateTime(change.at)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{change.reason}</p>
                    </li>
                ))}
            </ol>
        </SectionCard>
    );

    const approvalsTab = (
        <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Reviewers">
                <ul className="space-y-3">
                    {task.reviewers.map((reviewer) => (
                        <li key={reviewer.id} className="flex items-center gap-3">
                            <InitialsAvatar name={reviewer.name} />
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                    {reviewer.name}
                                </p>
                                <p className="text-xs text-muted-foreground">{reviewer.role}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </SectionCard>
            <SectionCard title="Approvers">
                <ul className="space-y-3">
                    {task.approvers.map((approver) => (
                        <li key={approver.id} className="flex items-center gap-3">
                            <InitialsAvatar name={approver.name} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">
                                    {approver.name}
                                </p>
                                <p className="text-xs text-muted-foreground">{approver.role}</p>
                            </div>
                            <StatusBadge
                                status={
                                    approver.approved
                                        ? { label: "Approved", tone: "success" }
                                        : { label: "Awaiting", tone: "warning" }
                                }
                            />
                        </li>
                    ))}
                </ul>
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    {task.pendingApprovals} approvals pending on this task overall.
                </p>
            </SectionCard>
        </div>
    );

    return (
        <div className="space-y-5">
            <DetailShell
                backHref="/tasks/board"
                backLabel="Board"
                title={task.title}
                subtitle={`${task.project} · ${task.location}`}
                actions={
                    <div className="flex items-center gap-2">
                        <StatusBadge status={WORK_TASK_PRIORITY_META[task.priority]} />
                        <StatusBadge status={WORK_TASK_STATUS_META[task.status]} />
                    </div>
                }
                kpis={[
                    {
                        id: "progress",
                        label: "Progress",
                        value: `${task.progress}%`,
                        hint: WORK_TASK_STATUS_META[task.status].label,
                    },
                    {
                        id: "time",
                        label: "Time logged",
                        value: task.timeLogged,
                        hint: `of ${task.effortEstimate} estimated`,
                    },
                    {
                        id: "deadline",
                        label: "Deadline",
                        value: formatDate(task.deadline),
                        hint: daysRemaining(task.deadline),
                    },
                    {
                        id: "team",
                        label: "Team",
                        value: String(task.team.length),
                        hint: "members assigned",
                    },
                ]}
                tabs={[
                    { value: "overview", label: "Overview", content: overviewTab },
                    { value: "checklist", label: "Checklist", content: checklistTab },
                    { value: "time", label: "Time logs", content: timeTab },
                    { value: "history", label: "History", content: historyTab },
                    { value: "approvals", label: "Approvals", content: approvalsTab },
                ]}
            />
            {/* Progress context strip */}
            <Card className="rounded-lg border-border p-5 shadow-none">
                <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${task.progress}%` }}
                        />
                    </div>
                    <span className="text-sm font-medium text-foreground">{task.progress}%</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    {task.openIssues} open issues · {task.dependencies} dependencies ·{" "}
                    {task.pendingApprovals} pending approvals
                </p>
            </Card>
        </div>
    );
}
