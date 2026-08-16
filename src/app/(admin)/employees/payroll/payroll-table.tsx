"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatINR } from "@/lib/format";
import { PAYROLL_STATUS_META, type PayrollRow } from "@/types";

interface PayrollTableProps {
    payroll: PayrollRow[];
}

export function PayrollTable({ payroll: initialPayroll }: PayrollTableProps) {
    const [payroll, setPayroll] = React.useState(initialPayroll);

    const release = (ids: string[], clear: () => void) => {
        setPayroll((current) =>
            current.map((row) =>
                ids.includes(row.id) && row.status === "pending"
                    ? { ...row, status: "paid" as const, payDate: "2026-08-10" }
                    : row
            )
        );
        clear();
        toast.success(`${ids.length} ${ids.length === 1 ? "salary" : "salaries"} released`);
    };

    const columns = React.useMemo<ColumnDef<PayrollRow>[]>(
        () => [
            selectionColumn<PayrollRow>(),
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
                                {row.original.designation} · {row.original.department}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                accessorKey: "ctc",
                header: ({ column }) => <SortableHeader column={column}>Monthly CTC</SortableHeader>,
                cell: ({ row }) => (
                    <span className="tabular-nums">{formatINR(row.original.ctc)}</span>
                ),
            },
            {
                accessorKey: "gross",
                header: "Gross",
                cell: ({ row }) => (
                    <span className="tabular-nums">{formatINR(row.original.gross)}</span>
                ),
            },
            {
                accessorKey: "deductions",
                header: "Deductions",
                cell: ({ row }) => (
                    <span className="tabular-nums text-muted-foreground">
                        {row.original.deductions ? formatINR(row.original.deductions) : "None"}
                    </span>
                ),
            },
            {
                accessorKey: "netPay",
                header: ({ column }) => <SortableHeader column={column}>Net pay</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium tabular-nums text-foreground">
                        {formatINR(row.original.netPay)}
                    </span>
                ),
            },
            {
                accessorKey: "payDate",
                header: "Pay date",
                cell: ({ row }) =>
                    row.original.payDate ? formatDate(row.original.payDate) : "Not released",
            },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={PAYROLL_STATUS_META[row.original.status]} />
                ),
            },
        ],
        []
    );

    return (
        <DataTable
            columns={columns}
            data={payroll}
            searchPlaceholder="Search payroll"
            bulkActions={(rows, clearSelection) => (
                <Button
                    size="sm"
                    onClick={() =>
                        release(
                            rows.map((row) => row.id),
                            clearSelection
                        )
                    }
                >
                    Release selected
                </Button>
            )}
        />
    );
}
