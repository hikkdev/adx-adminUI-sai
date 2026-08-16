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
import { formatCompactINR } from "@/lib/format";
import { ADVERTISER_STATUS_META, type Advertiser } from "@/types";

interface AdvertisersTableProps {
    advertisers: Advertiser[];
}

export function AdvertisersTable({ advertisers }: AdvertisersTableProps) {
    const router = useRouter();

    const columns = React.useMemo<ColumnDef<Advertiser>[]>(
        () => [
            selectionColumn<Advertiser>(),
            {
                id: "brand",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Brand</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.name}</p>
                            <p className="text-xs text-muted-foreground">{row.original.industry}</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "contact",
                accessorKey: "contact",
                header: "Contact",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.contact}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={ADVERTISER_STATUS_META[row.original.status]} />
                ),
            },
            {
                id: "campaigns",
                accessorKey: "activeCampaigns",
                header: ({ column }) => (
                    <SortableHeader column={column}>Active campaigns</SortableHeader>
                ),
                cell: ({ row }) => row.original.activeCampaigns,
            },
            {
                id: "spend",
                accessorKey: "totalSpend",
                header: ({ column }) => <SortableHeader column={column}>Total spend</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium">{formatCompactINR(row.original.totalSpend)}</span>
                ),
            },
            {
                id: "last-activity",
                accessorKey: "lastActive",
                header: "Last campaign activity",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.lastActive}</span>
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
                            <DropdownMenuItem
                                onSelect={() => router.push(`/advertisers/${row.original.id}`)}
                            >
                                View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push("/campaigns")}>
                                View campaigns
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => toast.success(`Statement emailed to ${row.original.contact}`)}
                            >
                                Email statement
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
                title="Advertisers"
                actions={
                    <Button onClick={() => toast.info("Advertisers join via the brand portal, send an invite from there.")}>
                        <Plus className="mr-1.5 size-4" />
                        Add advertiser
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={advertisers}
                searchPlaceholder="Search advertisers, brand, contact"
                initialPageSize={10}
                onRowClick={(advertiser) => router.push(`/advertisers/${advertiser.id}`)}
            />
        </div>
    );
}
