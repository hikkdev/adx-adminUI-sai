"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
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
import { AGENT_STATUS_META, type Agent } from "@/types";

interface AgentsTableProps {
    agents: Agent[];
}

export function AgentsTable({ agents }: AgentsTableProps) {
    const router = useRouter();

    const columns = React.useMemo<ColumnDef<Agent>[]>(
        () => [
            selectionColumn<Agent>(),
            {
                id: "agent",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Agent</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} size="sm" />
                        <span className="font-medium text-foreground">{row.original.name}</span>
                    </div>
                ),
            },
            {
                id: "territory",
                accessorKey: "area",
                header: "Territory",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.area}, {row.original.city}
                    </span>
                ),
            },
            {
                id: "publishers",
                accessorKey: "publishersOnboarded",
                header: ({ column }) => <SortableHeader column={column}>Publishers</SortableHeader>,
                cell: ({ row }) => row.original.publishersOnboarded,
            },
            {
                id: "orders-mtd",
                accessorKey: "ordersCompleted",
                header: ({ column }) => <SortableHeader column={column}>Orders MTD</SortableHeader>,
                cell: ({ row }) => row.original.ordersCompleted,
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={AGENT_STATUS_META[row.original.status]} />,
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
                            <DropdownMenuItem onSelect={() => router.push(`/agents/${row.original.id}`)}>
                                View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push("/orders")}>
                                View orders
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => toast.success(`Payout summary sent to ${row.original.name}`)}
                            >
                                Send payout summary
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
                title="Agents"
                actions={
                    <Button onClick={() => toast.info("Agents are onboarded through the ADX field app.")}>
                        <Plus className="mr-1.5 size-4" />
                        Add agent
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={agents}
                searchPlaceholder="Search agents, territory, phone"
                initialPageSize={10}
                onRowClick={(agent) => router.push(`/agents/${agent.id}`)}
            />
        </div>
    );
}
