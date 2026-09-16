"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, Compass, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime, formatINR, formatNumber } from "@/lib/format";
import {
    ORDER_SORTS,
    ORDER_SORT_LABEL,
    ORDER_STATUS_WIRE,
    type OrderSort,
    type OrderStatusWire,
    type OrdersPage,
} from "@/services/orders";
import { ORDER_STATUS_META, type Order } from "@/types";

interface BookingsTableProps {
    page: OrdersPage;
    q: string;
    onQChange: (q: string) => void;
    status: OrderStatusWire | "ALL";
    onStatusChange: (status: OrderStatusWire | "ALL") => void;
    sort: OrderSort;
    onSortChange: (sort: OrderSort) => void;
    pageNumber: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    /** Whether the rows came from the API; the caption says when they did not. */
    live: boolean;
}

/** "1 May to 31 May 2026", or a dash for a booking with no flight yet. */
export function flightLabel(order: Pick<Order, "startDate" | "endDate">): string {
    if (order.startDate && order.endDate) return `${formatDate(order.startDate)} to ${formatDate(order.endDate)}`;
    if (order.startDate) return `From ${formatDate(order.startDate)}`;
    if (order.endDate) return `Until ${formatDate(order.endDate)}`;
    return "—";
}

/**
 * The bookings board, live — the DR 10 list surface (search, status chips,
 * sort, paging) over `GET /orders`.
 *
 * A booking is an order: an advertiser's campaign occupying a listing for a
 * flight. The table draws the columns the order carries — the site, the
 * campaign, the agent, the value, the flight, the install slot and the
 * fourteen-state status — and drops the two the seeded table had that
 * nothing sends: the ADVERTISER (an order points at the user who placed it,
 * never at an advertiser account, and the admin list joins neither) and the
 * PUBLISHER (not on the wire). "Export CSV" is gone too: it only toasted.
 *
 * Every facet is the server's, so the chips count the whole result and the
 * pager walks it; the table's own search and pager are off.
 */
export function BookingsTable({
    page,
    q,
    onQChange,
    status,
    onStatusChange,
    sort,
    onSortChange,
    pageNumber,
    onPageChange,
    pageSize,
    live,
}: BookingsTableProps) {
    const router = useRouter();

    const columns = React.useMemo<ColumnDef<Order>[]>(
        () => [
            {
                id: "booking",
                accessorKey: "id",
                header: "Booking",
                cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.id}</span>,
            },
            {
                id: "site",
                accessorKey: "listing",
                header: "Site",
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.listing} size="sm" />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{row.original.listing}</p>
                            <p className="text-xs text-muted-foreground">{row.original.city ?? "—"}</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "campaign",
                accessorFn: (order) => order.campaignName ?? "",
                header: "Campaign",
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.campaignName ?? "—"}</span>,
            },
            {
                id: "agent",
                accessorFn: (order) => order.agent ?? "",
                header: "Agent",
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.agent ?? "Unassigned"}</span>,
            },
            {
                id: "value",
                accessorFn: (order) => order.budget ?? 0,
                header: "Value",
                cell: ({ row }) => (
                    <span className="font-medium tabular-nums">
                        {/* `budget` is the one Float money column left on the API,
                            so the number formatter is the right one here. Absent
                            is not zero. */}
                        {row.original.budget === null ? "—" : formatINR(row.original.budget)}
                    </span>
                ),
            },
            {
                id: "flight",
                accessorFn: (order) => order.startDate ?? "",
                header: "Flight",
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{flightLabel(row.original)}</span>,
            },
            {
                id: "slot",
                accessorFn: (order) => order.slotTime ?? "",
                header: "Install slot",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {row.original.slotTime ? formatDateTime(row.original.slotTime) : "—"}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={ORDER_STATUS_META[row.original.status]} />,
            },
        ],
        [],
    );

    /* The chip counts come from the server, computed without the status
       facet, so "All" is their sum rather than `total` — which under a status
       chip is only that status's size. */
    const everything = ORDER_STATUS_WIRE.reduce((sum, key) => sum + (page.counts[key] ?? 0), 0);
    const chips: FilterChip<OrderStatusWire | "ALL">[] = [
        { value: "ALL", label: "All", count: everything },
        ...ORDER_STATUS_WIRE.filter((value) => (page.counts[value] ?? 0) > 0 || value === status).map((value) => ({
            value,
            label: ORDER_STATUS_META[value].label,
            count: page.counts[value] ?? 0,
        })),
    ];

    const from = page.total === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
    const to = Math.min(pageNumber * pageSize, page.total);
    const lastPage = Math.max(1, Math.ceil(page.total / pageSize));

    return (
        <div className="space-y-5">
            <PageHeader
                title="Bookings"
                subtitle={
                    page.total === 0
                        ? "Every order across the marketplace"
                        : `${formatNumber(page.total)} ${page.total === 1 ? "booking" : "bookings"}${status === "ALL" ? "" : ` ${ORDER_STATUS_META[status].label.toLowerCase()}`}${q.trim() ? ` matching “${q.trim()}”` : ""}`
                }
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/bookings/calendar">
                            <CalendarDays className="mr-1.5 size-4" />
                            Calendar view
                        </Link>
                    </Button>
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder="Search campaign, site, city or agent"
                        aria-label="Search bookings"
                        className="h-9 w-[280px] bg-card pl-8"
                    />
                </div>
                <Select value={sort} onValueChange={(value) => onSortChange(value as OrderSort)}>
                    <SelectTrigger className="h-9 w-[240px] bg-card" aria-label="Sort">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {ORDER_SORTS.map((value) => (
                            <SelectItem key={value} value={value}>
                                {ORDER_SORT_LABEL[value]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* The counts come from the server and are computed without this
                filter, so every chip can say how many it would show and the
                row never collapses to the one chip in force. Statuses with
                nothing behind them are not drawn — fourteen chips is a
                spreadsheet. */}
            <FilterChips chips={chips} value={status} onChange={onStatusChange} />

            <DataTable
                columns={columns}
                data={page.items}
                showColumnToggle={false}
                showPagination={false}
                onRowClick={(order) => router.push(`/orders/${order.id}`)}
                emptyState={
                    <EmptyState
                        icon={Compass}
                        title={q.trim() || status !== "ALL" ? "No bookings match" : "No bookings yet"}
                        description={
                            q.trim() || status !== "ALL"
                                ? "Clear the search or pick another status to see the rest."
                                : "A booking is an advertiser's order on a listing. The first one appears here the moment it is placed."
                        }
                    />
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                    {from}-{to} of {formatNumber(page.total)}
                    {!live && " · seeded rows; connect the API for real bookings"}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card"
                        onClick={() => onPageChange(pageNumber - 1)}
                        disabled={pageNumber <= 1}
                    >
                        Previous
                    </Button>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">
                        {pageNumber}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card"
                        onClick={() => onPageChange(pageNumber + 1)}
                        disabled={pageNumber >= lastPage}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
