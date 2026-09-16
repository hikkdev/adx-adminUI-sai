"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    PolarAngleAxis,
    RadialBar,
    RadialBarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { activeCount, monthLabel, personName, statusSplit, type WorkOverview } from "@/services/work";
import { WORK_PROJECT_KIND_LABEL, type WorkTaskStatus } from "@/types";

interface TasksOverviewProps {
    overview: WorkOverview;
    /** The project the read was cut to, or null for every ACTIVE project. */
    projectId: string | null;
    onProjectChange: (projectId: string | null) => void;
}

const ALL = "__all__";

const STAT_DEFS: { label: string; statuses: WorkTaskStatus[]; barClass: string }[] = [
    { label: "Verified tasks", statuses: ["VERIFIED"], barClass: "bg-success" },
    { label: "In progress", statuses: ["IN_PROGRESS"], barClass: "bg-info" },
    { label: "Pending review", statuses: ["PENDING_REVIEW"], barClass: "bg-warning" },
    { label: "Upcoming", statuses: ["TODO", "DRAFT"], barClass: "bg-danger" },
];

const DONUT_COLOR: Record<WorkTaskStatus, string> = {
    VERIFIED: "hsl(153 73% 28%)",
    IN_PROGRESS: "hsl(217 80% 42%)",
    PENDING_REVIEW: "hsl(34 100% 30%)",
    TODO: "hsl(240 3.8% 70%)",
    BLOCKED: "hsl(4 76% 40%)",
    DRAFT: "hsl(240 5.9% 84%)",
    ARCHIVED: "hsl(240 5.9% 84%)",
};

const tooltipStyle = {
    borderRadius: 8,
    border: "1px solid hsl(240 5.9% 90%)",
    fontSize: 12,
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
};

/**
 * The DR 10 frame `Tasks · /tasks` — the overview, over `GET /work/overview`.
 *
 * The frame's project picker, four stat tiles with their share bars, the
 * completion gauge, the progress trend, the status donut and the projects
 * card are kept as drawn; every number is the read's own. What is added is
 * what the read carries that the frame drew elsewhere: the workload (who
 * holds what, top twelve by open tasks) and the overdue list (top eight by
 * deadline). Nothing here is derived from a task list on the client — the
 * HEAD copy folded the seeded tasks into these numbers, and those tasks are
 * gone (CE4).
 */
export function TasksOverview({ overview, projectId, onProjectChange }: TasksOverviewProps) {
    /*
     * The picker's options are the ACTIVE projects the unfiltered read
     * lists; a read cut to one project names only that one, so the last
     * full list is kept for the picker to offer a way back out.
     */
    const [options, setOptions] = React.useState(overview.projects);
    const [seen, setSeen] = React.useState(overview);
    if (seen !== overview) {
        setSeen(overview);
        if (projectId === null) setOptions(overview.projects);
    }

    const { tasks, trend, issues, workload, overdueList, projects } = overview;
    const active = activeCount(tasks.byStatus);
    const verified = tasks.byStatus.VERIFIED ?? 0;
    const completionPct = tasks.total ? Math.round((verified / tasks.total) * 100) : 0;

    /*
     * Every array handed to Recharts must keep a stable identity between
     * renders. A fresh array on each render restarts the chart's mount
     * animation before it can finish, so the series never paints.
     */
    const gaugeData = React.useMemo(() => [{ value: completionPct }], [completionPct]);
    const trendData = React.useMemo(() => trend.map((point) => ({ ...point, label: monthLabel(point.month) })), [trend]);
    const donutData = React.useMemo(() => statusSplit(tasks.byStatus).map((segment) => ({ ...segment, color: DONUT_COLOR[segment.status] })), [tasks.byStatus]);

    if (tasks.total === 0 && projects.length === 0 && projectId === null) {
        return (
            <Card className="rounded-lg border-border shadow-none">
                <EmptyState
                    icon={ListChecks}
                    title="No tasks yet"
                    description="No tasks yet — create the first one and the overview fills in as work moves."
                    action={
                        <Link href="/tasks/new" className="text-sm font-medium text-primary hover:underline">
                            Create the first task
                        </Link>
                    }
                />
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <Select value={projectId ?? ALL} onValueChange={(value) => onProjectChange(value === ALL ? null : value)}>
                    <SelectTrigger className="h-9 w-56 bg-card" aria-label="Project">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>All projects</SelectItem>
                        {options.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                                {project.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Stat tiles with share-of-total bars */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {STAT_DEFS.map((def) => {
                    const count = def.statuses.reduce((n, status) => n + (tasks.byStatus[status] ?? 0), 0);
                    const share = active ? Math.round((count / active) * 100) : 0;
                    return (
                        <Card key={def.label} className="rounded-lg border-border p-5 shadow-none">
                            <p className="text-xs font-medium text-muted-foreground">{def.label}</p>
                            <p className="text-metric mt-2 text-foreground">
                                {count}
                                <span className="ml-1 text-sm font-normal text-muted-foreground">of {active}</span>
                            </p>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                                <div className={cn("h-full rounded-full", def.barClass)} style={{ width: `${share}%` }} />
                            </div>
                        </Card>
                    );
                })}
            </div>

            {/* Gauge + trend */}
            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h2 className="text-sm font-semibold text-foreground">Overall completion</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {verified} of {tasks.total} tasks verified · {tasks.verifiedInWindow} in the window
                    </p>
                    <div className="relative mx-auto mt-2 h-[190px] w-full max-w-[240px]">
                        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 190 }}>
                            <RadialBarChart data={gaugeData} startAngle={210} endAngle={-30} innerRadius="72%" outerRadius="100%">
                                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                <RadialBar dataKey="value" cornerRadius={6} fill="hsl(359.5 85.5% 29.8%)" background={{ fill: "hsl(240 4.8% 95.9%)" }} isAnimationActive={false} />
                            </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-metric text-3xl text-foreground">{completionPct}%</span>
                            <span className="mt-1 text-xs text-muted-foreground">complete</span>
                        </div>
                    </div>
                    <p className="border-t pt-3 text-center text-xs text-muted-foreground">
                        {issues.open} open {issues.open === 1 ? "issue" : "issues"} in the risk log · {tasks.overdue} overdue · {tasks.dueThisWeek} due this week
                    </p>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-2">
                    <h2 className="text-sm font-semibold text-foreground">Progress trend</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Tasks completed against everything planned, by month, {overview.window.from} to {overview.window.to}
                    </p>
                    <div className="mt-3">
                        <ResponsiveContainer width="100%" height={220} initialDimension={{ width: 880, height: 220 }}>
                            <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                                <defs>
                                    <linearGradient id="tasksTrendFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(359.5 85.5% 29.8%)" stopOpacity={0.12} />
                                        <stop offset="95%" stopColor="hsl(359.5 85.5% 29.8%)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke="hsl(240 5.9% 90%)" strokeWidth={1} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }} dy={6} />
                                <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }} />
                                <Tooltip formatter={(value, name) => [String(value), name === "completed" ? "Completed" : "Planned"]} contentStyle={tooltipStyle} />
                                <Area type="monotone" dataKey="planned" stroke="hsl(240 3.8% 70%)" strokeWidth={1.5} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
                                <Area type="monotone" dataKey="completed" stroke="hsl(359.5 85.5% 29.8%)" strokeWidth={1.75} fill="url(#tasksTrendFill)" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Donut + project summaries */}
            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h2 className="text-sm font-semibold text-foreground">Status split</h2>
                    <div className="mx-auto mt-2 h-[180px] w-full max-w-[220px]">
                        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 220, height: 180 }}>
                            <PieChart>
                                <Pie data={donutData} dataKey="value" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
                                    {donutData.map((segment) => (
                                        <Cell key={segment.status} fill={segment.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value, name) => [`${value} tasks`, String(name)]} contentStyle={tooltipStyle} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <ul className="mt-2 space-y-1.5 border-t pt-3">
                        {donutData.length === 0 && <li className="text-xs text-muted-foreground">No tasks in this project yet.</li>}
                        {donutData.map((segment) => (
                            <li key={segment.status} className="flex items-center gap-2 text-xs">
                                <span className="size-2 rounded-full" style={{ backgroundColor: segment.color }} />
                                <span className="text-muted-foreground">{segment.label}</span>
                                <span className="ml-auto font-medium text-foreground">{segment.value}</span>
                            </li>
                        ))}
                    </ul>
                </Card>

                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Projects</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">Grouped by department or field region</p>
                        </div>
                        <Link href="/tasks/board" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                            Open board
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </div>
                    {projects.length ? (
                        <ul className="divide-y">
                            {projects.map((project) => (
                                <li key={project.id} className="flex items-center gap-4 px-5 py-3.5">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                                            <span className="text-xs text-muted-foreground">
                                                {project.displayId ?? WORK_PROJECT_KIND_LABEL[project.kind]} · {project.open} open · {project.verified} verified
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center gap-3">
                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
                                            </div>
                                            <span className="w-9 text-right text-xs font-medium text-muted-foreground">{project.progress}%</span>
                                        </div>
                                    </div>
                                    <StatusBadge status={{ label: WORK_PROJECT_KIND_LABEL[project.kind], tone: project.kind === "REGION" ? "info" : "neutral" }} className="hidden shrink-0 md:inline-flex" />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No active projects. A project is a department's or a city's frame for its tasks.</p>
                    )}
                </Card>
            </div>

            {/* Workload + overdue */}
            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <div className="border-b px-5 py-4">
                        <h2 className="text-sm font-semibold text-foreground">Workload</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">Who holds what — open tasks, in progress, overdue, and hours logged in the window</p>
                    </div>
                    {workload.length ? (
                        <ul className="divide-y">
                            {workload.map((row) => (
                                <li key={row.person.userId} className="flex items-center gap-3 px-5 py-3">
                                    <InitialsAvatar name={personName(row.person)} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">{personName(row.person)}</p>
                                        <p className="truncate text-xs text-muted-foreground">{row.person.role ?? row.person.departmentName ?? "—"}</p>
                                    </div>
                                    <dl className="grid shrink-0 grid-cols-4 gap-4 text-right text-xs tabular-nums">
                                        <div>
                                            <dt className="text-muted-foreground">Open</dt>
                                            <dd className="font-medium text-foreground">{row.open}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-muted-foreground">Active</dt>
                                            <dd className="font-medium text-foreground">{row.inProgress}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-muted-foreground">Overdue</dt>
                                            <dd className={cn("font-medium", row.overdue > 0 ? "text-danger" : "text-foreground")}>{row.overdue}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-muted-foreground">Hours</dt>
                                            <dd className="font-medium text-foreground">{row.hoursInWindow}</dd>
                                        </div>
                                    </dl>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nobody holds an open task.</p>
                    )}
                </Card>

                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Overdue</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">Past their deadline and not finished, earliest first</p>
                        </div>
                        <Link href="/tasks/board" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                            All {tasks.overdue}
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </div>
                    {overdueList.length ? (
                        <ul className="divide-y">
                            {overdueList.map((task) => (
                                <li key={task.id} className="flex items-center gap-4 px-5 py-3">
                                    <div className="min-w-0 flex-1">
                                        <Link href={`/tasks/${encodeURIComponent(task.id)}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                                            {task.title}
                                        </Link>
                                        <p className="text-xs text-muted-foreground">
                                            {task.displayId ?? task.id} · {task.assignees.map((person) => personName(person)).join(", ") || "Unassigned"}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs font-medium tabular-nums text-danger">{task.deadline ? formatDate(task.deadline) : "—"}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing is overdue.</p>
                    )}
                </Card>
            </div>

            <p className="text-xs text-muted-foreground">
                By priority:{" "}
                {Object.entries(tasks.byPriority)
                    .map(([priority, count]) => `${count} ${priority.toLowerCase()}`)
                    .join(" · ") || "none"}
                {" · "}
                {tasks.byStatus.BLOCKED ?? 0} blocked · open issues by severity:{" "}
                {Object.entries(issues.bySeverity)
                    .filter(([, n]) => n > 0)
                    .map(([severity, n]) => `${n} ${severity.toLowerCase()}`)
                    .join(", ") || "none"}
            </p>
        </div>
    );
}
