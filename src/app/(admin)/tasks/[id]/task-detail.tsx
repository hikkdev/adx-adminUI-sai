"use client";

/* Hallmark - genre: modern-minimal - macrostructure: Record Dossier / Workbench */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Archive, ArrowUpRight, CheckCircle2, ChevronLeft, CircleAlert, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuditRow } from "@/services/audit";
import {
    LINKED_KIND_LABEL,
    canReview,
    isOpenIssue,
    istDayOf,
    linkedHref,
    personDetail,
    personName,
    recurrenceLabel,
    scheduleNote,
    taskHistory,
    workService,
    type WorkPerson,
    type WorkReviewer,
    type WorkTaskCard,
    type WorkTaskDetail,
    type WorkTimeLog,
} from "@/services/work";
import { WORK_ISSUE_SEVERITY_META, WORK_ISSUE_STATUS_META, WORK_PRIORITY_META, WORK_PROJECT_KIND_LABEL, WORK_TASK_STATUS_META, type WorkIssueSeverity } from "@/types";
import { PeoplePicker } from "../people-picker";
import { StatusMenu, statusErrorMessage } from "../status-menu";

interface TaskDetailProps {
    task: WorkTaskDetail;
    /** The audit rows written against the task, newest first; empty until read. */
    history: AuditRow[];
    historyError: string | null;
    onChanged: () => void;
}

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

/** Underline tab trigger, same treatment as DetailShell. */
const tabTriggerClasses =
    "rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

const isFinished = (status: string) => status === "VERIFIED" || status === "ARCHIVED";

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

function CommentComposer({ author, onSubmit, busy }: { author: string; onSubmit: (body: string) => Promise<void>; busy: boolean }) {
    const [body, setBody] = React.useState("");
    const [active, setActive] = React.useState(false);
    const trimmed = body.trim();

    const submit = async () => {
        if (!trimmed || busy) return;
        await onSubmit(trimmed);
        setBody("");
        setActive(false);
    };

    return (
        <div className="flex gap-3">
            <InitialsAvatar name={author} size="sm" className="mt-0.5" />
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
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
                    }}
                    placeholder="Add an update so the team knows where this stands"
                    className={cn("resize-y shadow-none", active ? "min-h-24" : "min-h-11")}
                />
                {(active || trimmed) && (
                    <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" onClick={() => void submit()} disabled={!trimmed || busy}>
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
                        <span className="ml-auto text-xs text-muted-foreground">Ctrl + Enter to post</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */

/**
 * The DR 10 frame `Task detail · /tasks/:id`, over `GET /work/tasks/:id`.
 *
 * The frame's dossier is kept: the header with the status and the
 * priority, the four tiles, the blockers, the work plan (the sub-tasks,
 * with one created inline), the activity card with its three tabs —
 * Comments, Work log, History — and the rail: details and team, dates,
 * time tracking, approvals. What each holds is the record's own:
 *
 * - Comments are `POST /comments` and the read's `comments`; the work log
 *   is the read's `timeLogs` with `POST /time-logs` and a delete. The
 *   HEAD's "billable | non_billable" kind is the `billable` boolean; its
 *   "approved | pending" state is gone — there is no approval engine on
 *   hours (Q70), only the reviewer's sign-off on the task.
 * - History is the audit trail: a status move is a row whose diff moves
 *   `status` (its reason and route in the metadata), a date change a diff
 *   on `startDate`, `deadline` or `revisedEndDate`. There are no baseline
 *   rows, because there is no baseline.
 * - The dates card is planned, actual and revised; buffer, slack and
 *   overtime have no source and are not drawn.
 * - The review bar shows to a reviewer of the task, or `work.approve`,
 *   while the task is under review; Block asks for a reason; Archive is a
 *   status move that needs `work.edit`.
 */
export function TaskDetail({ task, history, historyError, onChanged }: TaskDetailProps) {
    const router = useRouter();
    const { user, can } = useAuth();
    const mayEdit = can("work.edit");
    const mayApprove = can("work.approve");
    const reviewer = canReview(task, user?.id, mayApprove);
    const isAssignee = task.assignees.some((person) => person.userId === user?.id);
    const [busy, setBusy] = React.useState(false);
    const [issuesExpanded, setIssuesExpanded] = React.useState(false);

    const [rejectOpen, setRejectOpen] = React.useState(false);
    const [rejectNote, setRejectNote] = React.useState("");
    const [archiveOpen, setArchiveOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);

    const [subTaskOpen, setSubTaskOpen] = React.useState(false);
    const [subTaskDraft, setSubTaskDraft] = React.useState({ title: "", deadline: "" });

    const [logOpen, setLogOpen] = React.useState(false);
    const [logDraft, setLogDraft] = React.useState({ forDate: istDayOf(new Date().toISOString()), hours: "1", billable: "false", note: "" });

    const [datesEditing, setDatesEditing] = React.useState(false);
    const [datesDraft, setDatesDraft] = React.useState({ startDate: istDayOf(task.startDate), deadline: istDayOf(task.deadline), revisedEndDate: istDayOf(task.revisedEndDate) });

    const [teamOpen, setTeamOpen] = React.useState(false);
    const [teamDraft, setTeamDraft] = React.useState<string[]>([]);
    const [reviewersOpen, setReviewersOpen] = React.useState(false);
    const [reviewersDraft, setReviewersDraft] = React.useState<{ userId: string; approver: boolean }[]>([]);
    const [prereqOpen, setPrereqOpen] = React.useState(false);
    const [prereqDraft, setPrereqDraft] = React.useState<string[]>([]);

    const [issueOpen, setIssueOpen] = React.useState(false);
    const [issueDraft, setIssueDraft] = React.useState({ title: "", description: "", severity: "MEDIUM" as WorkIssueSeverity });

    /* The open tasks a prerequisite can be chosen from — read only when the picker opens. */
    const candidates = useApiResource<WorkTaskCard[]>(`work:task:${task.id}:prereq-candidates:${prereqOpen}`, () =>
        prereqOpen ? workService.tasks.list({ pageSize: 100, sort: "UPDATED" }).then((page) => page.items).catch(() => [] as WorkTaskCard[]) : Promise.resolve([]),
    );

    const run = async (work: () => Promise<unknown>, done: string, fallback: string, after?: () => void) => {
        setBusy(true);
        try {
            await work();
            toast.success(done);
            after?.();
            onChanged();
            return true;
        } catch (caught) {
            toast.error(message(caught, fallback));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const today = istDayOf(new Date().toISOString());
    const schedule = scheduleNote(task.deadline, today);
    const trail = React.useMemo(() => taskHistory(history), [history]);
    const openIssues = task.issues.filter(isOpenIssue);
    const unfinishedPrerequisites = task.prerequisites.filter((row) => !isFinished(row.status));
    const awaitingApprovers = task.status === "PENDING_REVIEW" ? task.reviewers.filter((row) => row.approver && !row.approvedAt) : [];
    const blockerCount = openIssues.length + unfinishedPrerequisites.length + awaitingApprovers.length;
    const blockerSummary = [
        openIssues.length > 0 && `${openIssues.length} ${openIssues.length === 1 ? "issue" : "issues"}`,
        unfinishedPrerequisites.length > 0 && `${unfinishedPrerequisites.length} ${unfinishedPrerequisites.length === 1 ? "prerequisite" : "prerequisites"}`,
        awaitingApprovers.length > 0 && `${awaitingApprovers.length} ${awaitingApprovers.length === 1 ? "approval" : "approvals"}`,
    ]
        .filter(Boolean)
        .join(" · ");
    const verifiedChildren = task.children.filter((child) => child.status === "VERIFIED").length;
    const approvedCount = task.reviewers.filter((row) => row.approvedAt).length;
    const hours = task.timeLogs.totals.hours;
    const estimate = task.effortEstimateH;
    const linked = task.linked ? linkedHref(task.linked) : null;

    const reviewerMark = (row: WorkReviewer) =>
        row.approvedAt
            ? { label: "Approved", tone: "success" as const }
            : row.rejectedAt
              ? { label: "Sent back", tone: "danger" as const }
              : task.status === "PENDING_REVIEW"
                ? { label: "Awaiting", tone: "warning" as const }
                : { label: row.approver ? "Approver" : "Reviewer", tone: "neutral" as const };

    return (
        <div className="space-y-5">
            {/* Header ---------------------------------------------------- */}
            <div>
                <Link href="/tasks/board" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    Task board
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{task.title}</h1>
                            <StatusMenu taskId={task.id} status={task.status} onMoved={onChanged} />
                            <StatusBadge status={WORK_PRIORITY_META[task.priority]} />
                            {task.overdue && <StatusBadge status={{ label: "Overdue", tone: "danger" }} />}
                            {task.blockedByIssue && <StatusBadge status={{ label: "Blocked by a critical issue", tone: "danger" }} />}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {task.displayId ?? task.id}
                            {task.description ? ` · ${task.description}` : ""}
                        </p>
                        {task.status === "BLOCKED" && task.blockedReason && (
                            <p className="mt-1 flex items-start gap-1.5 text-sm text-danger">
                                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                                Blocked: {task.blockedReason}
                            </p>
                        )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {mayEdit && (
                            <Button variant="outline" className="bg-card" asChild>
                                <Link href={`/tasks/${encodeURIComponent(task.id)}/edit`}>Edit task</Link>
                            </Button>
                        )}
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/tasks/issues">View issues</Link>
                        </Button>
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/tasks/board">Open task board</Link>
                        </Button>
                        {mayEdit && task.status !== "ARCHIVED" && (
                            <Button variant="outline" className="bg-card text-danger hover:text-danger" onClick={() => (task.status === "DRAFT" && task.children.length === 0 ? setDeleteOpen(true) : setArchiveOpen(true))} disabled={busy}>
                                {task.status === "DRAFT" && task.children.length === 0 ? <Trash2 className="size-4" /> : <Archive className="size-4" />}
                                {task.status === "DRAFT" && task.children.length === 0 ? "Delete draft" : "Archive"}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Review bar ------------------------------------------------ */}
            {reviewer && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-soft px-5 py-3" data-testid="review-bar">
                    <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-warning" />
                        <div>
                            <p className="text-sm font-medium text-foreground">This task is waiting for your review</p>
                            <p className="text-xs text-muted-foreground">
                                {task.reviewers.some((row) => row.approver)
                                    ? `Verified once every approver has approved — ${approvedCount} of ${task.reviewers.filter((row) => row.approver).length} so far.`
                                    : "Any reviewer's approval verifies it."}{" "}
                                Rejecting sends it back to In progress with your note as a comment.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" onClick={() => setRejectOpen(true)} disabled={busy}>
                            Reject
                        </Button>
                        <Button onClick={() => void run(() => workService.tasks.review(task.id, "APPROVE"), "Approved", "Could not record the approval.")} disabled={busy}>
                            Approve
                        </Button>
                    </div>
                </div>
            )}

            {/* KPI row --------------------------------------------------- */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "progress",
                        label: "Task progress",
                        value: `${task.progress}%`,
                        hint: task.children.length ? `${verifiedChildren} of ${task.children.length} sub-tasks verified — the mean of their progress` : "set by hand, or 100 on verification",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "time",
                        label: "Time logged",
                        value: `${hours}h`,
                        hint: estimate !== null ? `of ${estimate}h estimated · ${task.timeLogs.totals.billableHours}h billable` : `${task.timeLogs.totals.billableHours}h billable · no estimate`,
                    }}
                />
                <KpiCard stat={{ id: "blockers", label: "Open blockers", value: String(blockerCount), hint: blockerSummary || "Nothing outstanding" }} />
                <KpiCard
                    stat={{
                        id: "deadline",
                        label: "Deadline",
                        value: task.deadline ? formatDate(task.deadline) : "—",
                        delta: schedule?.late ? schedule.text : undefined,
                        deltaTone: schedule?.late ? "negative" : "neutral",
                        hint: schedule && !schedule.late ? schedule.text : task.deadline ? undefined : "no deadline set",
                    }}
                />
            </div>

            {/* Body ------------------------------------------------------ */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
                {/* Main column ------------------------------------------- */}
                <div className="min-w-0 space-y-4">
                    {blockerCount > 0 && (
                        <SectionCard title="Blockers" description="These must close before the task can move on." contentClassName="p-0">
                            <ul className="divide-y">
                                {openIssues.length > 0 && (
                                    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                                        <AlertTriangle className="size-4 shrink-0 text-danger" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">Open issues</p>
                                            <p className="text-xs text-muted-foreground">
                                                {openIssues.length} to resolve{task.blockedByIssue ? " — a critical one holds the task" : ""}
                                            </p>
                                        </div>
                                        <Button variant="outline" size="sm" aria-expanded={issuesExpanded} aria-controls="issue-evidence" onClick={() => setIssuesExpanded((value) => !value)}>
                                            {issuesExpanded ? "Hide issue log" : "Show issue log"}
                                        </Button>
                                    </li>
                                )}
                                {issuesExpanded && (
                                    <li id="issue-evidence" className="bg-muted/30 px-5 py-4">
                                        <ul className="space-y-4">
                                            {task.issues.map((issue) => (
                                                <li key={issue.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-foreground">
                                                            <span className="mr-2 text-xs tabular-nums text-muted-foreground">{issue.displayId ?? issue.id}</span>
                                                            {issue.title}
                                                        </p>
                                                        {issue.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{issue.description}</p>}
                                                        <p className="mt-1 text-xs text-muted-foreground">{issue.assignee ? `Assigned to ${personName(issue.assignee)}` : "Unassigned"}</p>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 md:justify-end">
                                                        <StatusBadge status={WORK_ISSUE_SEVERITY_META[issue.severity]} />
                                                        <StatusBadge status={WORK_ISSUE_STATUS_META[issue.status]} />
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                        <Link href="/tasks/issues" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                                            Work them in the risk log
                                            <ArrowUpRight className="size-3.5" />
                                        </Link>
                                    </li>
                                )}
                                {unfinishedPrerequisites.length > 0 && (
                                    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                                        <Link2 className="size-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">Prerequisites</p>
                                            <p className="text-xs text-muted-foreground">
                                                {unfinishedPrerequisites.map((row) => row.displayId ?? row.title).join(", ")} — not yet verified, so this task cannot start
                                            </p>
                                        </div>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link href={`/tasks/${encodeURIComponent(unfinishedPrerequisites[0].id)}`}>Open the first</Link>
                                        </Button>
                                    </li>
                                )}
                                {awaitingApprovers.length > 0 && (
                                    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                                        <CheckCircle2 className="size-4 shrink-0 text-warning" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">Approvals</p>
                                            <p className="text-xs text-muted-foreground">{awaitingApprovers.map((row) => personName(row)).join(", ")} still to approve</p>
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
                        title="Sub-tasks"
                        description={task.children.length ? `${verifiedChildren} of ${task.children.length} verified` : "Break the work down; the parent's progress is the mean of theirs"}
                        actions={
                            mayEdit && task.status !== "ARCHIVED" ? (
                                <Button variant="outline" size="sm" className="bg-card" onClick={() => setSubTaskOpen((open) => !open)}>
                                    <Plus className="size-3.5" />
                                    Add sub-task
                                </Button>
                            ) : undefined
                        }
                        contentClassName="p-0"
                    >
                        {subTaskOpen && (
                            <form
                                className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-5 py-3"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!subTaskDraft.title.trim()) return;
                                    void run(
                                        () =>
                                            workService.tasks.create({
                                                title: subTaskDraft.title.trim(),
                                                parentTaskId: task.id,
                                                priority: task.priority,
                                                ...(subTaskDraft.deadline ? { deadline: subTaskDraft.deadline } : {}),
                                                assigneeUserIds: task.assignees.map((person) => person.userId),
                                            }),
                                        "Sub-task created",
                                        "Could not create the sub-task.",
                                        () => {
                                            setSubTaskDraft({ title: "", deadline: "" });
                                            setSubTaskOpen(false);
                                        },
                                    );
                                }}
                            >
                                <Input value={subTaskDraft.title} onChange={(event) => setSubTaskDraft((d) => ({ ...d, title: event.target.value }))} aria-label="Sub-task title" placeholder="What is the sub-task?" className="h-8 min-w-[12rem] flex-1" autoFocus />
                                <Input type="date" value={subTaskDraft.deadline} onChange={(event) => setSubTaskDraft((d) => ({ ...d, deadline: event.target.value }))} aria-label="Sub-task deadline" className="h-8 w-40 tabular-nums" />
                                <Button size="sm" className="h-8" type="submit" disabled={busy || !subTaskDraft.title.trim()}>
                                    Create
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8" type="button" onClick={() => setSubTaskOpen(false)}>
                                    Cancel
                                </Button>
                                <p className="basis-full text-xs text-muted-foreground">Inherits the project, the priority and the assignees; edit it after.</p>
                            </form>
                        )}
                        {task.children.length ? (
                            <ol className="divide-y">
                                {task.children.map((child) => (
                                    <li key={child.id} className="grid gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center sm:gap-6">
                                        <div className="flex min-w-0 items-start gap-3">
                                            {child.status === "VERIFIED" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <span className="mt-1 size-3 shrink-0 rounded-full border-2 border-muted-foreground/40" />}
                                            <div className="min-w-0">
                                                <Link href={`/tasks/${encodeURIComponent(child.id)}`} className={cn("text-sm font-medium text-foreground hover:underline", child.status === "VERIFIED" && "text-muted-foreground")}>
                                                    {child.title}
                                                </Link>
                                                <p className="text-xs text-muted-foreground">
                                                    {child.displayId ?? child.id}
                                                    {child.deadline ? ` · due ${formatDate(child.deadline)}` : ""}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 pl-7 sm:pl-0">
                                            <Progress value={child.progress} className="h-1.5 bg-muted" aria-label={`${child.title} progress`} />
                                            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{child.progress}%</span>
                                            <StatusBadge status={WORK_TASK_STATUS_META[child.status]} />
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="px-5 py-6 text-sm text-muted-foreground">No sub-tasks yet.</p>
                        )}
                        {task.childrenAllVerified && task.status !== "VERIFIED" && task.status !== "ARCHIVED" && (
                            <p className="flex gap-2 border-t px-5 py-3 text-xs leading-5 text-muted-foreground">
                                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                                Every sub-task is verified — the parent is offered Verified, never moved there on its own.
                            </p>
                        )}
                    </SectionCard>

                    <SectionCard
                        title="Dependencies"
                        description="What must be verified before this starts, and what waits on it"
                        actions={
                            mayEdit ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-card"
                                    onClick={() => {
                                        setPrereqDraft(task.prerequisites.map((row) => row.id));
                                        setPrereqOpen(true);
                                    }}
                                >
                                    <Pencil className="size-3.5" />
                                    Edit
                                </Button>
                            ) : undefined
                        }
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground">Prerequisites</p>
                                {task.prerequisites.length ? (
                                    <ul className="mt-2 space-y-2">
                                        {task.prerequisites.map((row) => (
                                            <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                                                <Link href={`/tasks/${encodeURIComponent(row.id)}`} className="min-w-0 truncate text-foreground hover:underline">
                                                    {row.title}
                                                </Link>
                                                <StatusBadge status={WORK_TASK_STATUS_META[row.status]} />
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">None.</p>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-medium text-muted-foreground">Waiting on this task</p>
                                {task.dependents.length ? (
                                    <ul className="mt-2 space-y-2">
                                        {task.dependents.map((row) => (
                                            <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                                                <Link href={`/tasks/${encodeURIComponent(row.id)}`} className="min-w-0 truncate text-foreground hover:underline">
                                                    {row.title}
                                                </Link>
                                                <StatusBadge status={WORK_TASK_STATUS_META[row.status]} />
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">Nothing.</p>
                                )}
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Activity" contentClassName="px-5 pb-5 pt-2">
                        <Tabs defaultValue="comments">
                            <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                                <TabsTrigger value="comments" className={tabTriggerClasses}>
                                    Comments{task.comments.length > 0 && ` (${task.comments.length})`}
                                </TabsTrigger>
                                <TabsTrigger value="worklog" className={tabTriggerClasses}>
                                    Work log
                                </TabsTrigger>
                                <TabsTrigger value="history" className={tabTriggerClasses}>
                                    History
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="comments" className="mt-4 space-y-5">
                                <CommentComposer
                                    author={user?.name ?? "You"}
                                    busy={busy}
                                    onSubmit={async (body) => {
                                        await run(() => workService.tasks.comment(task.id, body), "Comment posted", "Could not post the comment.");
                                    }}
                                />
                                {task.comments.length ? (
                                    <ol className="space-y-4 border-t pt-4">
                                        {[...task.comments].reverse().map((comment) => (
                                            <li key={comment.id} className="flex gap-3">
                                                <InitialsAvatar name={personName(comment.author)} size="sm" className="mt-0.5" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm">
                                                        <span className="font-medium text-foreground">{personName(comment.author)}</span>
                                                        {comment.author.role && <span className="ml-2 text-xs text-muted-foreground">{comment.author.role}</span>}
                                                        <time dateTime={comment.createdAt} className="ml-2 text-xs tabular-nums text-muted-foreground">
                                                            {formatDateTime(comment.createdAt)}
                                                        </time>
                                                    </p>
                                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{comment.body}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p className="border-t pt-4 text-sm text-muted-foreground">No comments yet. Post the first update so the team knows what is holding this task.</p>
                                )}
                            </TabsContent>

                            <TabsContent value="worklog" className="mt-4 space-y-3">
                                <div className="flex justify-end">
                                    {(isAssignee || mayEdit) && (
                                        <Button variant="outline" size="sm" className="bg-card" onClick={() => setLogOpen(true)}>
                                            <Plus className="size-3.5" />
                                            Log time
                                        </Button>
                                    )}
                                </div>
                                {task.timeLogs.rows.length ? (
                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="w-full min-w-[640px] text-sm">
                                            <thead>
                                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                                    <th className="px-4 py-2.5 font-medium">Member</th>
                                                    <th className="px-4 py-2.5 font-medium">Date</th>
                                                    <th className="px-4 py-2.5 font-medium">Duration</th>
                                                    <th className="px-4 py-2.5 font-medium">Type</th>
                                                    <th className="px-4 py-2.5 font-medium">Note</th>
                                                    <th className="px-2 py-2.5">
                                                        <span className="sr-only">Actions</span>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {task.timeLogs.rows.map((row: WorkTimeLog) => (
                                                    <tr key={row.id} className="border-b last:border-0">
                                                        <td className="px-4 py-3 font-medium text-foreground">{personName(row.person)}</td>
                                                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDate(row.forDate)}</td>
                                                        <td className="px-4 py-3 tabular-nums text-foreground">{row.hours}h</td>
                                                        <td className="px-4 py-3 text-muted-foreground">{row.billable ? "Billable" : "Non billable"}</td>
                                                        <td className="max-w-xs px-4 py-3 text-muted-foreground">{row.note ?? "—"}</td>
                                                        <td className="px-2 py-3">
                                                            {(mayEdit || row.person.userId === user?.id) && (
                                                                <div className="flex justify-end">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="size-7"
                                                                        aria-label={`Delete entry by ${personName(row.person)}`}
                                                                        disabled={busy}
                                                                        onClick={() => void run(() => workService.tasks.deleteTimeLog(task.id, row.id), "Time entry deleted", "Could not delete the entry.")}
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-muted/30 text-xs text-muted-foreground">
                                                    <td className="px-4 py-2.5 font-medium" colSpan={2}>
                                                        Total
                                                    </td>
                                                    <td className="px-4 py-2.5 tabular-nums font-medium text-foreground">{task.timeLogs.totals.hours}h</td>
                                                    <td className="px-4 py-2.5" colSpan={3}>
                                                        {task.timeLogs.totals.billableHours}h billable
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="py-8 text-center text-sm text-muted-foreground">No time has been logged for this task.</p>
                                )}
                            </TabsContent>

                            <TabsContent value="history" className="mt-4 space-y-6">
                                {historyError && <p className="text-sm text-danger">{historyError}</p>}
                                {trail.status.length ? (
                                    <ol className="space-y-4">
                                        {trail.status.map((change) => (
                                            <li key={change.id} className="grid gap-1 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                                                <time className="text-xs tabular-nums text-muted-foreground" dateTime={change.at}>
                                                    {formatDateTime(change.at)}
                                                </time>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-foreground">
                                                        {change.from} → {change.to}
                                                    </p>
                                                    {change.reason && <p className="mt-0.5 text-sm text-muted-foreground">{change.reason}</p>}
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {change.via === "review" ? "Through a review" : "Moved"} by {change.actor}
                                                    </p>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p className="text-sm text-muted-foreground">{historyError ? "" : "No status change recorded yet."}</p>
                                )}

                                {trail.dates.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground">Date revisions</h4>
                                        <ol className="mt-2 space-y-3">
                                            {trail.dates.map((change) => (
                                                <li key={change.id} className="grid gap-1 rounded-lg border px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-foreground">{change.kind}</p>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            Updated by {change.updatedBy} · {formatDateTime(change.at)}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm tabular-nums text-foreground">
                                                        {change.oldDate ? formatDate(change.oldDate) : "—"} → {change.newDate ? formatDate(change.newDate) : "—"}
                                                    </p>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                )}

                                {trail.activity.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground">Everything else</h4>
                                        <ol className="mt-2 space-y-2">
                                            {trail.activity.map((row) => (
                                                <li key={row.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                                                    <time className="text-xs tabular-nums text-muted-foreground" dateTime={row.at}>
                                                        {formatDateTime(row.at)}
                                                    </time>
                                                    <span className="font-medium text-foreground">{row.action}</span>
                                                    {row.detail && <span className="text-muted-foreground">{row.detail}</span>}
                                                    <span className="text-xs text-muted-foreground">by {row.actor}</span>
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
                                ["Status", <StatusMenu key="s" taskId={task.id} status={task.status} onMoved={onChanged} />],
                                ["Priority", <StatusBadge key="p" status={WORK_PRIORITY_META[task.priority]} />],
                                ["Project", task.project ? `${task.project.name} · ${WORK_PROJECT_KIND_LABEL[task.project.kind]}` : "None"],
                                [
                                    "About",
                                    task.linked ? (
                                        linked ? (
                                            <Link key="linked" href={linked} className="hover:underline">
                                                {LINKED_KIND_LABEL[task.linked.kind]}: {task.linked.label ?? task.linked.id}
                                            </Link>
                                        ) : (
                                            `${LINKED_KIND_LABEL[task.linked.kind]}: ${task.linked.label ?? task.linked.id}`
                                        )
                                    ) : (
                                        "—"
                                    ),
                                ],
                                ["Assigned by", task.assignedBy ? personName(task.assignedBy) : "—"],
                                ["Created by", personName(task.createdBy)],
                                [
                                    "Parent task",
                                    task.parent ? (
                                        <Link key="parent" href={`/tasks/${encodeURIComponent(task.parent.id)}`} className="hover:underline">
                                            {task.parent.title}
                                        </Link>
                                    ) : (
                                        "None"
                                    ),
                                ],
                                ["Repeats", recurrenceLabel(task.recurrence)],
                                ["Tags", task.tags.join(", ") || "—"],
                            ]}
                        />
                        <div className="mt-4 border-t pt-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-muted-foreground">Team</p>
                                {mayEdit && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => {
                                            setTeamDraft(task.assignees.map((person) => person.userId));
                                            setTeamOpen(true);
                                        }}
                                    >
                                        <Pencil className="size-3.5" />
                                        Edit
                                    </Button>
                                )}
                            </div>
                            {task.assignees.length ? (
                                <ul className="mt-2 space-y-2.5">
                                    {task.assignees.map((person) => (
                                        <li key={person.userId} className="flex items-center gap-2.5">
                                            <InitialsAvatar name={personName(person)} size="sm" />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">{personName(person)}</p>
                                                <p className="text-xs text-muted-foreground">{personDetail(person)}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-2 text-sm text-muted-foreground">Nobody is assigned.</p>
                            )}
                        </div>
                    </SectionCard>

                    <SectionCard
                        title="Dates"
                        actions={
                            datesEditing ? (
                                <div className="flex items-center gap-1.5">
                                    <Button variant="ghost" size="sm" className="h-7" onClick={() => setDatesEditing(false)} disabled={busy}>
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-7"
                                        disabled={busy}
                                        onClick={() => {
                                            const patch = {
                                                ...(datesDraft.startDate !== istDayOf(task.startDate) ? { startDate: datesDraft.startDate || null } : {}),
                                                ...(datesDraft.deadline !== istDayOf(task.deadline) ? { deadline: datesDraft.deadline || null } : {}),
                                                ...(datesDraft.revisedEndDate !== istDayOf(task.revisedEndDate) ? { revisedEndDate: datesDraft.revisedEndDate || null } : {}),
                                            };
                                            if (Object.keys(patch).length === 0) {
                                                setDatesEditing(false);
                                                return;
                                            }
                                            void run(() => workService.tasks.patch(task.id, patch), "Dates updated", "Could not update the dates.", () => setDatesEditing(false));
                                        }}
                                    >
                                        Save
                                    </Button>
                                </div>
                            ) : mayEdit ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    aria-label="Edit dates"
                                    onClick={() => {
                                        setDatesDraft({ startDate: istDayOf(task.startDate), deadline: istDayOf(task.deadline), revisedEndDate: istDayOf(task.revisedEndDate) });
                                        setDatesEditing(true);
                                    }}
                                >
                                    <Pencil className="size-3.5" />
                                </Button>
                            ) : undefined
                        }
                    >
                        {datesEditing ? (
                            <div className="grid gap-3">
                                {(
                                    [
                                        ["startDate", "Planned start"],
                                        ["deadline", "Deadline"],
                                        ["revisedEndDate", "Revised end"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <div key={key} className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-3">
                                        <Label htmlFor={`date-${key}`} className="text-sm font-normal text-muted-foreground">
                                            {label}
                                        </Label>
                                        <Input id={`date-${key}`} type="date" value={datesDraft[key]} onChange={(event) => setDatesDraft((d) => ({ ...d, [key]: event.target.value }))} className="h-8 tabular-nums" />
                                    </div>
                                ))}
                                <p className="text-xs text-muted-foreground">The actual start is stamped when the task starts; the completion when it is verified.</p>
                            </div>
                        ) : (
                            <FieldList
                                items={[
                                    ["Planned start", task.startDate ? formatDate(task.startDate) : "—"],
                                    [
                                        "Due",
                                        <span key="due" className="block text-right">
                                            {task.deadline ? formatDate(task.deadline) : "—"}
                                            {schedule && <span className={cn("block text-xs font-normal", schedule.late ? "text-danger" : "text-muted-foreground")}>{schedule.text}</span>}
                                        </span>,
                                    ],
                                    ["Actual start", task.actualStartDate ? formatDate(task.actualStartDate) : "Not started"],
                                    ["Revised end", task.revisedEndDate ? formatDate(task.revisedEndDate) : "—"],
                                    ["Completed", task.completedAt ? formatDate(task.completedAt) : "—"],
                                ]}
                            />
                        )}
                    </SectionCard>

                    <SectionCard title="Time tracking">
                        <div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Logged</span>
                                <span className="font-medium tabular-nums text-foreground">
                                    {hours}h{estimate !== null ? ` of ${estimate}h` : ""}
                                </span>
                            </div>
                            <Progress value={estimate ? Math.min(100, (hours / estimate) * 100) : 0} className="mt-2 h-1.5 bg-muted" aria-label="Time logged against estimate" />
                        </div>
                        <FieldList
                            className="mt-4 border-t pt-4"
                            items={[
                                ["Billable", `${task.timeLogs.totals.billableHours}h`],
                                ["Non billable", `${Math.round((hours - task.timeLogs.totals.billableHours) * 100) / 100}h`],
                                ["Estimate", estimate !== null ? `${estimate}h` : "—"],
                            ]}
                        />
                    </SectionCard>

                    <SectionCard
                        title="Reviewers"
                        description={task.reviewers.length ? `${approvedCount} of ${task.reviewers.length} approved` : "No reviewers — the task verifies on completion"}
                        actions={
                            mayEdit ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    aria-label="Edit reviewers"
                                    onClick={() => {
                                        setReviewersDraft(task.reviewers.map((row) => ({ userId: row.userId, approver: row.approver })));
                                        setReviewersOpen(true);
                                    }}
                                >
                                    <Pencil className="size-3.5" />
                                </Button>
                            ) : undefined
                        }
                        contentClassName="p-0"
                    >
                        <div id="approvals" className="scroll-mt-20">
                            {task.reviewers.length ? (
                                <ul className="divide-y">
                                    {task.reviewers.map((row) => (
                                        <li key={row.userId} className="px-5 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <InitialsAvatar name={personName(row)} size="sm" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-foreground">{personName(row)}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {row.role ?? "—"}
                                                        {row.approver ? " · approver" : ""}
                                                    </p>
                                                </div>
                                                <StatusBadge status={reviewerMark(row)} />
                                            </div>
                                            {row.note && <p className="mt-1.5 pl-9 text-xs text-muted-foreground">{row.note}</p>}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="px-5 py-4 text-sm text-muted-foreground">Nobody reviews this task.</p>
                            )}
                        </div>
                    </SectionCard>

                    <SectionCard
                        title="Issues"
                        description={openIssues.length ? `${openIssues.length} open of ${task.issues.length}` : task.issues.length ? `${task.issues.length} closed` : "Nothing raised"}
                        actions={
                            mayEdit ? (
                                <Button variant="outline" size="sm" className="bg-card" onClick={() => setIssueOpen(true)}>
                                    <Plus className="size-3.5" />
                                    Raise
                                </Button>
                            ) : undefined
                        }
                        contentClassName="p-0"
                    >
                        {task.issues.length ? (
                            <ul className="divide-y">
                                {task.issues.map((issue) => (
                                    <li key={issue.id} className="flex items-center gap-2 px-5 py-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">{issue.title}</p>
                                            <p className="text-xs text-muted-foreground">{issue.displayId ?? issue.id}</p>
                                        </div>
                                        <StatusBadge status={WORK_ISSUE_SEVERITY_META[issue.severity]} />
                                        <StatusBadge status={WORK_ISSUE_STATUS_META[issue.status]} />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="px-5 py-4 text-sm text-muted-foreground">No issue sits on this task.</p>
                        )}
                    </SectionCard>
                </div>
            </div>

            {/* Reject dialog -------------------------------------------- */}
            <Dialog open={rejectOpen} onOpenChange={(open) => !busy && setRejectOpen(open)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Send the task back</DialogTitle>
                        <DialogDescription>The task returns to In progress; your note is filed as a comment and the assignees are told.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5 py-1">
                        <Label htmlFor="reject-note">Note</Label>
                        <Textarea id="reject-note" rows={3} value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="What needs to change?" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setRejectOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={busy || !rejectNote.trim()}
                            onClick={() =>
                                void run(() => workService.tasks.review(task.id, "REJECT", rejectNote), "Sent back to In progress", "Could not record the rejection.", () => {
                                    setRejectOpen(false);
                                    setRejectNote("");
                                })
                            }
                        >
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={archiveOpen}
                onOpenChange={(open) => !open && setArchiveOpen(false)}
                title={`Archive ${task.displayId ?? "this task"}?`}
                description="An archived task leaves every list and number; its record and history stay."
                confirmLabel="Archive"
                destructive
                busy={busy}
                onConfirm={async () => {
                    setBusy(true);
                    try {
                        await workService.tasks.setStatus(task.id, "ARCHIVED");
                        toast.success("Task archived");
                        setArchiveOpen(false);
                        onChanged();
                    } catch (caught) {
                        toast.error(statusErrorMessage(caught));
                    } finally {
                        setBusy(false);
                    }
                }}
            />

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={(open) => !open && setDeleteOpen(false)}
                title={`Delete ${task.displayId ?? "this draft"}?`}
                description="A draft with no sub-tasks is deleted outright; nothing else is touched."
                confirmLabel="Delete draft"
                destructive
                busy={busy}
                onConfirm={async () => {
                    setBusy(true);
                    try {
                        await workService.tasks.remove(task.id);
                        toast.success("Draft deleted");
                        router.push("/tasks/board");
                    } catch (caught) {
                        toast.error(message(caught, "Could not delete the draft."));
                        setBusy(false);
                    }
                }}
            />

            {/* Time log editor ------------------------------------------ */}
            <Dialog open={logOpen} onOpenChange={(open) => !busy && setLogOpen(open)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Log time</DialogTitle>
                        <DialogDescription>Your own hours against this task for a day — a quarter hour to twenty-four.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="log-date">Date</Label>
                                <Input id="log-date" type="date" value={logDraft.forDate} onChange={(event) => setLogDraft((d) => ({ ...d, forDate: event.target.value }))} className="tabular-nums" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="log-hours">Hours</Label>
                                <Input id="log-hours" type="number" min="0.25" max="24" step="0.25" value={logDraft.hours} onChange={(event) => setLogDraft((d) => ({ ...d, hours: event.target.value }))} className="tabular-nums" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="log-kind">Type</Label>
                                <Select value={logDraft.billable} onValueChange={(value) => setLogDraft((d) => ({ ...d, billable: value }))}>
                                    <SelectTrigger id="log-kind">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true">Billable</SelectItem>
                                        <SelectItem value="false">Non billable</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="log-note">Note</Label>
                            <Textarea id="log-note" rows={2} value={logDraft.note} onChange={(event) => setLogDraft((d) => ({ ...d, note: event.target.value }))} placeholder="What was the time spent on?" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setLogOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            disabled={busy}
                            onClick={() => {
                                const hoursValue = Number(logDraft.hours);
                                if (!Number.isFinite(hoursValue) || hoursValue < 0.25 || hoursValue > 24) {
                                    toast.error("Hours are a number from 0.25 to 24.");
                                    return;
                                }
                                if (!/^\d{4}-\d{2}-\d{2}$/.test(logDraft.forDate)) {
                                    toast.error("Pick a day.");
                                    return;
                                }
                                void run(
                                    () =>
                                        workService.tasks.logTime(task.id, {
                                            forDate: logDraft.forDate,
                                            hours: hoursValue,
                                            billable: logDraft.billable === "true",
                                            ...(logDraft.note.trim() ? { note: logDraft.note.trim() } : {}),
                                        }),
                                    "Time logged",
                                    "Could not log the time.",
                                    () => {
                                        setLogOpen(false);
                                        setLogDraft((d) => ({ ...d, note: "" }));
                                    },
                                );
                            }}
                        >
                            Log time
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Team dialog ---------------------------------------------- */}
            <Dialog open={teamOpen} onOpenChange={(open) => !busy && setTeamOpen(open)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Assignees</DialogTitle>
                        <DialogDescription>Replaces the team; anyone new is told.</DialogDescription>
                    </DialogHeader>
                    <PeoplePicker id="team-picker" value={teamDraft} known={task.assignees} onChange={(userIds) => setTeamDraft(userIds)} />
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setTeamOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button disabled={busy} onClick={() => void run(() => workService.tasks.setAssignees(task.id, teamDraft), "Assignees updated", "Could not update the assignees.", () => setTeamOpen(false))}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reviewers dialog ----------------------------------------- */}
            <Dialog open={reviewersOpen} onOpenChange={(open) => !busy && setReviewersOpen(open)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Reviewers</DialogTitle>
                        <DialogDescription>Replaces the reviewers; a stayer keeps their mark, and anyone new is told while the task is under review.</DialogDescription>
                    </DialogHeader>
                    <PeoplePicker
                        id="reviewers-picker"
                        value={reviewersDraft.map((row) => row.userId)}
                        known={task.reviewers}
                        onChange={(userIds) => setReviewersDraft(userIds.map((userId) => reviewersDraft.find((row) => row.userId === userId) ?? { userId, approver: false }))}
                        renderPicked={(person: WorkPerson) => (
                            <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Checkbox
                                    checked={reviewersDraft.find((row) => row.userId === person.userId)?.approver ?? false}
                                    onCheckedChange={() => setReviewersDraft((rows) => rows.map((row) => (row.userId === person.userId ? { ...row, approver: !row.approver } : row)))}
                                    aria-label={`${personName(person)} is an approver`}
                                    className="size-3.5"
                                />
                                approver
                            </label>
                        )}
                    />
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setReviewersOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button disabled={busy} onClick={() => void run(() => workService.tasks.setReviewers(task.id, reviewersDraft), "Reviewers updated", "Could not update the reviewers.", () => setReviewersOpen(false))}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Prerequisites dialog ------------------------------------- */}
            <Dialog open={prereqOpen} onOpenChange={(open) => !busy && setPrereqOpen(open)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Prerequisites</DialogTitle>
                        <DialogDescription>Tasks that must be verified before this one can start. No task can be its own prerequisite, and no cycle is allowed — the server names the path.</DialogDescription>
                    </DialogHeader>
                    <Combobox
                        id="prereq-picker"
                        multiple
                        items={[...task.prerequisites.map((row) => ({ value: row.id, label: row.title, description: row.displayId ?? undefined })), ...(candidates.data ?? []).map((row) => ({ value: row.id, label: row.title, description: row.displayId ?? undefined }))]
                            .filter((item, index, all) => item.value !== task.id && all.findIndex((other) => other.value === item.value) === index)}
                        value={prereqDraft}
                        onValueChange={setPrereqDraft}
                        placeholder="None"
                        searchPlaceholder="Search tasks"
                        emptyText={candidates.loading ? "Reading the tasks…" : "No open task matches."}
                    />
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setPrereqOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button disabled={busy} onClick={() => void run(() => workService.tasks.setPrerequisites(task.id, prereqDraft), "Prerequisites updated", "Could not update the prerequisites.", () => setPrereqOpen(false))}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Raise issue dialog --------------------------------------- */}
            <Dialog open={issueOpen} onOpenChange={(open) => !busy && setIssueOpen(open)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Raise an issue on this task</DialogTitle>
                        <DialogDescription>An OPEN critical issue flags the task as blocked on every read until it is resolved.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-issue-title">Title</Label>
                            <Input id="task-issue-title" value={issueDraft.title} onChange={(event) => setIssueDraft((d) => ({ ...d, title: event.target.value }))} placeholder="e.g. Site access refused" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-issue-severity">Severity</Label>
                            <Select value={issueDraft.severity} onValueChange={(value) => setIssueDraft((d) => ({ ...d, severity: value as WorkIssueSeverity }))}>
                                <SelectTrigger id="task-issue-severity">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(WORK_ISSUE_SEVERITY_META).map(([value, meta]) => (
                                        <SelectItem key={value} value={value}>
                                            {meta.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-issue-description">Description</Label>
                            <Textarea id="task-issue-description" rows={3} value={issueDraft.description} onChange={(event) => setIssueDraft((d) => ({ ...d, description: event.target.value }))} placeholder="What is blocking the task?" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setIssueOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            disabled={busy || !issueDraft.title.trim()}
                            onClick={() =>
                                void run(
                                    () =>
                                        workService.issues.create({
                                            title: issueDraft.title.trim(),
                                            ...(issueDraft.description.trim() ? { description: issueDraft.description.trim() } : {}),
                                            severity: issueDraft.severity,
                                            taskId: task.id,
                                        }),
                                    "Issue raised",
                                    "Could not raise the issue.",
                                    () => {
                                        setIssueOpen(false);
                                        setIssueDraft({ title: "", description: "", severity: "MEDIUM" });
                                    },
                                )
                            }
                        >
                            Raise issue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
