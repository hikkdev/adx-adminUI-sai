"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KpiCard } from "@/components/adx/kpi-card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import {
    ActiveFilters,
    FilterPanel,
    type Facet,
    type FilterSelection,
} from "@/components/adx/filter-panel";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
    TASK_ISSUE_SEVERITY_META,
    TASK_ISSUE_STATUS_META,
    TASK_ISSUE_TYPE_META,
    type TaskIssue,
    type TaskIssueSeverity,
    type TaskIssueType,
    type TeamMember,
    type WorkTask,
} from "@/types";

interface IssuesViewProps {
    issues: TaskIssue[];
    tasks: WorkTask[];
    people: TeamMember[];
}

/** Queue order: worst severity first, then whatever is still unworked. */
const SEVERITY_RANK: Record<TaskIssueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};
const STATUS_RANK: Record<TaskIssue["status"], number> = {
    open: 0,
    in_progress: 1,
    resolved: 2,
    closed: 3,
};

const isLive = (issue: TaskIssue) =>
    issue.status === "open" || issue.status === "in_progress";

export function IssuesView({ issues: initialIssues, tasks, people }: IssuesViewProps) {
    const [issues, setIssues] = React.useState(initialIssues);
    const [selection, setSelection] = React.useState<FilterSelection>({ status: ["open"] });
    const [query, setQuery] = React.useState("");
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [raiseOpen, setRaiseOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [editDraft, setEditDraft] = React.useState({
        topic: "",
        description: "",
        type: "bug" as TaskIssueType,
        severity: "medium" as TaskIssueSeverity,
        assignedTo: "",
    });

    const [draft, setDraft] = React.useState({
        taskId: tasks[0]?.id ?? "",
        type: "bug" as TaskIssueType,
        severity: "medium" as TaskIssueSeverity,
        assignedTo: people[0]?.name ?? "",
        topic: "",
        description: "",
    });

    /* --- What actually needs a decision, not a recount of the table --- */
    const urgent = issues
        .filter(
            (issue) =>
                issue.status === "open" &&
                (issue.severity === "critical" || issue.severity === "high")
        )
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    const working = issues.filter((issue) => issue.status === "in_progress");
    const heldTasks = new Set(issues.filter(isLive).map((issue) => issue.taskId));
    const oldestUrgent = urgent[0];

    const facets: Facet[] = React.useMemo(
        () => [
            {
                id: "status",
                label: "Status",
                options: (
                    Object.keys(TASK_ISSUE_STATUS_META) as (keyof typeof TASK_ISSUE_STATUS_META)[]
                ).map((value) => ({
                    value,
                    label: TASK_ISSUE_STATUS_META[value].label,
                    count: issues.filter((issue) => issue.status === value).length,
                })),
            },
            {
                id: "severity",
                label: "Severity",
                options: (
                    Object.keys(
                        TASK_ISSUE_SEVERITY_META
                    ) as (keyof typeof TASK_ISSUE_SEVERITY_META)[]
                ).map((value) => ({
                    value,
                    label: TASK_ISSUE_SEVERITY_META[value].label,
                    count: issues.filter((issue) => issue.severity === value).length,
                })),
            },
            {
                id: "assignee",
                label: "Assigned to",
                options: Array.from(new Set(issues.map((issue) => issue.assignedTo)))
                    .sort()
                    .map((name) => ({
                        value: name,
                        label: name,
                        count: issues.filter((issue) => issue.assignedTo === name).length,
                    })),
            },
        ],
        [issues]
    );

    const queue = React.useMemo(() => {
        const statuses = selection.status ?? [];
        const severities = selection.severity ?? [];
        const assignees = selection.assignee ?? [];
        const needle = query.trim().toLowerCase();
        return issues
            .filter((issue) => (statuses.length ? statuses.includes(issue.status) : true))
            .filter((issue) => (severities.length ? severities.includes(issue.severity) : true))
            .filter((issue) => (assignees.length ? assignees.includes(issue.assignedTo) : true))
            .filter((issue) =>
                needle
                    ? [issue.id, issue.topic, issue.description, issue.taskTitle, issue.assignedTo]
                          .join(" ")
                          .toLowerCase()
                          .includes(needle)
                    : true
            )
            .sort(
                (a, b) =>
                    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
                    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
                    a.id.localeCompare(b.id)
            );
    }, [issues, selection, query]);

    /* Keep a row selected so the detail pane is never a dead placeholder. */
    const selected =
        issues.find((issue) => issue.id === selectedId && queue.some((q) => q.id === issue.id)) ??
        queue[0] ??
        null;

    const raiseIssue = () => {
        if (!draft.description.trim() || !draft.topic.trim()) {
            toast.error("Add a topic and a description before raising the issue.");
            return;
        }
        const nextNumber =
            Math.max(...issues.map((issue) => Number(issue.id.replace("ISS-", "")) || 0)) + 1;
        const task = tasks.find((item) => item.id === draft.taskId);
        const created: TaskIssue = {
            id: `ISS-${String(nextNumber).padStart(3, "0")}`,
            taskId: draft.taskId,
            taskTitle: task?.title ?? draft.taskId,
            project: task?.project ?? "General",
            topic: draft.topic.trim(),
            description: draft.description.trim(),
            type: draft.type,
            severity: draft.severity,
            status: "open",
            assignedTo: draft.assignedTo,
            raisedBy: "You",
            resolvedBy: null,
            resolutionDate: null,
            resolutionDetails: null,
            rootCause: null,
        };
        setIssues((current) => [created, ...current]);
        setRaiseOpen(false);
        setDraft((current) => ({ ...current, topic: "", description: "" }));
        setSelectedId(created.id);
        toast.success(`${created.id} raised`, { description: created.topic });
    };

    const setStatus = (id: string, status: TaskIssue["status"]) => {
        setIssues((current) =>
            current.map((issue) =>
                issue.id === id
                    ? {
                          ...issue,
                          status,
                          resolvedBy:
                              status === "resolved" || status === "closed"
                                  ? issue.resolvedBy ?? issue.assignedTo
                                  : issue.resolvedBy,
                          resolutionDate:
                              status === "resolved" || status === "closed"
                                  ? issue.resolutionDate ?? "2026-08-10"
                                  : issue.resolutionDate,
                      }
                    : issue
            )
        );
        toast.success(`${id} marked ${TASK_ISSUE_STATUS_META[status].label.toLowerCase()}`);
    };

    const openEdit = () => {
        if (!selected) return;
        setEditDraft({
            topic: selected.topic,
            description: selected.description,
            type: selected.type,
            severity: selected.severity,
            assignedTo: selected.assignedTo,
        });
        setEditOpen(true);
    };

    const saveEdit = () => {
        if (!selected) return;
        if (!editDraft.topic.trim() || !editDraft.description.trim()) {
            toast.error("Topic and description are required.");
            return;
        }
        const previous = issues;
        setIssues((current) =>
            current.map((issue) =>
                issue.id === selected.id
                    ? {
                          ...issue,
                          topic: editDraft.topic.trim(),
                          description: editDraft.description.trim(),
                          type: editDraft.type,
                          severity: editDraft.severity,
                          assignedTo: editDraft.assignedTo,
                      }
                    : issue
            )
        );
        setEditOpen(false);
        toast.success(`${selected.id} updated`, {
            action: { label: "Undo", onClick: () => setIssues(previous) },
        });
    };

    const deleteIssue = () => {
        if (!selected) return;
        const previous = issues;
        const id = selected.id;
        setIssues((current) => current.filter((issue) => issue.id !== id));
        setDeleteOpen(false);
        setSelectedId(null);
        toast.success(`${id} deleted`, {
            action: { label: "Undo", onClick: () => setIssues(previous) },
        });
    };

    return (
        <div className="space-y-4">
            {/* What needs attention ------------------------------------- */}
            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard
                    stat={{
                        id: "urgent",
                        label: "Needs triage now",
                        value: String(urgent.length),
                        hint: oldestUrgent
                            ? `Worst open: ${oldestUrgent.id} on ${oldestUrgent.taskTitle}`
                            : "No critical or high issues are open",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "working",
                        label: "Being worked",
                        value: String(working.length),
                        hint: working.length
                            ? `Owned by ${new Set(working.map((i) => i.assignedTo)).size} people`
                            : "Nothing in progress",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "held",
                        label: "Tasks held up",
                        value: String(heldTasks.size),
                        hint: "Tasks with at least one unresolved issue",
                    }}
                />
            </div>

            {/* Queue + evidence ----------------------------------------- */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
                <Card className="rounded-lg border-border shadow-none">
                    <div className="space-y-2.5 border-b px-4 py-3">
                        <FilterPanel
                            facets={facets}
                            selection={selection}
                            onChange={setSelection}
                            resultCount={queue.length}
                            search={{
                                value: query,
                                onChange: setQuery,
                                placeholder: "Issue, topic or task",
                            }}
                        />
                        <ActiveFilters
                            facets={facets}
                            selection={selection}
                            onChange={setSelection}
                            resultCount={queue.length}
                        />
                    </div>

                    {queue.length ? (
                        <ul className="max-h-[560px] divide-y overflow-y-auto">
                            {queue.map((issue) => {
                                const active = selected?.id === issue.id;
                                return (
                                    <li key={issue.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(issue.id)}
                                            aria-current={active ? "true" : undefined}
                                            className={cn(
                                                "w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                                active ? "bg-muted/60" : "hover:bg-muted/40"
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                                    {issue.id}
                                                </span>
                                                <StatusBadge
                                                    status={TASK_ISSUE_SEVERITY_META[issue.severity]}
                                                />
                                            </div>
                                            <p className="mt-1 truncate text-sm font-medium text-foreground">
                                                {issue.topic}
                                            </p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {issue.taskTitle}
                                            </p>
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {issue.assignedTo}
                                                </span>
                                                <StatusBadge
                                                    status={TASK_ISSUE_STATUS_META[issue.status]}
                                                />
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {query
                                ? "No issues match that search."
                                : "Nothing in this queue right now."}
                        </p>
                    )}

                    <div className="border-t px-4 py-3">
                        <Button className="w-full" onClick={() => setRaiseOpen(true)}>
                            <Plus className="size-4" />
                            Raise an issue
                        </Button>
                    </div>
                </Card>

                {selected ? (
                    <Card className="rounded-lg border-border shadow-none">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-semibold text-foreground">
                                        {selected.id}: {selected.topic}
                                    </h2>
                                    <StatusBadge status={TASK_ISSUE_SEVERITY_META[selected.severity]} />
                                    <StatusBadge status={TASK_ISSUE_STATUS_META[selected.status]} />
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Blocking{" "}
                                    <Link
                                        href={`/tasks/${selected.taskId}`}
                                        className="font-medium text-foreground underline-offset-4 hover:underline"
                                    >
                                        {selected.taskTitle}
                                        <ArrowUpRight className="ml-0.5 inline size-3.5" />
                                    </Link>{" "}
                                    in {selected.project}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Edit ${selected.id}`}
                                    onClick={openEdit}
                                >
                                    <Pencil className="size-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Delete ${selected.id}`}
                                    onClick={() => setDeleteOpen(true)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                                {selected.status === "open" && (
                                    <Button
                                        variant="outline"
                                        className="bg-card"
                                        onClick={() => setStatus(selected.id, "in_progress")}
                                    >
                                        Start work
                                    </Button>
                                )}
                                {isLive(selected) && (
                                    <Button onClick={() => setStatus(selected.id, "resolved")}>
                                        Mark resolved
                                    </Button>
                                )}
                                {selected.status === "resolved" && (
                                    <Button
                                        variant="outline"
                                        className="bg-card"
                                        onClick={() => setStatus(selected.id, "closed")}
                                    >
                                        Close issue
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="border-b px-5 py-4">
                            <p className="text-xs font-medium text-muted-foreground">What happened</p>
                            <p className="mt-1 max-w-prose text-sm leading-6 text-foreground">
                                {selected.description}
                            </p>
                        </div>

                        <div className="grid gap-x-10 gap-y-4 px-5 py-4 lg:grid-cols-2">
                            <FieldList
                                items={[
                                    [
                                        "Type",
                                        <StatusBadge
                                            key="type"
                                            status={TASK_ISSUE_TYPE_META[selected.type]}
                                        />,
                                    ],
                                    ["Assigned to", selected.assignedTo],
                                    ["Raised by", selected.raisedBy],
                                    ["Resolved by", selected.resolvedBy ?? "Not resolved yet"],
                                    [
                                        "Resolution date",
                                        selected.resolutionDate
                                            ? formatDate(selected.resolutionDate)
                                            : "Pending",
                                    ],
                                ]}
                            />
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Root cause
                                    </p>
                                    <p className="mt-1 text-sm leading-6 text-foreground">
                                        {selected.rootCause ?? "Not identified yet."}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Resolution details
                                    </p>
                                    <p className="mt-1 text-sm leading-6 text-foreground">
                                        {selected.resolutionDetails ?? "No resolution recorded yet."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Card>
                ) : (
                    <Card className="rounded-lg border-border p-10 text-center shadow-none">
                        <p className="text-sm font-medium text-foreground">
                            This queue is clear
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Switch to another queue, or raise an issue when a task hits a barrier.
                        </p>
                    </Card>
                )}
            </div>

            {/* Edit issue dialog ---------------------------------------- */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit {selected?.id}</DialogTitle>
                        <DialogDescription>
                            Status is changed from the detail pane, everything else here.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="edit-topic">Topic</Label>
                            <Input
                                id="edit-topic"
                                value={editDraft.topic}
                                onChange={(event) =>
                                    setEditDraft((d) => ({ ...d, topic: event.target.value }))
                                }
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="edit-description">Description</Label>
                            <Textarea
                                id="edit-description"
                                rows={3}
                                value={editDraft.description}
                                onChange={(event) =>
                                    setEditDraft((d) => ({ ...d, description: event.target.value }))
                                }
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-type">Type</Label>
                                <Select
                                    value={editDraft.type}
                                    onValueChange={(value) =>
                                        setEditDraft((d) => ({
                                            ...d,
                                            type: value as TaskIssueType,
                                        }))
                                    }
                                >
                                    <SelectTrigger id="edit-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(TASK_ISSUE_TYPE_META).map(([value, meta]) => (
                                            <SelectItem key={value} value={value}>
                                                {meta.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-severity">Severity</Label>
                                <Select
                                    value={editDraft.severity}
                                    onValueChange={(value) =>
                                        setEditDraft((d) => ({
                                            ...d,
                                            severity: value as TaskIssueSeverity,
                                        }))
                                    }
                                >
                                    <SelectTrigger id="edit-severity">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(TASK_ISSUE_SEVERITY_META).map(
                                            ([value, meta]) => (
                                                <SelectItem key={value} value={value}>
                                                    {meta.label}
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="edit-assignee">Assigned to</Label>
                            <Select
                                value={editDraft.assignedTo}
                                onValueChange={(value) =>
                                    setEditDraft((d) => ({ ...d, assignedTo: value }))
                                }
                            >
                                <SelectTrigger id="edit-assignee">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {people.map((person) => (
                                        <SelectItem key={person.id} value={person.name}>
                                            {person.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={saveEdit}>Save changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete ${selected?.id ?? "issue"}?`}
                description="The record is removed from the risk log. Undo is available straight after."
                confirmLabel="Delete issue"
                destructive
                onConfirm={deleteIssue}
            />

            {/* Raise issue dialog --------------------------------------- */}
            <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Raise an issue</DialogTitle>
                        <DialogDescription>
                            Log a bug, blocker, change request or query against a task.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="issue-task">Task</Label>
                            <Select
                                value={draft.taskId}
                                onValueChange={(value) =>
                                    setDraft((current) => ({ ...current, taskId: value }))
                                }
                            >
                                <SelectTrigger id="issue-task">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {tasks.map((task) => (
                                        <SelectItem key={task.id} value={task.id}>
                                            {task.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="issue-type">Type</Label>
                                <Select
                                    value={draft.type}
                                    onValueChange={(value) =>
                                        setDraft((current) => ({
                                            ...current,
                                            type: value as TaskIssueType,
                                        }))
                                    }
                                >
                                    <SelectTrigger id="issue-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(TASK_ISSUE_TYPE_META).map(([value, meta]) => (
                                            <SelectItem key={value} value={value}>
                                                {meta.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="issue-severity">Severity</Label>
                                <Select
                                    value={draft.severity}
                                    onValueChange={(value) =>
                                        setDraft((current) => ({
                                            ...current,
                                            severity: value as TaskIssueSeverity,
                                        }))
                                    }
                                >
                                    <SelectTrigger id="issue-severity">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(TASK_ISSUE_SEVERITY_META).map(
                                            ([value, meta]) => (
                                                <SelectItem key={value} value={value}>
                                                    {meta.label}
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="issue-assignee">Assign to</Label>
                            <Select
                                value={draft.assignedTo}
                                onValueChange={(value) =>
                                    setDraft((current) => ({ ...current, assignedTo: value }))
                                }
                            >
                                <SelectTrigger id="issue-assignee">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {people.map((person) => (
                                        <SelectItem key={person.id} value={person.name}>
                                            {person.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="issue-topic">Topic</Label>
                            <Input
                                id="issue-topic"
                                value={draft.topic}
                                onChange={(event) =>
                                    setDraft((current) => ({ ...current, topic: event.target.value }))
                                }
                                placeholder="e.g. Notification Services"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="issue-description">Description</Label>
                            <Textarea
                                id="issue-description"
                                value={draft.description}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        description: event.target.value,
                                    }))
                                }
                                rows={3}
                                placeholder="What is blocking the task?"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setRaiseOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={raiseIssue}>Raise issue</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
