"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import {
    WORK_TASK_STATUS_META,
    type TaskIssue,
    type WorkTask,
    type WorkTaskStatus,
} from "@/types";

interface TasksOverviewProps {
    tasks: WorkTask[];
    issues: TaskIssue[];
}

const STAT_DEFS: { label: string; statuses: WorkTaskStatus[]; barClass: string }[] = [
    { label: "Verified tasks", statuses: ["verified"], barClass: "bg-success" },
    { label: "In progress", statuses: ["in_progress"], barClass: "bg-info" },
    { label: "Pending review", statuses: ["pending_review"], barClass: "bg-warning" },
    { label: "Upcoming", statuses: ["todo", "draft"], barClass: "bg-danger" },
];

const DONUT_SEGMENTS: { status: WorkTaskStatus; color: string }[] = [
    { status: "verified", color: "hsl(153 73% 28%)" },
    { status: "in_progress", color: "hsl(217 80% 42%)" },
    { status: "pending_review", color: "hsl(34 100% 30%)" },
    { status: "todo", color: "hsl(240 3.8% 70%)" },
    { status: "blocked", color: "hsl(4 76% 40%)" },
    { status: "draft", color: "hsl(240 5.9% 84%)" },
];

/** Deterministic completion trend derived from task deadlines by month. */
function buildTrend(tasks: WorkTask[]) {
    const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const keys = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
    let done = 0;
    let planned = 0;
    return keys.map((key, index) => {
        done += tasks.filter((t) => t.status === "verified" && t.deadline.startsWith(key)).length;
        planned += tasks.filter((t) => t.deadline.startsWith(key)).length;
        return { month: months[index], completed: done, planned };
    });
}

export function TasksOverview({ tasks, issues }: TasksOverviewProps) {
    const [project, setProject] = React.useState("All");
    const projects = React.useMemo(
        () => ["All", ...Array.from(new Set(tasks.map((task) => task.project)))],
        [tasks]
    );
    /*
     * Every array handed to Recharts must keep a stable identity between
     * renders. A fresh array on each render restarts the chart's mount
     * animation before it can finish, so the series never paints.
     */
    const active = React.useMemo(() => {
        const filtered =
            project === "All" ? tasks : tasks.filter((task) => task.project === project);
        return filtered.filter((task) => task.status !== "archived");
    }, [tasks, project]);

    const completionPct = active.length
        ? Math.round(
              active.reduce((sum, task) => sum + task.progress, 0) / active.length
          )
        : 0;
    const openIssues = issues.filter(
        (issue) => issue.status === "open" || issue.status === "in_progress"
    ).length;

    const trend = React.useMemo(() => buildTrend(active), [active]);

    const gaugeData = React.useMemo(() => [{ value: completionPct }], [completionPct]);

    const donutData = React.useMemo(
        () =>
            DONUT_SEGMENTS.map((segment) => ({
                name: WORK_TASK_STATUS_META[segment.status].label,
                value: active.filter((task) => task.status === segment.status).length,
                color: segment.color,
            })).filter((segment) => segment.value > 0),
        [active]
    );

    const byProject = React.useMemo(() => {
        const groups = new Map<string, WorkTask[]>();
        for (const task of active) {
            groups.set(task.project, [...(groups.get(task.project) ?? []), task]);
        }
        return Array.from(groups.entries())
            .map(([name, items]) => ({
                name,
                items,
                avg: Math.round(items.reduce((sum, t) => sum + t.progress, 0) / items.length),
            }))
            .sort((a, b) => b.items.length - a.items.length)
            .slice(0, 6);
    }, [active]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <Select value={project} onValueChange={setProject}>
                    <SelectTrigger className="h-9 w-52 bg-card">
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

            {/* Stat tiles with share-of-total bars */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {STAT_DEFS.map((def) => {
                    const count = active.filter((task) => def.statuses.includes(task.status)).length;
                    const share = active.length ? Math.round((count / active.length) * 100) : 0;
                    return (
                        <Card key={def.label} className="rounded-lg border-border p-5 shadow-none">
                            <p className="text-xs font-medium text-muted-foreground">{def.label}</p>
                            <p className="text-metric mt-2 text-foreground">
                                {count}
                                <span className="ml-1 text-sm font-normal text-muted-foreground">
                                    of {active.length}
                                </span>
                            </p>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn("h-full rounded-full", def.barClass)}
                                    style={{ width: `${share}%` }}
                                />
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
                        Average progress across {active.length} active tasks
                    </p>
                    <div className="relative mx-auto mt-2 h-[190px] w-full max-w-[240px]">
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                            initialDimension={{ width: 240, height: 190 }}
                        >
                            <RadialBarChart
                                data={gaugeData}
                                startAngle={210}
                                endAngle={-30}
                                innerRadius="72%"
                                outerRadius="100%"
                            >
                                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                <RadialBar
                                    dataKey="value"
                                    cornerRadius={6}
                                    fill="hsl(359.5 85.5% 29.8%)"
                                    background={{ fill: "hsl(240 4.8% 95.9%)" }}
                                    isAnimationActive={false}
                                />
                            </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-metric text-3xl text-foreground">{completionPct}%</span>
                            <span className="mt-1 text-xs text-muted-foreground">complete</span>
                        </div>
                    </div>
                    <p className="border-t pt-3 text-center text-xs text-muted-foreground">
                        {openIssues} open issues in the risk log
                    </p>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-2">
                    <h2 className="text-sm font-semibold text-foreground">Progress trend</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Cumulative verified tasks against everything planned
                    </p>
                    <div className="mt-3">
                        <ResponsiveContainer
                            width="100%"
                            height={220}
                            initialDimension={{ width: 880, height: 220 }}
                        >
                            <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                                <defs>
                                    <linearGradient id="tasksTrendFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(359.5 85.5% 29.8%)" stopOpacity={0.12} />
                                        <stop offset="95%" stopColor="hsl(359.5 85.5% 29.8%)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke="hsl(240 5.9% 90%)" strokeWidth={1} />
                                <XAxis
                                    dataKey="month"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                                    dy={6}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                                />
                                <Tooltip
                                    formatter={(value, name) => [
                                        String(value),
                                        name === "completed" ? "Verified" : "Planned",
                                    ]}
                                    contentStyle={{
                                        borderRadius: 8,
                                        border: "1px solid hsl(240 5.9% 90%)",
                                        fontSize: 12,
                                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="planned"
                                    stroke="hsl(240 3.8% 70%)"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 4"
                                    fill="none"
                                    isAnimationActive={false}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="completed"
                                    stroke="hsl(359.5 85.5% 29.8%)"
                                    strokeWidth={1.75}
                                    fill="url(#tasksTrendFill)"
                                    isAnimationActive={false}
                                />
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
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                            initialDimension={{ width: 220, height: 180 }}
                        >
                            <PieChart>
                                <Pie
                                    data={donutData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={52}
                                    outerRadius={78}
                                    paddingAngle={2}
                                    strokeWidth={0}
                                    isAnimationActive={false}
                                >
                                    {donutData.map((segment) => (
                                        <Cell key={segment.name} fill={segment.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value, name) => [`${value} tasks`, String(name)]}
                                    contentStyle={{
                                        borderRadius: 8,
                                        border: "1px solid hsl(240 5.9% 90%)",
                                        fontSize: 12,
                                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <ul className="mt-2 space-y-1.5 border-t pt-3">
                        {donutData.map((segment) => (
                            <li key={segment.name} className="flex items-center gap-2 text-xs">
                                <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: segment.color }}
                                />
                                <span className="text-muted-foreground">{segment.name}</span>
                                <span className="ml-auto font-medium text-foreground">{segment.value}</span>
                            </li>
                        ))}
                    </ul>
                </Card>

                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Projects</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Grouped by department or field region
                            </p>
                        </div>
                        <Link
                            href="/tasks/board"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                            Open board
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </div>
                    <ul className="divide-y">
                        {byProject.map((group) => {
                            const featured = group.items[0];
                            return (
                                <li key={group.name} className="flex items-center gap-4 px-5 py-3.5">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {group.name}
                                            </p>
                                            <span className="text-xs text-muted-foreground">
                                                {group.items.length} tasks
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center gap-3">
                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full bg-primary"
                                                    style={{ width: `${group.avg}%` }}
                                                />
                                            </div>
                                            <span className="w-9 text-right text-xs font-medium text-muted-foreground">
                                                {group.avg}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="hidden shrink-0 -space-x-1.5 sm:flex">
                                        {featured.team.slice(0, 3).map((member) => (
                                            <InitialsAvatar
                                                key={member.id}
                                                name={member.name}
                                                size="sm"
                                                className="ring-2 ring-card"
                                            />
                                        ))}
                                    </div>
                                    <StatusBadge
                                        status={WORK_TASK_STATUS_META[featured.status]}
                                        className="hidden shrink-0 md:inline-flex"
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            </div>
        </div>
    );
}
