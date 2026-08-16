"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    ATTENDANCE_STATUS_META,
    type AttendanceRecord,
    type AttendanceStatus,
} from "@/types";

interface AttendanceTableProps {
    attendance: AttendanceRecord[];
}

type Filter = "all" | AttendanceStatus;

export function AttendanceTable({ attendance }: AttendanceTableProps) {
    const [filter, setFilter] = React.useState<Filter>("all");

    const rows =
        filter === "all" ? attendance : attendance.filter((record) => record.status === filter);

    const columns = React.useMemo<ColumnDef<AttendanceRecord>[]>(
        () => [
            {
                accessorKey: "employee",
                header: ({ column }) => <SortableHeader column={column}>Employee</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.employee} />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                                {row.original.employee}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {row.original.designation}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                accessorKey: "department",
                header: ({ column }) => <SortableHeader column={column}>Department</SortableHeader>,
            },
            {
                accessorKey: "date",
                header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
                cell: ({ row }) => formatDate(row.original.date),
            },
            { accessorKey: "checkIn", header: "Check in" },
            { accessorKey: "checkOut", header: "Check out" },
            { accessorKey: "workHours", header: "Work hours" },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={ATTENDANCE_STATUS_META[row.original.status]} />
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-4">
            <FilterChips
                value={filter}
                onChange={setFilter}
                chips={[
                    { value: "all", label: "All", count: attendance.length },
                    {
                        value: "on_time",
                        label: "On time",
                        count: attendance.filter((r) => r.status === "on_time").length,
                    },
                    {
                        value: "late",
                        label: "Late",
                        count: attendance.filter((r) => r.status === "late").length,
                    },
                    {
                        value: "wfh",
                        label: "Work from home",
                        count: attendance.filter((r) => r.status === "wfh").length,
                    },
                    {
                        value: "half_day",
                        label: "Half day",
                        count: attendance.filter((r) => r.status === "half_day").length,
                    },
                    {
                        value: "absent",
                        label: "Absent",
                        count: attendance.filter((r) => r.status === "absent").length,
                    },
                ]}
            />
            <DataTable
                columns={columns}
                data={rows}
                searchPlaceholder="Search attendance"
            />
        </div>
    );
}
