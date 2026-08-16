"use client";

import * as React from "react";
import Link from "next/link";
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatCompactINR, formatDate } from "@/lib/format";
import { CAMPAIGN_STATUS_META, type Campaign, type CampaignStatus } from "@/types";

interface CampaignsTableProps {
    campaigns: Campaign[];
}

export function CampaignsTable({ campaigns }: CampaignsTableProps) {
    const router = useRouter();
    const [statusFilter, setStatusFilter] = React.useState<CampaignStatus | "all">(
        "awaiting_approval"
    );

    const filtered = React.useMemo(
        () =>
            statusFilter === "all"
                ? campaigns
                : campaigns.filter((campaign) => campaign.status === statusFilter),
        [campaigns, statusFilter]
    );

    const awaiting = campaigns.filter(
        (campaign) => campaign.status === "awaiting_approval"
    ).length;

    const columns = React.useMemo<ColumnDef<Campaign>[]>(
        () => [
            selectionColumn<Campaign>(),
            {
                id: "campaign",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Campaign</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.advertiser} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.name}</p>
                            <p className="text-xs text-muted-foreground">{row.original.objective}</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "brand",
                accessorKey: "advertiser",
                header: "Brand",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.advertiser}</span>
                ),
            },
            {
                id: "budget",
                accessorKey: "budget",
                header: ({ column }) => <SortableHeader column={column}>Budget</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium">{formatCompactINR(row.original.budget)}</span>
                ),
            },
            {
                id: "listings",
                accessorKey: "listings",
                header: "Listings",
                cell: ({ row }) => row.original.listings,
            },
            {
                id: "ends",
                accessorKey: "endDate",
                header: ({ column }) => <SortableHeader column={column}>Ends</SortableHeader>,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{formatDate(row.original.endDate)}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={CAMPAIGN_STATUS_META[row.original.status]} />
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
                                onSelect={() => router.push(`/campaigns/${row.original.id}`)}
                            >
                                Review campaign
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => toast.success(`${row.original.name} approved`)}
                            >
                                Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push("/moderation")}>
                                Review creative
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="text-danger focus:text-danger"
                                onSelect={() => toast.success(`${row.original.name} rejected`)}
                            >
                                Reject
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
                title="Campaigns"
                subtitle={`${awaiting} awaiting approval`}
                actions={
                    <Button asChild>
                        <Link href="/campaigns/new">
                            <Plus className="mr-1.5 size-4" />
                            New campaign
                        </Link>
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={filtered}
                searchPlaceholder="Search campaigns or brand"
                initialPageSize={10}
                onRowClick={(campaign) => router.push(`/campaigns/${campaign.id}`)}
                toolbar={
                    <Select
                        value={statusFilter}
                        onValueChange={(value) =>
                            setStatusFilter(value as CampaignStatus | "all")
                        }
                    >
                        <SelectTrigger className="h-9 w-[190px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Status: All</SelectItem>
                            <SelectItem value="awaiting_approval">Awaiting approval</SelectItem>
                            <SelectItem value="live">Live</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                    </Select>
                }
                bulkActions={(rows, clear) => (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                            toast.success(`${rows.length} campaigns approved`);
                            clear();
                        }}
                    >
                        Approve selected
                    </Button>
                )}
            />
        </div>
    );
}
