"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/adx/kpi-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    ATTENDANCE_STATUS_META,
    type AttendanceRecord,
    type Employee,
    type HrOverview,
    type JobOpening,
    type LeaveRequest,
} from "@/types";

interface EmployeesOverviewProps {
    employees: Employee[];
    overview: HrOverview;
    attendance: AttendanceRecord[];
    jobs: JobOpening[];
    leave: LeaveRequest[];
}

const SPLIT_COLORS = [
    "hsl(153 73% 28%)",
    "hsl(217 80% 42%)",
    "hsl(34 100% 30%)",
    "hsl(4 76% 40%)",
];

export function EmployeesOverview({
    employees,
    overview,
    attendance,
    jobs,
    leave,
}: EmployeesOverviewProps) {
    const today = attendance.filter((record) => record.date === "2026-08-10");
    const present = today.filter((record) => record.status !== "absent").length;
    const openRoles = jobs
        .filter((job) => job.status === "open")
        .reduce((sum, job) => sum + job.openings, 0);
    const pendingLeave = leave.filter((request) => request.status === "pending").length;

    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "headcount",
                        label: "Total employees",
                        value: String(employees.length),
                        hint: "across 12 departments",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "attendance",
                        label: "Today's attendance",
                        value: `${present} of ${today.length}`,
                        hint: "checked in for 10 Aug",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "leave",
                        label: "Pending leave requests",
                        value: String(pendingLeave),
                        hint: "waiting on HR approval",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "roles",
                        label: "Open positions",
                        value: String(openRoles),
                        hint: "across active job posts",
                    }}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h2 className="text-sm font-semibold text-foreground">Where everyone is</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Today's attendance split</p>
                    <div className="mx-auto mt-1 h-[170px] w-full max-w-[210px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={overview.attendanceSplit}
                                    dataKey="value"
                                    nameKey="label"
                                    innerRadius={48}
                                    outerRadius={72}
                                    paddingAngle={2}
                                    strokeWidth={0}
                                >
                                    {overview.attendanceSplit.map((segment, index) => (
                                        <Cell key={segment.label} fill={SPLIT_COLORS[index]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value, name) => [`${value} people`, String(name)]}
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
                        {overview.attendanceSplit.map((segment, index) => (
                            <li key={segment.label} className="flex items-center gap-2 text-xs">
                                <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: SPLIT_COLORS[index] }}
                                />
                                <span className="text-muted-foreground">{segment.label}</span>
                                <span className="ml-auto font-medium text-foreground">
                                    {segment.value}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-2">
                    <h2 className="text-sm font-semibold text-foreground">Workload distribution</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Share of staff running at low, medium and high utilisation
                    </p>
                    <div className="mt-3">
                        <ResponsiveContainer width="100%" height={230}>
                            <BarChart
                                data={overview.performanceTrend}
                                margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                            >
                                <CartesianGrid vertical={false} stroke="hsl(240 5.9% 90%)" strokeWidth={1} />
                                <XAxis
                                    dataKey="label"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                                    dy={6}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value: number) => `${value}%`}
                                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                                />
                                <Tooltip
                                    formatter={(value, name) => [
                                        `${value}%`,
                                        name === "low"
                                            ? "Low"
                                            : name === "medium"
                                              ? "Medium"
                                              : "High",
                                    ]}
                                    contentStyle={{
                                        borderRadius: 8,
                                        border: "1px solid hsl(240 5.9% 90%)",
                                        fontSize: 12,
                                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                                    }}
                                />
                                <Bar dataKey="low" stackId="a" fill="hsl(240 5.9% 84%)" />
                                <Bar dataKey="medium" stackId="a" fill="hsl(34 100% 30%)" />
                                <Bar
                                    dataKey="high"
                                    stackId="a"
                                    fill="hsl(359.5 85.5% 29.8%)"
                                    radius={[3, 3, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-1 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-[hsl(240_5.9%_84%)]" /> Low
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-warning" /> Medium
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-primary" /> High
                        </span>
                    </div>
                </Card>
            </div>

            <div>
                <div className="mb-2.5 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Latest attendance</h2>
                    <Link
                        href="/employees/attendance"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                        Full attendance log
                        <ArrowRight className="size-3.5" />
                    </Link>
                </div>
                <SimpleTable
                    columns={[
                        { key: "employee", label: "Employee", render: (row) => row.employee },
                        { key: "department", label: "Department", render: (row) => row.department },
                        { key: "date", label: "Date", render: (row) => formatDate(row.date) },
                        { key: "in", label: "Check in", render: (row) => row.checkIn },
                        { key: "out", label: "Check out", render: (row) => row.checkOut },
                        {
                            key: "status",
                            label: "Status",
                            render: (row) => (
                                <StatusBadge status={ATTENDANCE_STATUS_META[row.status]} />
                            ),
                        },
                    ]}
                    rows={attendance.slice(0, 6)}
                    rowKey={(row) => row.id}
                />
            </div>
        </div>
    );
}
