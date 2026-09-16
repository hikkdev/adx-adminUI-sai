"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, CalendarRange, Eye, LayoutGrid, List, ListChecks, Pencil, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { BOARD_STATUSES, istDayOf, personName, type WorkBoard, type WorkListPage, type WorkProject, type WorkTaskCard } from "@/services/work";
import { WORK_PRIORITY_META, WORK_TASK_STATUS_META, type WorkTaskStatus } from "@/types";
import { StatusMenu } from "../status-menu";

export type BoardTab = "table" | "kanban" | "timeline" | "archive";

interface BoardViewProps {
    board: WorkBoard;
    /** Null until the Archived tab asks for it. */
    archived: WorkListPage<WorkTaskCard> | null;
    archivedError: string | null;
    projects: WorkProject[];
    projectId: string | null;
    onProjectChange: (projectId: string | null) => void;
    tab: BoardTab;
    onTabChange: (tab: BoardTab) => void;
    onChanged: () => void;
}

const ALL = "__all__";

const TABS: { id: BoardTab; label: string; icon: React.ElementType }[] = [
    { id: "table", label: "Table list", icon: List },
    { id: "kanban", label: "Kanban", icon: LayoutGrid },
    { id: "timeline", label: "Timeline", icon: CalendarRange },
    { id: "archive", label: "Archived", icon: Archive },
];

const COLUMN_DOT: Record<WorkTaskStatus, string> = {
    TODO: "bg-muted-foreground/50",
    IN_PROGRESS: "bg-info",
    PENDING_REVIEW: "bg-warning",
    VERIFIED: "bg-success",
    DRAFT: "bg-muted-foreground/30",
    BLOCKED: "bg-danger",
    ARCHIVED: "bg-muted-foreground/30",
};

const timelineTone: Record<WorkTaskStatus, string> = {
    VERIFIED: "border-success/30 bg-success-soft text-success",
    IN_PROGRESS: "border-info/30 bg-info-soft text-info",
    PENDING_REVIEW: "border-warning/30 bg-warning-soft text-warning",
    BLOCKED: "border-danger/30 bg-danger-soft text-danger",
    TODO: "border-border bg-muted text-muted-foreground",
    DRAFT: "border-border bg-muted text-muted-foreground",
    ARCHIVED: "border-border bg-muted text-muted-foreground",
};

const timelineBar: Record<WorkTaskStatus, string> = {
    VERIFIED: "bg-success",
    IN_PROGRESS: "bg-info",
    PENDING_REVIEW: "bg-warning",
    BLOCKED: "bg-danger",
    TODO: "bg-muted-foreground/50",
    DRAFT: "bg-muted-foreground/30",
    ARCHIVED: "bg-muted-foreground/30",
};

/** The months the tasks in hand span — the timeline's columns — from the earliest start to the latest deadline, twelve at most. */
export function timelineMonths(tasks: readonly Pick<WorkTaskCard, "startDate" | "deadline">[], today: string): { key: string; label: string }[] {
    const days = tasks.flatMap((task) => [task.startDate, task.deadline]).filter((day): day is string => Boolean(day)).map(istDayOf);
    const first = (days.length ? [...days].sort()[0] : today).slice(0, 7);
    const last = (days.length ? [...days].sort()[days.length - 1] : today).slice(0, 7);
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    const out: { key: string; label: string }[] = [];
    for (let y = fy, m = fm; (y < ly || (y === ly && m <= lm)) && out.length < 12; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        out.push({ key, label: `${new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)))} ${String(y).slice(2)}` });
    }
    return out;
}

const monthIndex = (months: { key: string }[], iso: string | null) => (iso ? months.findIndex((month) => istDayOf(iso).startsWith(month.key)) : -1);

function Team({ people }: { people: WorkTaskCard["assignees"] }) {
    return (
        <div className="flex -space-x-1.5">
            {people.slice(0, 3).map((person) => (
                <InitialsAvatar key={person.userId} name={personName(person)} size="sm" className="ring-2 ring-card" />
            ))}
            {people.length > 3 && (
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">+{people.length - 3}</span>
            )}
        </div>
    );
}

function KanbanCard({ task, onChanged }: { task: WorkTaskCard; onChanged: () => void }) {
    return (
        <Card className="rounded-lg border-border p-4 shadow-none transition-shadow hover:shadow-sm" data-testid="board-card">
            <div className="flex items-start justify-between gap-2">
                <Link href={`/tasks/${encodeURIComponent(task.id)}`} className="min-w-0 text-sm font-medium text-foreground hover:underline">
                    {task.title}
                </Link>
                <StatusBadge status={WORK_PRIORITY_META[task.priority]} className="shrink-0" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {task.project?.name ?? "No project"} · {task.deadline ? `due ${formatDate(task.deadline)}` : "no deadline"}
                {task.overdue && <span className="ml-1 font-medium text-danger">overdue</span>}
            </p>
            <div className="mt-3 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${task.progress}%` }} />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">{task.progress}%</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3">
                <Team people={task.assignees} />
                <div className="flex items-center gap-0.5">
                    <StatusMenu taskId={task.id} status={task.status} size="sm" onMoved={onChanged} />
                    <Link href={`/tasks/${encodeURIComponent(task.id)}`} aria-label={`View ${task.title}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <Eye className="size-3.5" />
                    </Link>
                    <Link href={`/tasks/${encodeURIComponent(task.id)}/edit`} aria-label={`Edit ${task.title}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <Pencil className="size-3.5" />
                    </Link>
                </div>
            </div>
        </Card>
    );
}

/**
 * The DR 10 frame `Task board · /tasks/board`, over `GET /work/board`.
 *
 * The frame's four tabs — the table, the kanban, the timeline and the
 * archive — and the project picker are kept as drawn. The columns are the
 * read's (every status but ARCHIVED, the hundred newest-updated each with
 * a "more" count); the table and the timeline fold the same rows; the
 * archive is its own list read, asked for only when its tab opens. There
 * is no drag-and-drop: a card carries its status menu, and every move is
 * the server's rule, refused as the server says.
 */
export function BoardView({ board, archived, archivedError, projects, projectId, onProjectChange, tab, onTabChange, onChanged }: BoardViewProps) {
    const router = useRouter();
    const active = React.useMemo(() => board.columns.flatMap((column) => column.tasks), [board.columns]);
    const columnsByStatus = React.useMemo(() => new Map(board.columns.map((column) => [column.status, column])), [board.columns]);
    const today = istDayOf(new Date().toISOString());
    const months = React.useMemo(() => timelineMonths(active, today), [active, today]);

    const columns = React.useMemo<ColumnDef<WorkTaskCard>[]>(
        () => [
            {
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Task</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.original.title}</p>
                        <p className="text-xs text-muted-foreground">{row.original.displayId ?? row.original.id}</p>
                    </div>
                ),
            },
            {
                id: "project",
                accessorFn: (row) => row.project?.name ?? "",
                header: ({ column }) => <SortableHeader column={column}>Project</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="text-foreground">{row.original.project?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{row.original.tags.join(", ")}</p>
                    </div>
                ),
            },
            {
                id: "team",
                header: "Team",
                cell: ({ row }) => <Team people={row.original.assignees} />,
            },
            {
                accessorKey: "progress",
                header: ({ column }) => <SortableHeader column={column}>Progress</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex w-32 items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${row.original.progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{row.original.progress}%</span>
                    </div>
                ),
            },
            {
                accessorKey: "deadline",
                header: ({ column }) => <SortableHeader column={column}>Deadline</SortableHeader>,
                cell: ({ row }) => (
                    <span className={cn(row.original.overdue && "font-medium text-danger")}>{row.original.deadline ? formatDate(row.original.deadline) : "—"}</span>
                ),
            },
            {
                accessorKey: "priority",
                header: "Priority",
                cell: ({ row }) => <StatusBadge status={WORK_PRIORITY_META[row.original.priority]} />,
            },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) =>
                    row.original.status === "ARCHIVED" ? (
                        <StatusBadge status={WORK_TASK_STATUS_META.ARCHIVED} />
                    ) : (
                        <StatusMenu taskId={row.original.id} status={row.original.status} size="sm" onMoved={onChanged} />
                    ),
            },
        ],
        [onChanged],
    );

    const empty = (
        <EmptyState
            icon={ListChecks}
            title="No tasks yet"
            description="No tasks yet — create the first one and it lands here."
            action={
                <Link href="/tasks/new" className="text-sm font-medium text-primary hover:underline">
                    Create the first task
                </Link>
            }
        />
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-lg border bg-card p-1" role="tablist">
                    {TABS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === item.id}
                            onClick={() => onTabChange(item.id)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                                tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <item.icon className="size-4" />
                            {item.label}
                        </button>
                    ))}
                </div>
                <Select value={projectId ?? ALL} onValueChange={(value) => onProjectChange(value === ALL ? null : value)}>
                    <SelectTrigger className="h-9 w-52 bg-card" aria-label="Project">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>All projects</SelectItem>
                        {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                                {project.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {tab === "table" && (
                <DataTable columns={columns} data={active} searchPlaceholder="Search tasks" onRowClick={(task) => router.push(`/tasks/${encodeURIComponent(task.id)}`)} emptyState={empty} />
            )}

            {tab === "kanban" && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {BOARD_STATUSES.map((status) => {
                        const column = columnsByStatus.get(status);
                        const items = column?.tasks ?? [];
                        return (
                            <div key={status} data-testid={`board-column-${status}`}>
                                <div className="mb-2.5 flex items-center gap-2 px-1">
                                    <span className={cn("size-2 rounded-full", COLUMN_DOT[status])} />
                                    <h3 className="text-sm font-semibold text-foreground">{WORK_TASK_STATUS_META[status].label}</h3>
                                    <span className="text-xs text-muted-foreground">{column?.count ?? 0}</span>
                                </div>
                                <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 p-3">
                                    {items.map((task) => (
                                        <KanbanCard key={task.id} task={task} onChanged={onChanged} />
                                    ))}
                                    {column && column.more > 0 && (
                                        <p className="text-center text-xs text-muted-foreground">
                                            {column.more} more — narrow by project, or open the table.
                                        </p>
                                    )}
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

            {tab === "timeline" &&
                (active.length ? (
                    <Card className="overflow-hidden rounded-lg border-border shadow-none">
                        <div className="overflow-x-auto">
                            <div className="min-w-[900px]">
                                <div className="grid border-b bg-muted/50" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                                    {months.map((month) => (
                                        <div key={month.key} className="border-r py-2.5 text-center text-xs font-medium text-muted-foreground last:border-r-0">
                                            {month.label}
                                        </div>
                                    ))}
                                </div>
                                <div className="relative space-y-2 p-4">
                                    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                                        {months.map((month) => (
                                            <div key={month.key} className="border-r last:border-r-0" />
                                        ))}
                                    </div>
                                    {active.map((task) => {
                                        const startCol = Math.max(monthIndex(months, task.startDate ?? task.deadline), 0);
                                        const endRaw = monthIndex(months, task.deadline);
                                        const endCol = endRaw === -1 ? Math.max(startCol, months.length - 1) : Math.max(endRaw, startCol);
                                        return (
                                            <div key={task.id} className="relative grid h-12" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                                                <Link
                                                    href={`/tasks/${encodeURIComponent(task.id)}`}
                                                    style={{ gridColumnStart: startCol + 1, gridColumnEnd: endCol + 2, gridRow: 1 }}
                                                    className={cn(
                                                        "relative flex h-11 min-w-0 flex-col justify-center overflow-hidden rounded-md border px-3 transition-transform hover:scale-[1.005]",
                                                        timelineTone[task.status],
                                                    )}
                                                >
                                                    <span className="flex items-center justify-between gap-2">
                                                        <span className="truncate text-xs font-medium">{task.title}</span>
                                                        <span className="shrink-0 text-[10px] font-semibold opacity-80">{task.progress}%</span>
                                                    </span>
                                                    <span className="mt-0.5 truncate text-[10px] opacity-70">
                                                        {task.startDate ? formatDate(task.startDate) : "no start"} to {task.deadline ? formatDate(task.deadline) : "no deadline"}
                                                    </span>
                                                    <span className={cn("absolute inset-x-0 bottom-0 h-0.5 opacity-50", timelineBar[task.status])} style={{ width: `${task.progress}%` }} />
                                                </Link>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </Card>
                ) : (
                    <Card className="rounded-lg border-border shadow-none">{empty}</Card>
                ))}

            {tab === "archive" &&
                (archivedError ? (
                    <Card className="rounded-lg border-danger/40 bg-danger-soft p-5 text-sm text-muted-foreground shadow-none">{archivedError}</Card>
                ) : archived === null ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Reading the archive…</p>
                ) : archived.items.length ? (
                    <DataTable columns={columns} data={archived.items} searchPlaceholder="Search archived tasks" onRowClick={(task) => router.push(`/tasks/${encodeURIComponent(task.id)}`)} />
                ) : (
                    <EmptyState icon={Archive} title="No archived tasks" description="Tasks you archive from the board land here." />
                ))}
        </div>
    );
}
