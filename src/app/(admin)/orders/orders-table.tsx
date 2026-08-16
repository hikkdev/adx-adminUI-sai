"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { KanbanSquare, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ORDER_PRIORITY_META, ORDER_STATUS_META, type Order } from "@/types";

interface OrdersTableProps {
    orders: Order[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
    const router = useRouter();

    const openToday = orders.filter((order) => order.status !== "completed").length;

    const columns = React.useMemo<ColumnDef<Order>[]>(
        () => [
            selectionColumn<Order>(),
            {
                id: "order",
                accessorKey: "number",
                header: ({ column }) => <SortableHeader column={column}>Order</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium text-foreground">
                            #{row.original.number}{" "}
                            <span className="font-normal text-muted-foreground">
                                {row.original.type}
                            </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {row.original.listing} · {row.original.city}
                        </p>
                    </div>
                ),
            },
            {
                id: "agent",
                accessorKey: "agent",
                header: "Agent",
                cell: ({ row }) =>
                    row.original.agent ? (
                        <div className="flex items-center gap-2">
                            <InitialsAvatar name={row.original.agent} size="sm" />
                            <span className="text-muted-foreground">{row.original.agent}</span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground/60">Unassigned</span>
                    ),
            },
            {
                id: "priority",
                accessorKey: "priority",
                header: "Priority",
                cell: ({ row }) => (
                    <StatusBadge status={ORDER_PRIORITY_META[row.original.priority]} />
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={ORDER_STATUS_META[row.original.status]} />,
            },
            {
                id: "due",
                accessorKey: "due",
                header: "Due",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.due}</span>
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                size: 48,
                cell: ({ row }) => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">Row actions</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => router.push(`/orders/${row.original.id}`)}>
                                View order
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => toast.success(`Reminder sent for #${row.original.number}`)}
                            >
                                Nudge agent
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => toast.success(`Order #${row.original.number} reassigned`)}
                            >
                                Reassign
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
            },
        ],
        [router]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Orders"
                subtitle={`${openToday} open today`}
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/orders/pipeline">
                            <KanbanSquare className="mr-1.5 size-4" />
                            Pipeline view
                        </Link>
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={orders}
                searchPlaceholder="Search orders or agent"
                initialPageSize={10}
                onRowClick={(order) => router.push(`/orders/${order.id}`)}
                bulkActions={(rows, clear) => (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                            toast.success(`${rows.length} agents nudged`);
                            clear();
                        }}
                    >
                        Nudge agents
                    </Button>
                )}
            />
        </div>
    );
}
