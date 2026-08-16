"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
    Archive,
    CalendarRange,
    Eye,
    LayoutGrid,
    List,
    Pencil,
    Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
    WORK_TASK_PRIORITY_META,
    WORK_TASK_STATUS_META,
    type WorkTask,
    type WorkTaskStatus,
} from "@/types";

interface BoardViewProps {
    tasks: WorkTask[];
}

type BoardTab = "table" | "kanban" | "timeline" | "archive";

const TABS: { id: BoardTab; label: string; icon: React.ElementType }[] = [
    { id: "table", label: "Table list", icon: List },
    { id: "kanban", label: "Kanban", icon: LayoutGrid },
    { id: "timeline", label: "Timeline", icon: CalendarRange },
    { id: "archive", label: "Archived", icon: Archive },
];

const KANBAN_COLUMNS: { status: WorkTaskStatus; dotClass: string }[] = [
    { status: "todo", dotClass: "bg-muted-foreground/50" },
    { status: "in_progress", dotClass: "bg-info" },
    { status: "pending_review", dotClass: "bg-warning" },
    { status: "verified", dotClass: "bg-success" },
    { status: "draft", dotClass: "bg-muted-foreground/30" },
    { status: "blocked", dotClass: "bg-danger" },
];

/* Timeline covers the seeded period. */
const TIMELINE_MONTHS = [
    { key: "2025-11", label: "Nov" },
    { key: "2025-12", label: "Dec" },
    { key: "2026-01", label: "Jan" },
    { key: "2026-02", label: "Feb" },
    { key: "2026-03", label: "Mar" },
    { key: "2026-04", label: "Apr" },
    { key: "2026-05", label: "May" },
    { key: "2026-06", label: "Jun" },
];

const monthIndex = (iso: string) =>
    TIMELINE_MONTHS.findIndex((month) => iso.startsWith(month.key));

const timelineTone: Record<string, string> = {
    verified: "border-success/30 bg-success-soft text-success",
    in_progress: "border-info/30 bg-info-soft text-info",
    pending_review: "border-warning/30 bg-warning-soft text-warning",
    blocked: "border-danger/30 bg-danger-soft text-danger",
    todo: "border-border bg-muted text-muted-foreground",
    draft: "border-border bg-muted text-muted-foreground",
};

const timelineBar: Record<string, string> = {
    verified: "bg-success",
    in_progress: "bg-info",
    pending_review: "bg-warning",
    blocked: "bg-danger",
    todo: "bg-muted-foreground/50",
    draft: "bg-muted-foreground/30",
};

function KanbanCard({ task }: { task: WorkTask }) {
    return (
        <Card className="rounded-lg border-border p-4 shadow-none transition-shadow hover:shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <Link
                    href={`/tasks/${task.id}`}
                    className="min-w-0 text-sm font-medium text-foreground hover:underline"
                >
                    {task.title}
                </Link>
                <StatusBadge
                    status={WORK_TASK_PRIORITY_META[task.priority]}
                    className="shrink-0"
                />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {task.project} · due {formatDate(task.deadline)}
            </p>
            <div className="mt-3 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${task.progress}%` }}
                    />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">
                    {task.progress}%
                </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3">
                <div className="flex -space-x-1.5">
                    {task.team.slice(0, 3).map((member) => (
                        <InitialsAvatar
                            key={member.id}
                            name={member.name}
                            size="sm"
                            className="ring-2 ring-card"
                        />
                    ))}
                    {task.team.length > 3 && (
                        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                            +{task.team.length - 3}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-0.5">
                    <Link
                        href={`/tasks/${task.id}`}
                        aria-label={`View ${task.title}`}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Eye className="size-3.5" />
                    </Link>
                    <Link
                        href={`/tasks/${task.id}?tab=progress`}
                        aria-label={`Track ${task.title}`}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Pencil className="size-3.5" />
                    </Link>
                </div>
            </div>
        </Card>
    );
}

export function BoardView({ tasks }: BoardViewProps) {
    const router = useRouter();
    const [tab, setTab] = React.useState<BoardTab>("table");
    const [project, setProject] = React.useState("All");

    const projects = React.useMemo(
        () => ["All", ...Array.from(new Set(tasks.map((task) => task.project)))],
        [tasks]
    );
    const scoped = project === "All" ? tasks : tasks.filter((task) => task.project === project);
    const active = scoped.filter((task) => task.status !== "archived");
    const archived = scoped.filter((task) => task.status === "archived");

    const columns = React.useMemo<ColumnDef<WorkTask>[]>(
        () => [
            {
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Task</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.original.title}</p>
                        <p className="text-xs text-muted-foreground">{row.original.id}</p>
                    </div>
                ),
            },
            {
                accessorKey: "project",
                header: ({ column }) => <SortableHeader column={column}>Project</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="text-foreground">{row.original.project}</p>
                        <p className="text-xs text-muted-foreground">{row.original.location}</p>
                    </div>
                ),
            },
            {
                id: "team",
                header: "Team",
                cell: ({ row }) => (
                    <div className="flex -space-x-1.5">
                        {row.original.team.slice(0, 3).map((member) => (
                            <InitialsAvatar
                                key={member.id}
                                name={member.name}
                                size="sm"
                                className="ring-2 ring-card"
                            />
                        ))}
                    </div>
                ),
            },
            {
                accessorKey: "progress",
                header: ({ column }) => <SortableHeader column={column}>Progress</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex w-32 items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${row.original.progress}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground">{row.original.progress}%</span>
                    </div>
                ),
            },
            {
                accessorKey: "deadline",
                header: ({ column }) => <SortableHeader column={column}>Deadline</SortableHeader>,
                cell: ({ row }) => formatDate(row.original.deadline),
            },
            {
                accessorKey: "priority",
                header: "Priority",
                cell: ({ row }) => (
                    <StatusBadge status={WORK_TASK_PRIORITY_META[row.original.priority]} />
                ),
            },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={WORK_TASK_STATUS_META[row.original.status]} />
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
                    {TABS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                                tab === item.id
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <item.icon className="size-4" />
                            {item.label}
                        </button>
                    ))}
                </div>
                <Select value={project} onValueChange={setProject}>
                    <SelectTrigger className="h-9 w-48 bg-card">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {projects.map((option) => (
                            <SelectItem key={option} value={option}>
                                {option === "All" ? "All projects" : option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {tab === "table" && (
                <DataTable
                    columns={columns}
                    data={active}
                    searchPlaceholder="Search tasks"
                    onRowClick={(task) => router.push(`/tasks/${task.id}`)}
                />
            )}

            {tab === "kanban" && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {KANBAN_COLUMNS.map((column) => {
                        const items = active.filter((task) => task.status === column.status);
                        return (
                            <div key={column.status}>
                                <div className="mb-2.5 flex items-center gap-2 px-1">
                                    <span className={cn("size-2 rounded-full", column.dotClass)} />
                                    <h3 className="text-sm font-semibold text-foreground">
                                        {WORK_TASK_STATUS_META[column.status].label}
                                    </h3>
                                    <span className="text-xs text-muted-foreground">{items.length}</span>
                                </div>
                                <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 p-3">
                                    {items.map((task) => (
                                        <KanbanCard key={task.id} task={task} />
                                    ))}
                                    <Link
                                        href="/tasks/new"
                                        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                                    >
                                        <Plus className="size-3.5" />
                                        Add task
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {tab === "timeline" && (
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <div className="overflow-x-auto">
                        <div className="min-w-[900px]">
                            <div
                                className="grid border-b bg-muted/50"
                                style={{
                                    gridTemplateColumns: `repeat(${TIMELINE_MONTHS.length}, 1fr)`,
                                }}
                            >
                                {TIMELINE_MONTHS.map((month) => (
                                    <div
                                        key={month.key}
                                        className="border-r py-2.5 text-center text-xs font-medium text-muted-foreground last:border-r-0"
                                    >
                                        {month.label} {month.key.startsWith("2025") ? "25" : "26"}
                                    </div>
                                ))}
                            </div>
                            <div className="relative space-y-2 p-4">
                                <div
                                    className="pointer-events-none absolute inset-0 grid"
                                    style={{
                                        gridTemplateColumns: `repeat(${TIMELINE_MONTHS.length}, 1fr)`,
                                    }}
                                >
                                    {TIMELINE_MONTHS.map((month) => (
                                        <div key={month.key} className="border-r last:border-r-0" />
                                    ))}
                                </div>
                                {active.map((task) => {
                                    const startCol = Math.max(monthIndex(task.startDate), 0);
                                    const endRaw = monthIndex(task.deadline);
                                    const endCol = endRaw === -1 ? TIMELINE_MONTHS.length - 1 : endRaw;
                                    return (
                                        <div
                                            key={task.id}
                                            className="relative grid h-12"
                                            style={{
                                                gridTemplateColumns: `repeat(${TIMELINE_MONTHS.length}, 1fr)`,
                                            }}
                                        >
                                            <Link
                                                href={`/tasks/${task.id}`}
                                                style={{
                                                    gridColumnStart: startCol + 1,
                                                    gridColumnEnd: endCol + 2,
                                                    gridRow: 1,
                                                }}
                                                className={cn(
                                                    "relative flex h-11 min-w-0 flex-col justify-center overflow-hidden rounded-md border px-3 transition-transform hover:scale-[1.005]",
                                                    timelineTone[task.status]
                                                )}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-xs font-medium">
                                                        {task.title}
                                                    </span>
                                                    <span className="shrink-0 text-[10px] font-semibold opacity-80">
                                                        {task.progress}%
                                                    </span>
                                                </span>
                                                <span className="mt-0.5 truncate text-[10px] opacity-70">
                                                    {formatDate(task.startDate)} to {formatDate(task.deadline)}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "absolute inset-x-0 bottom-0 h-0.5 opacity-50",
                                                        timelineBar[task.status]
                                                    )}
                                                    style={{ width: `${task.progress}%` }}
                                                />
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {tab === "archive" &&
                (archived.length ? (
                    <DataTable
                        columns={columns}
                        data={archived}
                        searchPlaceholder="Search archived tasks"
                        onRowClick={(task) => router.push(`/tasks/${task.id}`)}
                    />
                ) : (
                    <EmptyState
                        icon={Archive}
                        title="No archived tasks"
                        description="Tasks you archive from the board land here."
                    />
                ))}
        </div>
    );
}
