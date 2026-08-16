"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatINR } from "@/lib/format";
import { BOOKING_STATUS_META, type Booking } from "@/types";

interface BookingsTableProps {
    bookings: Booking[];
}

export function BookingsTable({ bookings }: BookingsTableProps) {
    const columns = React.useMemo<ColumnDef<Booking>[]>(
        () => [
            selectionColumn<Booking>(),
            {
                id: "booking",
                accessorKey: "id",
                header: "Booking",
                cell: ({ row }) => (
                    <span className="font-medium text-foreground">{row.original.id}</span>
                ),
            },
            {
                id: "site",
                accessorKey: "listing",
                header: "Site",
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.listing} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.listing}</p>
                            <p className="text-xs text-muted-foreground">{row.original.city}</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "advertiser",
                accessorKey: "advertiser",
                header: "Advertiser",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.advertiser}</span>
                ),
            },
            {
                id: "value",
                accessorKey: "value",
                header: ({ column }) => <SortableHeader column={column}>Value</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium">{formatINR(row.original.value)}</span>
                ),
            },
            {
                id: "flight",
                accessorKey: "startDate",
                header: ({ column }) => <SortableHeader column={column}>Flight</SortableHeader>,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {formatDate(row.original.startDate)} to {formatDate(row.original.endDate)}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={BOOKING_STATUS_META[row.original.status]} />,
            },
        ],
        []
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Bookings"
                subtitle="Every confirmed flight across the marketplace"
                actions={
                    <>
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/bookings/calendar">
                                <CalendarDays className="mr-1.5 size-4" />
                                Calendar view
                            </Link>
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Bookings exported as CSV")}
                        >
                            Export CSV
                        </Button>
                    </>
                }
            />
            <DataTable
                columns={columns}
                data={bookings}
                searchPlaceholder="Search bookings, site, advertiser"
                initialPageSize={10}
            />
        </div>
    );
}
