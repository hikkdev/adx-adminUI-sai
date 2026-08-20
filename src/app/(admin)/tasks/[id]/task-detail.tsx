"use client";

/* Hallmark - genre: modern-minimal - macrostructure: Record Dossier / Workbench */

import * as React from "react";
import Link from "next/link";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    ChevronDown,
    Circle,
    CircleAlert,
    Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { currentAdmin } from "@/data/platform";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import {
    TASK_ISSUE_SEVERITY_META,
    TASK_ISSUE_STATUS_META,
    WORK_TASK_PRIORITY_META,
    WORK_TASK_STATUS_META,
    type TaskIssue,
    type TaskTimeLog,
    type TaskTracking,
    type WorkTask,
    type WorkTaskStatus,
} from "@/types";

interface TaskDetailProps {
    task: WorkTask;
    tracking: TaskTracking;
    issues: TaskIssue[];
}

/**
 * Reference "today" for the seeded workspace fixture. Kept as a constant so the
 * server and client render identical strings; swap for a server-provided date
 * once this screen reads live task data.
 */
const TODAY = new Date("2026-08-10");

/** Workflow order for the status picker, not the declaration order of the enum. */
const STATUS_FLOW: WorkTaskStatus[] = [
    "draft",
    "todo",
    "in_progress",
    "blocked",
    "pending_review",
    "verified",
    "archived",
];

interface TaskComment {
    id: string;
    author: string;
    role: string;
    at: string;
    body: string;
}

const scheduleNote = (deadline: string) => {
    const diff = Math.ceil((new Date(deadline).getTime() - TODAY.getTime()) / 86400000);
    if (diff > 0) return { text: `${diff} days remaining`, late: false };
    if (diff === 0) return { text: "Due today", late: false };
    return { text: `Overdue by ${Math.abs(diff)} days`, late: true };
};

const recurrenceLabel = (task: WorkTask) => {
    const { recurrence } = task;
    if (recurrence.frequency === "none") return "Does not repeat";
    const base = recurrence.frequency[0].toUpperCase() + recurrence.frequency.slice(1);
    return recurrence.occursOn ? `${base} on ${recurrence.occursOn}` : base;
};

/** Underline tab trigger, same treatment as DetailShell. */
const tabTriggerClasses =
    "rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

/* ------------------------------------------------------------------ */
/* Status picker                                                       */
/* ------------------------------------------------------------------ */

function StatusPicker({
    status,
    onChange,
}: {
    status: WorkTaskStatus;
    onChange: (next: WorkTaskStatus) => void;
}) {
    const meta = WORK_TASK_STATUS_META[status];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Status ${meta.label}, change status`}
                    className="-mr-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                    <StatusBadge status={meta} />
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    Move task to
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                    value={status}
                    onValueChange={(value) => onChange(value as WorkTaskStatus)}
                >
                    {STATUS_FLOW.map((option) => (
                        <DropdownMenuRadioItem key={option} value={option}>
                            {WORK_TASK_STATUS_META[option].label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

function CommentComposer({ onSubmit }: { onSubmit: (body: string) => void }) {
    const [body, setBody] = React.useState("");
    const [active, setActive] = React.useState(false);
    const trimmed = body.trim();

    const submit = () => {
        if (!trimmed) return;
        onSubmit(trimmed);
        setBody("");
        setActive(false);
    };

    return (
        <div className="flex gap-3">
            <InitialsAvatar name={currentAdmin.name} size="sm" className="mt-0.5" />
            <div className="min-w-0 flex-1">
                <label htmlFor="task-comment" className="sr-only">
                    Add a comment
                </label>
                <Textarea
                    id="task-comment"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    onFocus={() => setActive(true)}
                    onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
                    }}
                    placeholder="Add an update so the team knows where this stands"
                    className={cn("resize-y shadow-none", active ? "min-h-24" : "min-h-11")}
                />
                {(active || trimmed) && (
                    <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" onClick={submit} disabled={!trimmed}>
                            Comment
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                setBody("");
                                setActive(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <span className="ml-auto text-xs text-muted-foreground">
                            Ctrl + Enter to post
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */

export function TaskDetail({ task, tracking, issues }: TaskDetailProps) {
    const [issuesExpanded, setIssuesExpanded] = React.useState(false);
    /* Local-only until the tasks service exposes a mutation. */
    const [status, setStatus] = React.useState<WorkTaskStatus>(task.status);
    const [comments, setComments] = React.useState<TaskComment[]>([]);

    const completedSubTasks = tracking.subTasks.filter((subTask) => subTask.completed).length;
    const approvedCount = task.approvers.filter((approver) => approver.approved).length;
    const linkedOpenIssues = issues.filter(
        (issue) => issue.status === "open" || issue.status === "in_progress"
    );
    const blockerCount = task.openIssues + task.dependencies + task.pendingApprovals;
    const schedule = scheduleNote(task.deadline);

    const blockerSummary = [
        task.openIssues > 0 && `${task.openIssues} issues`,
        task.dependencies > 0 &&
            `${task.dependencies} ${task.dependencies === 1 ? "dependency" : "dependencies"}`,
        task.pendingApprovals > 0 && `${task.pendingApprovals} approvals`,
    ]
        .filter(Boolean)
        .join(" · ");

    const addComment = React.useCallback((body: string) => {
        setComments((current) => [
            {
                id: `c-${current.length + 1}-${Date.now()}`,
                author: currentAdmin.name,
                role: currentAdmin.role,
                at: new Date().toISOString(),
                body,
            },
            ...current,
        ]);
    }, []);

    return (
        <div className="space-y-5">
            {/* Header ---------------------------------------------------- */}
            <div>
                <Link
                    href="/tasks/board"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Task board
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                {task.title}
                            </h1>
                            <StatusBadge status={WORK_TASK_STATUS_META[status]} />
                            <StatusBadge status={WORK_TASK_PRIORITY_META[task.priority]} />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {task.id} · {task.description}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/tasks/issues">View issues</Link>
                        </Button>
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/tasks/board">Open task board</Link>
                        </Button>
                    </div>
                </div>
            </div>

            {/* KPI row --------------------------------------------------- */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "progress",
                        label: "Task progress",
                        value: `${task.progress}%`,
                        hint: `${completedSubTasks} of ${tracking.subTasks.length} work items complete`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "time",
                        label: "Time logged",
                        value: task.timeLogged,
                        hint: `of ${task.effortEstimate} estimated`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "blockers",
                        label: "Open blockers",
                        value: String(blockerCount),
                        hint: blockerSummary || "Nothing outstanding",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "deadline",
                        label: "Deadline",
                        value: formatDate(task.deadline),
                        delta: schedule.late ? schedule.text : undefined,
                        deltaTone: schedule.late ? "negative" : "neutral",
                        hint: schedule.late ? undefined : schedule.text,
                    }}
                />
            </div>

            {/* Body ------------------------------------------------------ */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
                {/* Main column ------------------------------------------- */}
                <div className="min-w-0 space-y-4">
                    {blockerCount > 0 && (
                        <SectionCard
                            title="Blockers"
                            description="These must close before the task can move to review."
                            contentClassName="p-0"
                        >
                            <ul className="divide-y">
                                {task.openIssues > 0 && (
                                    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                                        <AlertTriangle className="size-4 shrink-0 text-danger" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">
                                                Open issues
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {task.openIssues} to resolve
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            aria-expanded={issuesExpanded}
                                            aria-controls="issue-evidence"
                                            onClick={() => setIssuesExpanded((value) => !value)}
                                        >
                                            {issuesExpanded ? "Hide issue log" : "Show issue log"}
                                        </Button>
                                    </li>
                                )}
                                {issuesExpanded && (
                                    <li id="issue-evidence" className="bg-muted/30 px-5 py-4">
                                        {issues.length ? (
                                            <ul className="space-y-4">
                                                {issues.map((issue) => (
                                                    <li
                                                        key={issue.id}
                                                        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-foreground">
                                                                <span className="mr-2 text-xs tabular-nums text-muted-foreground">
                                                                    {issue.id}
                                                                </span>
                                                                {issue.topic}
                                                            </p>
                                                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                                                {issue.description}
                                                            </p>
                                                            <p className="mt-1 text-xs text-muted-foreground">
                                                                Assigned to {issue.assignedTo}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 md:justify-end">
                                                            <StatusBadge
                                                                status={TASK_ISSUE_SEVERITY_META[issue.severity]}
                                                            />
                                                            <StatusBadge
                                                                status={TASK_ISSUE_STATUS_META[issue.status]}
                                                            />
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No issue records are linked to this task. Reconcile the
                                                count on the task board.
                                            </p>
                                        )}
                                        {!linkedOpenIssues.length && task.openIssues > 0 && (
                                            <p className="mt-3 flex gap-2 text-sm leading-6 text-muted-foreground">
                                                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                                                The task counts {task.openIssues} open issues, but every
                                                linked record is already resolved. Reconcile before
                                                completion.
                                            </p>
                                        )}
                                    </li>
                                )}
                                {task.dependencies > 0 && (
                                    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                                        <Link2 className="size-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">
                                                Dependencies
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {task.dependencies} record
                                                {task.dependencies === 1 ? "" : "s"} to close
                                            </p>
                                        </div>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link href="/tasks/board">Open task board</Link>
                                        </Button>
                                    </li>
                                )}
                                {task.pendingApprovals > 0 && (
                                    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                                        <CheckCircle2 className="size-4 shrink-0 text-warning" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">
                                                Approvals
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {task.pendingApprovals} pending
                                            </p>
                                        </div>
                                        <Button variant="outline" size="sm" asChild>
                                            <a href="#approvals">Review approvers</a>
                                        </Button>
                                    </li>
                                )}
                            </ul>
                        </SectionCard>
                    )}

                    <SectionCard
                        title="Work plan"
                        description={`${completedSubTasks} of ${tracking.subTasks.length} complete`}
                        contentClassName="p-0"
                    >
                        <ol className="divide-y">
                            {tracking.subTasks.map((subTask) => (
                                <li
                                    key={subTask.id}
                                    className="grid gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center sm:gap-6"
                                >
                                    <div className="flex min-w-0 items-start gap-3">
                                        <span className="mt-0.5 shrink-0" aria-hidden>
                                            {subTask.completed ? (
                                                <CheckCircle2 className="size-4 text-success" />
                                            ) : (
                                                <Circle className="size-4 text-muted-foreground/50" />
                                            )}
                                        </span>
                                        <div className="min-w-0">
                                            <p
                                                className={cn(
                                                    "text-sm font-medium text-foreground",
                                                    subTask.completed && "text-muted-foreground"
                                                )}
                                            >
                                                {subTask.title}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {subTask.window}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pl-7 sm:pl-0">
                                        <Progress
                                            value={subTask.progress}
                                            className="h-1.5 bg-muted"
                                            aria-label={`${subTask.title} progress`}
                                        />
                                        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                                            {subTask.progress}%
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </SectionCard>

                    <SectionCard title="Activity" contentClassName="px-5 pb-5 pt-2">
                        <Tabs defaultValue="comments">
                            <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                                <TabsTrigger value="comments" className={tabTriggerClasses}>
                                    Comments{comments.length > 0 && ` (${comments.length})`}
                                </TabsTrigger>
                                <TabsTrigger value="worklog" className={tabTriggerClasses}>
                                    Work log
                                </TabsTrigger>
                                <TabsTrigger value="history" className={tabTriggerClasses}>
                                    History
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="comments" className="mt-4 space-y-5">
                                <CommentComposer onSubmit={addComment} />

                                {comments.length ? (
                                    <ol className="space-y-4 border-t pt-4">
                                        {comments.map((comment) => (
                                            <li key={comment.id} className="flex gap-3">
                                                <InitialsAvatar
                                                    name={comment.author}
                                                    size="sm"
                                                    className="mt-0.5"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm">
                                                        <span className="font-medium text-foreground">
                                                            {comment.author}
                                                        </span>
                                                        <span className="ml-2 text-xs text-muted-foreground">
                                                            {comment.role}
                                                        </span>
                                                        <time
                                                            dateTime={comment.at}
                                                            className="ml-2 text-xs tabular-nums text-muted-foreground"
                                                        >
                                                            {formatDateTime(comment.at)}
                                                        </time>
                                                    </p>
                                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
                                                        {comment.body}
                                                    </p>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p className="border-t pt-4 text-sm text-muted-foreground">
                                        No comments yet. Post the first update so the team knows what
                                        is holding this task.
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="worklog" className="mt-4">
                                {tracking.timeLogs.length ? (
                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="w-full min-w-[560px] text-sm">
                                            <thead>
                                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                                    <th className="px-4 py-2.5 font-medium">Member</th>
                                                    <th className="px-4 py-2.5 font-medium">Date</th>
                                                    <th className="px-4 py-2.5 font-medium">Duration</th>
                                                    <th className="px-4 py-2.5 font-medium">Type</th>
                                                    <th className="px-4 py-2.5 font-medium">Note</th>
                                                    <th className="px-4 py-2.5 font-medium">State</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tracking.timeLogs.map((row: TaskTimeLog) => (
                                                    <tr key={row.id} className="border-b last:border-0">
                                                        <td className="px-4 py-3 font-medium text-foreground">
                                                            {row.member}
                                                        </td>
                                                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                                            {formatDate(row.date)}
                                                        </td>
                                                        <td className="px-4 py-3 tabular-nums text-foreground">
                                                            {row.hours}h {String(row.minutes).padStart(2, "0")}m
                                                        </td>
                                                        <td className="px-4 py-3 text-muted-foreground">
                                                            {row.kind === "billable" ? "Billable" : "Non billable"}
                                                        </td>
                                                        <td className="max-w-xs px-4 py-3 text-muted-foreground">
                                                            {row.note}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <StatusBadge
                                                                status={
                                                                    row.state === "approved"
                                                                        ? { label: "Approved", tone: "success" }
                                                                        : { label: "Pending", tone: "warning" }
                                                                }
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="py-8 text-center text-sm text-muted-foreground">
                                        No time has been logged for this task.
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="history" className="mt-4 space-y-6">
                                <ol className="space-y-4">
                                    {tracking.statusHistory.map((change) => (
                                        <li
                                            key={change.id}
                                            className="grid gap-1 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
                                        >
                                            <time
                                                className="text-xs tabular-nums text-muted-foreground"
                                                dateTime={change.at}
                                            >
                                                {formatDateTime(change.at)}
                                            </time>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground">
                                                    {change.from} → {change.to}
                                                </p>
                                                <p className="mt-0.5 text-sm text-muted-foreground">
                                                    {change.reason}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Updated by {change.actor}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>

                                {tracking.dates.history.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground">
                                            Date revisions
                                        </h4>
                                        <ol className="mt-2 space-y-3">
                                            {tracking.dates.history.map((change) => (
                                                <li
                                                    key={change.id}
                                                    className="grid gap-1 rounded-lg border px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-foreground">
                                                            {change.kind}
                                                        </p>
                                                        <p className="mt-0.5 text-sm text-muted-foreground">
                                                            {change.reason}
                                                        </p>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            Updated by {change.updatedBy}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm tabular-nums text-foreground">
                                                        {formatDate(change.oldDate)} →{" "}
                                                        {formatDate(change.newDate)}
                                                    </p>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>
                    </SectionCard>
                </div>

                {/* Details rail ------------------------------------------ */}
                <div className="space-y-4">
                    <SectionCard title="Details">
                        <FieldList
                            items={[
                                [
                                    "Status",
                                    <StatusPicker key="s" status={status} onChange={setStatus} />,
                                ],
                                ["Priority", <StatusBadge key="p" status={WORK_TASK_PRIORITY_META[task.priority]} />],
                                ["Project", `${task.project} · ${task.projectType}`],
                                ["Location", task.location],
                                ["Assigned by", task.assignedBy.name],
                                ["Created by", task.createdBy.name],
                                ["Parent task", task.parentTask ?? "None"],
                                ["Repeats", recurrenceLabel(task)],
                            ]}
                        />
                        <div className="mt-4 border-t pt-4">
                            <p className="text-xs font-medium text-muted-foreground">Team</p>
                            <ul className="mt-2 space-y-2.5">
                                {task.team.map((member) => (
                                    <li key={member.id} className="flex items-center gap-2.5">
                                        <InitialsAvatar name={member.name} size="sm" />
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {member.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{member.role}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </SectionCard>

                    <SectionCard title="Dates">
                        <FieldList
                            items={[
                                ["Planned start", formatDate(tracking.dates.plannedStart)],
                                [
                                    "Due",
                                    <span key="due" className="block text-right">
                                        {formatDate(task.deadline)}
                                        <span
                                            className={cn(
                                                "block text-xs font-normal",
                                                schedule.late ? "text-danger" : "text-muted-foreground"
                                            )}
                                        >
                                            {schedule.text}
                                        </span>
                                    </span>,
                                ],
                                ["Actual start", formatDate(tracking.dates.actualStart)],
                                ["Revised end", formatDate(tracking.dates.revisedEnd)],
                                ["Duration", `${tracking.dates.durationDays} days`],
                            ]}
                        />
                    </SectionCard>

                    <SectionCard title="Time tracking">
                        <div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Logged</span>
                                <span className="font-medium tabular-nums text-foreground">
                                    {task.timeLogged} of {task.effortEstimate}
                                </span>
                            </div>
                            <Progress
                                value={
                                    (parseInt(task.timeLogged) / Math.max(1, parseInt(task.effortEstimate))) * 100
                                }
                                className="mt-2 h-1.5 bg-muted"
                                aria-label="Time logged against estimate"
                            />
                        </div>
                        <FieldList
                            className="mt-4 border-t pt-4"
                            items={[
                                ["Billable", task.billableHours],
                                ["Overtime", task.overtimeHours],
                                ["Buffer", task.bufferTime],
                                ["Slack", task.slackTime],
                            ]}
                        />
                    </SectionCard>

                    <SectionCard
                        title="Approvals"
                        description={`${approvedCount} of ${task.approvers.length} approved`}
                        contentClassName="p-0"
                    >
                        <div id="approvals" className="scroll-mt-20">
                            <ul className="divide-y">
                                {task.approvers.map((approver) => (
                                    <li
                                        key={approver.id}
                                        className="flex items-center gap-2.5 px-5 py-3"
                                    >
                                        <InitialsAvatar name={approver.name} size="sm" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {approver.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {approver.role}
                                            </p>
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
                            {task.pendingApprovals >
                                task.approvers.filter((approver) => !approver.approved).length && (
                                <p className="flex gap-2 border-t px-5 py-3 text-xs leading-5 text-muted-foreground">
                                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                                    {task.pendingApprovals} approvals are pending overall, but only{" "}
                                    {task.approvers.length} approvers are attached.
                                </p>
                            )}
                            <div className="border-t px-5 py-3">
                                <p className="text-xs font-medium text-muted-foreground">Reviewers</p>
                                <ul className="mt-2 space-y-2">
                                    {task.reviewers.map((reviewer) => (
                                        <li key={reviewer.id} className="flex items-center gap-2.5">
                                            <InitialsAvatar name={reviewer.name} size="sm" />
                                            <p className="truncate text-sm text-foreground">
                                                {reviewer.name}
                                                <span className="ml-1.5 text-xs text-muted-foreground">
                                                    {reviewer.role}
                                                </span>
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}
