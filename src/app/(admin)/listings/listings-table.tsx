"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Map, MoreHorizontal, Plus } from "lucide-react";
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
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR } from "@/lib/format";
import { LISTING_STATUS_META, type Listing, type ListingStatus } from "@/types";

interface ListingsTableProps {
    listings: Listing[];
}

export function ListingsTable({ listings }: ListingsTableProps) {
    const router = useRouter();
    const [statusFilter, setStatusFilter] = React.useState<ListingStatus | "all">(
        "pending_review"
    );

    const filtered = React.useMemo(
        () =>
            statusFilter === "all"
                ? listings
                : listings.filter((listing) => listing.status === statusFilter),
        [listings, statusFilter]
    );

    const pendingCount = listings.filter(
        (listing) => listing.status === "pending_review"
    ).length;

    const columns = React.useMemo<ColumnDef<Listing>[]>(
        () => [
            selectionColumn<Listing>(),
            {
                id: "listing",
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Listing</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.title} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.title}</p>
                            <p className="text-xs text-muted-foreground">
                                {row.original.city} · {row.original.sizeFt}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "publisher",
                accessorKey: "publisher",
                header: "Publisher",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.publisher}</span>
                ),
            },
            {
                id: "category",
                accessorKey: "type",
                header: "Category",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.type}</span>
                ),
            },
            {
                id: "rate",
                accessorKey: "monthlyRate",
                header: ({ column }) => <SortableHeader column={column}>Monthly rate</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium">{formatINR(row.original.monthlyRate)}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={LISTING_STATUS_META[row.original.status]} />,
            },
            {
                id: "submitted",
                accessorKey: "submittedAt",
                header: ({ column }) => <SortableHeader column={column}>Submitted</SortableHeader>,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.submittedAt}</span>
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
                                onSelect={() => router.push(`/listings/${row.original.id}`)}
                            >
                                Review listing
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => toast.success(`${row.original.title} approved and live`)}
                            >
                                Approve
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="text-danger focus:text-danger"
                                onSelect={() => toast.success(`${row.original.title} rejected`)}
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
                title="Listings"
                subtitle={`${pendingCount} awaiting review`}
                actions={
                    <>
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/listings/map">
                                <Map className="mr-1.5 size-4" />
                                Map view
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/listings/new">
                                <Plus className="mr-1.5 size-4" />
                                Add listing
                            </Link>
                        </Button>
                    </>
                }
            />
            <DataTable
                columns={columns}
                data={filtered}
                searchPlaceholder="Search listings, publisher, category"
                initialPageSize={10}
                onRowClick={(listing) => router.push(`/listings/${listing.id}`)}
                toolbar={
                    <Select
                        value={statusFilter}
                        onValueChange={(value) => setStatusFilter(value as ListingStatus | "all")}
                    >
                        <SelectTrigger className="h-9 w-[180px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Status: All</SelectItem>
                            <SelectItem value="pending_review">Pending review</SelectItem>
                            <SelectItem value="live">Live</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                    </Select>
                }
                bulkActions={(rows, clear) => (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                                toast.success(`${rows.length} listings approved`);
                                clear();
                            }}
                        >
                            Approve selected
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-danger hover:text-danger"
                            onClick={() => {
                                toast.success(`${rows.length} listings rejected`);
                                clear();
                            }}
                        >
                            Reject selected
                        </Button>
                    </>
                )}
                emptyState={
                    <EmptyState
                        icon={Map}
                        title="Queue is clear"
                        description="No listings match this filter. New submissions land here for review before going live."
                    />
                }
            />
        </div>
    );
}
