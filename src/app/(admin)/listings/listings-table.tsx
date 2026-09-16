"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownToLine, Map, MoreHorizontal, Plus, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
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
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { formatMoney } from "@/lib/format";
import { useFeature } from "@/lib/use-feature";
import {
    LISTING_LIFECYCLE,
    LISTING_STATUS_TONE,
    listingStatusLabel,
    type AdminListing,
    type AdminListingsPage,
    type ListingLifecycle,
} from "@/services/listings";

interface ListingsTableProps {
    page: AdminListingsPage;
    status: ListingLifecycle | "ALL";
    onStatusChange: (status: ListingLifecycle | "ALL") => void;
    onChanged: () => void;
}

/** A date the way the desk reads it: the day, not the instant. */
const onDay = (iso: string | null): string => (iso ? iso.slice(0, 10) : "—");

export function ListingsTable({ page, status, onStatusChange }: ListingsTableProps) {
    const router = useRouter();
    /* CG5: the bolt chip is a surface of `marketplace.instant-booking`. Off,
       it is not drawn — the same rule the apps follow — however a row's
       column reads, because the feature is what the chip advertises. */
    const instantBooking = useFeature("marketplace.instant-booking").enabled === true;

    const columns = React.useMemo<ColumnDef<AdminListing>[]>(
        () => [
            selectionColumn<AdminListing>(),
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
                                {[row.original.city, row.original.size].filter(Boolean).join(" · ") ||
                                    row.original.address}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "publisher",
                accessorFn: (listing) => listing.publisherName ?? "",
                header: "Publisher",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {/* A scraped listing nobody has claimed genuinely has no publisher. */}
                        {row.original.publisherName ?? "Unclaimed"}
                    </span>
                ),
            },
            {
                id: "category",
                accessorKey: "category",
                header: "Category",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.subType ?? row.original.category}
                    </span>
                ),
            },
            {
                id: "rate",
                // Sorting needs a number; the printed figure never goes through one.
                accessorFn: (listing) => Number(listing.ratePerDay ?? 0),
                header: ({ column }) => <SortableHeader column={column}>Rate / day</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium">
                        {/* Priced in what the publisher is paid per day. A spot with no
                            rate is one nobody has priced, which is not zero. */}
                        {row.original.ratePerDay ? formatMoney(row.original.ratePerDay) : "—"}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                            status={{
                                label: listingStatusLabel(row.original.status),
                                tone: LISTING_STATUS_TONE[row.original.status],
                            }}
                        />
                        {/* Lot A: STOP_OPEN_WORK or STOP_ACCRUAL alone leave the
                            lifecycle where it was; the chip is what says so. */}
                        {row.original.status !== "SUSPENDED" && <SuspendedChip scopes={row.original.suspensionScopes} />}
                        {/* Lot D (Q105): the publisher's opt-in. Drawn only when
                            the row carries the column; a row without it is not "off". */}
                        {instantBooking && row.original.instantBooking === true && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                                <Zap className="size-3" aria-hidden />
                                Instant
                            </span>
                        )}
                        {/* Lot E: the rate sits under the floor of the card in
                            force. The chip says where the price is; the case
                            on /pricing/approvals says what was decided about it. */}
                        {row.original.belowFloor === true && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                                <ArrowDownToLine className="size-3" aria-hidden />
                                Below floor
                            </span>
                        )}
                    </span>
                ),
            },
            {
                id: "rating",
                // Lot D (Q104): the published reviews' average. Sorting needs a
                // number; the printed figure is the string the API sent.
                accessorFn: (listing) => Number(listing.ratingAvg ?? 0),
                header: ({ column }) => <SortableHeader column={column}>Rating</SortableHeader>,
                cell: ({ row }) =>
                    row.original.ratingAvg ? (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                            <Star className="size-3.5 fill-warning text-warning" aria-hidden />
                            {row.original.ratingAvg}
                            <span className="text-xs text-muted-foreground">({row.original.reviewCount})</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "submitted",
                accessorFn: (listing) => listing.submittedAt ?? "",
                header: ({ column }) => <SortableHeader column={column}>Submitted</SortableHeader>,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{onDay(row.original.submittedAt)}</span>
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
                            {/* Approve and Reject used to sit here and only fire a toast.
                                The decision belongs to the review desk, which has the
                                paperwork and the rate-card floor in front of it. */}
                            <DropdownMenuItem
                                onSelect={() => router.push(`/listings/review/${row.original.id}`)}
                            >
                                Open review case
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push(`/listings/${row.original.id}`)}>
                                View listing
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
            },
        ],
        [router, instantBooking]
    );

    const shown = page.items.length;
    const awaiting = page.counts.PENDING_REVIEW ?? 0;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Listings"
                subtitle={
                    shown < page.total
                        ? `${awaiting} awaiting review · showing the first ${shown} of ${page.total} — narrow the status to see the rest`
                        : `${awaiting} awaiting review · ${page.total} listings`
                }
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
                data={page.items}
                searchPlaceholder="Search listings, publisher, category"
                initialPageSize={10}
                onRowClick={(listing) => router.push(`/listings/${listing.id}`)}
                toolbar={
                    <Select
                        value={status}
                        onValueChange={(value) => onStatusChange(value as ListingLifecycle | "ALL")}
                    >
                        <SelectTrigger className="h-9 w-[220px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Status: All ({page.total})</SelectItem>
                            {LISTING_LIFECYCLE.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {/* The count comes from the server and is computed
                                        without this filter, so every option can say how
                                        many rows it would show. */}
                                    {listingStatusLabel(value)} ({page.counts[value] ?? 0})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
            />
        </div>
    );
}
