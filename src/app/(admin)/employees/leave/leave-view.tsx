"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    LEAVE_STATUS_META,
    type Holiday,
    type LeaveRequest,
} from "@/types";

interface LeaveViewProps {
    leave: LeaveRequest[];
    holidays: Holiday[];
}

export function LeaveView({ leave: initialLeave, holidays }: LeaveViewProps) {
    const [leave, setLeave] = React.useState(initialLeave);

    const decide = (id: string, status: "approved" | "rejected") => {
        setLeave((current) =>
            current.map((request) => (request.id === id ? { ...request, status } : request))
        );
        toast.success(`Leave ${id} ${status}`);
    };

    const upcoming = holidays.filter((holiday) => holiday.date >= "2026-08-10");
    const past = holidays.filter((holiday) => holiday.date < "2026-08-10");

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <PageHeader
                    size="section"
                    title="Leave requests"
                    subtitle="Pending requests need a decision before payroll cutoff."
                />
                <SimpleTable
                    columns={[
                        {
                            key: "employee",
                            label: "Employee",
                            render: (row) => (
                                <div>
                                    <p className="font-medium text-foreground">{row.employee}</p>
                                    <p className="text-xs text-muted-foreground">{row.department}</p>
                                </div>
                            ),
                        },
                        { key: "type", label: "Type", render: (row) => row.leaveType },
                        {
                            key: "window",
                            label: "Dates",
                            render: (row) =>
                                row.from === row.to
                                    ? formatDate(row.from)
                                    : `${formatDate(row.from)} to ${formatDate(row.to)}`,
                        },
                        {
                            key: "days",
                            label: "Days",
                            render: (row) => `${row.days} ${row.days === 1 ? "day" : "days"}`,
                        },
                        { key: "reason", label: "Reason", render: (row) => row.reason },
                        { key: "approver", label: "Approver", render: (row) => row.approver },
                        {
                            key: "status",
                            label: "Status",
                            render: (row) =>
                                row.status === "pending" ? (
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            size="sm"
                                            className="h-7 px-2.5 text-xs"
                                            onClick={() => decide(row.id, "approved")}
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 bg-card px-2.5 text-xs"
                                            onClick={() => decide(row.id, "rejected")}
                                        >
                                            Reject
                                        </Button>
                                    </div>
                                ) : (
                                    <StatusBadge status={LEAVE_STATUS_META[row.status]} />
                                ),
                        },
                    ]}
                    rows={leave}
                    rowKey={(row) => row.id}
                />
            </section>

            <section className="space-y-3">
                <PageHeader
                    size="section"
                    title="Holiday calendar 2026"
                    subtitle="Gazetted holidays and optional festival days."
                />
                <div className="grid gap-4 xl:grid-cols-2">
                    <SimpleTable
                        columns={[
                            {
                                key: "date",
                                label: "Upcoming",
                                render: (row: Holiday) => (
                                    <span className="font-medium text-foreground">
                                        {formatDate(row.date)}
                                    </span>
                                ),
                            },
                            { key: "day", label: "Day", render: (row) => row.day },
                            { key: "name", label: "Holiday", render: (row) => row.name },
                            {
                                key: "kind",
                                label: "Type",
                                render: (row) => (
                                    <StatusBadge
                                        status={
                                            row.kind === "public"
                                                ? { label: "Public", tone: "success" }
                                                : { label: "Optional", tone: "neutral" }
                                        }
                                    />
                                ),
                            },
                        ]}
                        rows={upcoming}
                        rowKey={(row) => row.date}
                    />
                    <SimpleTable
                        columns={[
                            {
                                key: "date",
                                label: "Earlier this year",
                                render: (row: Holiday) => (
                                    <span className="text-muted-foreground">
                                        {formatDate(row.date)}
                                    </span>
                                ),
                            },
                            { key: "day", label: "Day", render: (row) => row.day },
                            { key: "name", label: "Holiday", render: (row) => row.name },
                            {
                                key: "kind",
                                label: "Type",
                                render: (row) => (
                                    <StatusBadge
                                        status={
                                            row.kind === "public"
                                                ? { label: "Public", tone: "success" }
                                                : { label: "Optional", tone: "neutral" }
                                        }
                                    />
                                ),
                            },
                        ]}
                        rows={past}
                        rowKey={(row) => row.date}
                    />
                </div>
            </section>
        </div>
    );
}
