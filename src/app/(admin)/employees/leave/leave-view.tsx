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
    type LeaveRequest,
} from "@/types";

interface LeaveViewProps {
    leave: LeaveRequest[];
}

export function LeaveView({ leave: initialLeave }: LeaveViewProps) {
    const [leave, setLeave] = React.useState(initialLeave);

    const decide = (id: string, status: "approved" | "rejected") => {
        setLeave((current) =>
            current.map((request) => (request.id === id ? { ...request, status } : request))
        );
        toast.success(`Leave ${id} ${status}`);
    };

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


        </div>
    );
}
