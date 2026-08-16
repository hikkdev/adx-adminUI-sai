"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    EMPLOYEE_TYPE_META,
    EMPLOYMENT_STATUS_META,
    type Employee,
} from "@/types";

interface DirectoryTableProps {
    employees: Employee[];
}

export function DirectoryTable({ employees }: DirectoryTableProps) {
    const router = useRouter();
    const [department, setDepartment] = React.useState("All");

    const departments = React.useMemo(
        () => ["All", ...Array.from(new Set(employees.map((person) => person.department)))],
        [employees]
    );
    const rows =
        department === "All"
            ? employees
            : employees.filter((person) => person.department === department);

    const columns = React.useMemo<ColumnDef<Employee>[]>(
        () => [
            {
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Employee</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                                {row.original.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {row.original.employeeCode}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                accessorKey: "designation",
                header: ({ column }) => <SortableHeader column={column}>Role</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="text-foreground">{row.original.designation}</p>
                        <p className="text-xs text-muted-foreground">{row.original.department}</p>
                    </div>
                ),
            },
            {
                accessorKey: "region",
                header: ({ column }) => <SortableHeader column={column}>Region</SortableHeader>,
            },
            {
                accessorKey: "joiningDate",
                header: ({ column }) => <SortableHeader column={column}>Joined</SortableHeader>,
                cell: ({ row }) => formatDate(row.original.joiningDate),
            },
            {
                accessorKey: "type",
                header: "Work mode",
                cell: ({ row }) => (
                    <StatusBadge status={EMPLOYEE_TYPE_META[row.original.type]} />
                ),
            },
            {
                accessorKey: "employment",
                header: "Employment",
                cell: ({ row }) => (
                    <StatusBadge status={EMPLOYMENT_STATUS_META[row.original.employment]} />
                ),
            },
        ],
        []
    );

    return (
        <DataTable
            columns={columns}
            data={rows}
            searchPlaceholder="Search employees"
            onRowClick={(person) => router.push(`/employees/directory/${person.id}`)}
            toolbar={
                <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger className="h-9 w-44 bg-card">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {departments.map((option) => (
                            <SelectItem key={option} value={option}>
                                {option === "All" ? "All departments" : option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            }
        />
    );
}
