"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { KanbanSquare, MoreHorizontal } from "lucide-react";
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
import { formatCompactINR, formatDate } from "@/lib/format";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ORDER_STATUS_WIRE,
    type OrderStatusWire,
    type OrdersPage,
} from "@/services/orders";
import { ORDER_STATUS_META, type Order, type OrderStatus } from "@/types";

interface OrdersTableProps {
    page: OrdersPage;
    status: OrderStatusWire | "ALL";
    onStatusChange: (status: OrderStatusWire | "ALL") => void;
}

/** Neither finished nor abandoned — the ones somebody is still waiting on. */
const OPEN: Order["status"][] = [
    "DRAFT",
    "PENDING_PUBLISHER",
    "PENDING_PRINT",
    "SELF_INSTALL",
    "PENDING_AGENT",
    "SLOT_PROPOSED",
    "SLOT_CONFIRMED",
    "IN_PROGRESS",
    "PENDING_OTP",
    "PENDING_APPROVAL",
];

export function OrdersTable({ page, status, onStatusChange }: OrdersTableProps) {
    const router = useRouter();

    const open = page.items.filter((order: Order) => OPEN.includes(order.status)).length;

    const columns = React.useMemo<ColumnDef<Order>[]>(
        () => [
            selectionColumn<Order>(),
            {
                id: "order",
                accessorKey: "listing",
                header: ({ column }) => <SortableHeader column={column}>Order</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                            {row.original.listing}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                            {[row.original.city, row.original.campaignName]
                                .filter(Boolean)
                                .join(" · ") || row.original.id}
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
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={ORDER_STATUS_META[row.original.status]} />,
            },
            {
                id: "budget",
                accessorKey: "budget",
                header: ({ column }) => <SortableHeader column={column}>Budget</SortableHeader>,
                cell: ({ row }) =>
                    row.original.budget === null ? (
                        <span className="text-muted-foreground/60">—</span>
                    ) : (
                        <span className="font-medium tabular-nums">
                            {formatCompactINR(row.original.budget)}
                        </span>
                    ),
            },
            {
                id: "flight",
                accessorKey: "startDate",
                header: "Flight",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.startDate
                            ? `${formatDate(row.original.startDate)}${
                                  row.original.endDate
                                      ? ` – ${formatDate(row.original.endDate)}`
                                      : ""
                              }`
                            : "Not dated"}
                    </span>
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
                            {/* Only what the API can actually do. "Nudge agent"
                                and "Reassign" used to live here as toasts over
                                nothing; approving and cancelling are real, and
                                they are on the order page where there is room
                                to say what they mean before they happen. */}
                            <DropdownMenuItem
                                onSelect={() => router.push(`/orders/${row.original.id}`)}
                            >
                                Open order
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
                subtitle={
                    page.items.length < page.total
                        ? `${open} still open · showing the first ${page.items.length} of ${page.total}`
                        : `${open} still open · ${page.total} orders`
                }
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
                data={page.items}
                searchPlaceholder="Search by listing, city, campaign or agent"
                initialPageSize={10}
                onRowClick={(order) => router.push(`/orders/${order.id}`)}
                toolbar={
                    <Select
                        value={status}
                        onValueChange={(value) => onStatusChange(value as OrderStatusWire | "ALL")}
                    >
                        <SelectTrigger className="h-9 w-[230px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Status: All ({page.total})</SelectItem>
                            {ORDER_STATUS_WIRE.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {/* Counted server-side without this filter in
                                        force, so every option says what it holds. */}
                                    {ORDER_STATUS_META[value.toLowerCase() as OrderStatus]?.label ??
                                        value}{" "}
                                    ({page.counts[value] ?? 0})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
            />
        </div>
    );
}
