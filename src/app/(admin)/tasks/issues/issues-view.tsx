"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, Plus } from "lucide-react";
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
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
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

const METRICS: { label: string; filter: (issue: TaskIssue) => boolean }[] = [
    { label: "Total issues", filter: () => true },
    { label: "Open", filter: (issue) => issue.status === "open" },
    { label: "In progress", filter: (issue) => issue.status === "in_progress" },
    { label: "Resolved", filter: (issue) => issue.status === "resolved" },
    { label: "Closed", filter: (issue) => issue.status === "closed" },
];

export function IssuesView({ issues: initialIssues, tasks, people }: IssuesViewProps) {
    const [issues, setIssues] = React.useState(initialIssues);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [raiseOpen, setRaiseOpen] = React.useState(false);

    const [draft, setDraft] = React.useState({
        taskId: tasks[0]?.id ?? "",
        type: "bug" as TaskIssueType,
        severity: "medium" as TaskIssueSeverity,
        assignedTo: people[0]?.name ?? "",
        topic: "",
        description: "",
    });

    const selected = issues.find((issue) => issue.id === selectedId) ?? null;
    const detailRef = React.useRef<HTMLDivElement>(null);

    const openDetail = (issue: TaskIssue) => {
        setSelectedId(issue.id);
        window.setTimeout(
            () => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
            60
        );
    };

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
        toast.success(`${created.id} raised`, { description: created.topic });
        openDetail(created);
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

    const columns = React.useMemo<ColumnDef<TaskIssue>[]>(
        () => [
            {
                accessorKey: "id",
                header: ({ column }) => <SortableHeader column={column}>Issue</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium text-foreground">{row.original.id}</span>
                ),
            },
            {
                accessorKey: "description",
                header: "Description",
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[360px]">
                        <p className="truncate text-foreground">{row.original.description}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {row.original.taskTitle} · {row.original.topic}
                        </p>
                    </div>
                ),
            },
            {
                accessorKey: "type",
                header: "Type",
                cell: ({ row }) => (
                    <StatusBadge status={TASK_ISSUE_TYPE_META[row.original.type]} />
                ),
            },
            {
                accessorKey: "severity",
                header: "Severity",
                cell: ({ row }) => (
                    <StatusBadge status={TASK_ISSUE_SEVERITY_META[row.original.severity]} />
                ),
            },
            {
                accessorKey: "assignedTo",
                header: ({ column }) => <SortableHeader column={column}>Assigned to</SortableHeader>,
            },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={TASK_ISSUE_STATUS_META[row.original.status]} />
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-4">
            {/* Metric cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                {METRICS.map((metric) => (
                    <Card key={metric.label} className="rounded-lg border-border p-4 shadow-none">
                        <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                        <p className="text-metric mt-1.5 text-foreground">
                            {issues.filter(metric.filter).length}
                        </p>
                    </Card>
                ))}
            </div>

            <DataTable
                columns={columns}
                data={issues}
                searchPlaceholder="Search issues"
                onRowClick={openDetail}
                toolbar={
                    <Button onClick={() => setRaiseOpen(true)}>
                        <Plus className="size-4" />
                        Raise an issue
                    </Button>
                }
            />

            {/* Detail workspace */}
            <div ref={detailRef} className="scroll-mt-6">
                {selected ? (
                    <Card className="rounded-lg border-border shadow-none">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                            <div>
                                <h2 className="text-base font-semibold text-foreground">
                                    {selected.id}: {selected.topic}
                                </h2>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    Raised against {selected.taskTitle} ({selected.project})
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {selected.status !== "in_progress" &&
                                    selected.status !== "resolved" &&
                                    selected.status !== "closed" && (
                                        <Button
                                            variant="outline"
                                            className="bg-card"
                                            onClick={() => setStatus(selected.id, "in_progress")}
                                        >
                                            Start work
                                        </Button>
                                    )}
                                {selected.status !== "resolved" && selected.status !== "closed" && (
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
                        <div className="grid gap-x-10 gap-y-4 px-5 py-4 lg:grid-cols-2">
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Description
                                    </p>
                                    <p className="mt-1 text-sm text-foreground">
                                        {selected.description}
                                    </p>
                                </div>
                                <FieldList
                                    items={[
                                        [
                                            "Type",
                                            <StatusBadge
                                                key="type"
                                                status={TASK_ISSUE_TYPE_META[selected.type]}
                                            />,
                                        ],
                                        [
                                            "Severity",
                                            <StatusBadge
                                                key="severity"
                                                status={TASK_ISSUE_SEVERITY_META[selected.severity]}
                                            />,
                                        ],
                                        [
                                            "Status",
                                            <StatusBadge
                                                key="status"
                                                status={TASK_ISSUE_STATUS_META[selected.status]}
                                            />,
                                        ],
                                        ["Assigned to", selected.assignedTo],
                                        ["Raised by", selected.raisedBy],
                                    ]}
                                />
                            </div>
                            <div className="space-y-4">
                                <FieldList
                                    items={[
                                        ["Resolved by", selected.resolvedBy ?? "Not resolved yet"],
                                        [
                                            "Resolution date",
                                            selected.resolutionDate
                                                ? formatDate(selected.resolutionDate)
                                                : "Pending",
                                        ],
                                    ]}
                                />
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Root cause
                                    </p>
                                    <p className="mt-1 text-sm text-foreground">
                                        {selected.rootCause ?? "Not identified yet."}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Resolution details
                                    </p>
                                    <p className="mt-1 text-sm text-foreground">
                                        {selected.resolutionDetails ??
                                            "No resolution recorded yet."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Card>
                ) : (
                    <Card className="flex items-center gap-3 rounded-lg border-dashed border-border p-5 shadow-none">
                        <AlertCircle className="size-4 shrink-0 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            Select an issue in the table to see its full context and resolution
                            trail here.
                        </p>
                    </Card>
                )}
            </div>

            {/* Raise issue dialog */}
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
