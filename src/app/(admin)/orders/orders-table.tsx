"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { PauseCircle, ReceiptText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { StatusBadge } from "@/components/adx/status-badge";
import { PlacedByCell, placedByView } from "@/components/adx/placed-by";
import { ServerPager } from "@/components/adx/server-pager";
import { flightLabel, formatDateTime, formatINR, formatNumber } from "@/lib/format";
import { NO_ACT_PERMISSION, ORDER_SCREENING_PERMISSION, REVIEW_STATE_META, isHeld } from "@/services/order-screening";
import {
    ORDER_SORTS,
    ORDER_SORT_LABEL,
    ORDER_STATUS_WIRE,
    orderLabel,
    type OrderSort,
    type OrderStatusWire,
    type OrdersPage,
} from "@/services/orders";
import { ORDER_STATUS_META, type Order } from "@/types";
import { ReviewActionDialog, type ReviewRequest } from "./review-action-dialog";

interface OrdersTableProps {
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
    /** Reads the page again — after a bulk hold. */
    onChanged?: () => void;
}


/*
 * The columns the orders list and the review queue share (order screening,
 * 2 Oct 2026: "Order · placed (as on the list), Placed by, Site, Value") —
 * one definition each, so the two tables cannot drift apart.
 */

/** The booking id on one line and when it was placed under it. `sortable` draws the server-sorted header the list has. */
export function placedOnColumn<T extends Order>(sortable = true): ColumnDef<T> {
    return {
        /* 2 Oct 2026 ("too cramped"): the booking id on one line and when it was placed under it — one column, sorted by the date. */
        id: "placedOn",
        accessorFn: (order) => order.createdAt,
        header: sortable ? ({ column }) => <SortableHeader column={column}>Order · placed</SortableHeader> : "Order · placed",
        cell: ({ row }) => (
            <div className="whitespace-nowrap">
                {/* BK-1: the booking id (BKG-DDMM-YYNN) once minted; the short id until the backfill runs. */}
                <p className="font-mono text-xs text-foreground" title={row.original.id} data-testid="order-label">
                    {orderLabel(row.original)}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="order-placed-on">
                    {formatDateTime(row.original.createdAt)}
                </p>
            </div>
        ),
    };
}

export function placedByColumn<T extends Order>(): ColumnDef<T> {
    return {
        id: "placedBy",
        accessorFn: (order) => placedByView(order.placedBy)?.title ?? "",
        header: "Placed by",
        /* PB-1: the shared party cell — the campaigns list draws its advertiser through the same one. */
        cell: ({ row }) => <PlacedByCell placedBy={row.original.placedBy} testId="order-placed-by" />,
    };
}

export function siteColumn<T extends Order>(): ColumnDef<T> {
    return {
        id: "site",
        accessorFn: (order) => order.listing,
        header: "Site",
        cell: ({ row }) => (
            <div className="flex items-center gap-2.5">
                <InitialsAvatar name={row.original.listing} size="sm" />
                <div className="min-w-0 max-w-[240px]">
                    <p className="truncate font-medium text-foreground" title={row.original.listing}>
                        {row.original.listing}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.original.city ?? "—"}</p>
                </div>
            </div>
        ),
    };
}

export function valueColumn<T extends Order>(): ColumnDef<T> {
    return {
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
    };
}

/** The order's status, and a "Held" pill beside it while the order is paused for review. */
export function OrderStatusCell({ order }: { order: Pick<Order, "status" | "screening"> }) {
    return (
        <div className="flex items-center gap-1.5">
            <StatusBadge status={ORDER_STATUS_META[order.status]} />
            {isHeld(order) && (
                <span data-testid="order-held-pill" title={order.screening?.holdReason ?? "Paused for review"}>
                    <StatusBadge status={REVIEW_STATE_META.HELD} />
                </span>
            )}
        </div>
    );
}


/** The "Placed on" header is the server's sort: newest or oldest first. Any other sort leaves it unmarked. */
function sortingOf(sort: OrderSort): SortingState {
    if (sort === "NEWEST") return [{ id: "placedOn", desc: true }];
    if (sort === "OLDEST") return [{ id: "placedOn", desc: false }];
    return [];
}

/** Neither finished nor abandoned — the ones somebody is still waiting on. */
const OPEN: readonly Order["status"][] = [
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

/**
 * OM-1: the orders list — the DR 10 list surface (search, status chips,
 * sort, paging) over `GET /orders`.
 *
 * This was the Bookings board. Bookings and Orders read the same endpoint
 * and a booking row opened `/orders/:id`, so the two were one list drawn
 * twice; this is the copy with the server-side facets, wearing the Orders
 * name, with the campaign linked now that the row carries its id. The old
 * Orders table, a client-side pager over a capped page with a row menu whose
 * only item was "Open order", is gone.
 *
 * Every facet is the server's, so the chips count the whole result and the
 * pager walks it; the table's own search and pager are off.
 */
export function OrdersTable({
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
    onChanged,
}: OrdersTableProps) {
    const router = useRouter();
    /* Order screening: "Hold for review" over a selection, behind the fraud desk's edit permission. */
    const mayHold = useRosterPermission(ORDER_SCREENING_PERMISSION.act);
    const [review, setReview] = React.useState<(ReviewRequest & { keep: (rows: Order[]) => void }) | null>(null);

    const columns = React.useMemo<ColumnDef<Order>[]>(
        () => [
            placedOnColumn<Order>(),
            placedByColumn<Order>(),
            siteColumn<Order>(),
            {
                id: "campaign",
                accessorFn: (order) => order.campaignName ?? "",
                header: "Campaign",
                cell: ({ row }) =>
                    row.original.campaignId ? (
                        <Link
                            href={`/campaigns/${row.original.campaignId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="block max-w-[180px] truncate text-primary underline-offset-4 hover:underline"
                            title={row.original.campaignName ?? undefined}
                            data-testid="order-campaign-link"
                        >
                            {row.original.campaignName ?? row.original.campaignId}
                        </Link>
                    ) : (
                        <span className="block max-w-[180px] truncate text-muted-foreground" title={row.original.campaignName ?? undefined}>
                            {row.original.campaignName ?? "—"}
                        </span>
                    ),
            },
            {
                id: "agent",
                accessorFn: (order) => order.agent ?? "",
                header: "Agent",
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.agent ?? "Unassigned"}</span>,
            },
            valueColumn<Order>(),
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
                cell: ({ row }) => <OrderStatusCell order={row.original} />,
            },
        ],
        [],
    );

    /* The chip counts come from the server, computed without the status
       facet, so "All" is their sum rather than `total` — which under a status
       chip is only that status's size. */
    const everything = ORDER_STATUS_WIRE.reduce((sum, key) => sum + (page.counts[key] ?? 0), 0);
    const open = OPEN.reduce((sum, key) => sum + (page.counts[key] ?? 0), 0);
    const chips: FilterChip<OrderStatusWire | "ALL">[] = [
        { value: "ALL", label: "All", count: everything },
        ...ORDER_STATUS_WIRE.filter((value) => (page.counts[value] ?? 0) > 0 || value === status).map((value) => ({
            value,
            label: ORDER_STATUS_META[value].label,
            count: page.counts[value] ?? 0,
        })),
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Orders"
                subtitle={
                    everything === 0
                        ? "Every order across the marketplace"
                        : `${formatNumber(open)} still open · ${formatNumber(everything)} ${everything === 1 ? "order" : "orders"}${
                              status === "ALL" ? "" : `, showing ${ORDER_STATUS_META[status].label.toLowerCase()}`
                          }${q.trim() ? ` matching “${q.trim()}”` : ""}`
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder="Search advertiser, campaign, site or agent"
                        aria-label="Search orders"
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
                /* Like every other table: the Columns menu, with the install slot (mostly empty on the list) off until asked for. */
                initialColumnVisibility={{ slot: false }}
                showPagination={false}
                /* "Placed on" is sorted by the server: a click asks for newest or oldest first and refetches. */
                sorting={sortingOf(sort)}
                onSortingChange={(next) => {
                    const placed = next.find((entry) => entry.id === "placedOn");
                    if (placed) onSortChange(placed.desc ? "NEWEST" : "OLDEST");
                }}
                onRowClick={(order) => router.push(`/orders/${order.id}`)}
                /* Order screening: the shared selection and bulk bar — a hold for review over the ticked orders. Keyed by id so the failures stay ticked over the reload. */
                getRowId={(order) => order.id}
                bulkActions={(selected, _clear, keep) => (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card"
                        disabled={!live || !mayHold}
                        title={!live ? "Connect the console to the ADX backend first." : !mayHold ? NO_ACT_PERMISSION : undefined}
                        onClick={() => setReview({ action: "HOLD", rows: selected, keep })}
                        data-testid="bulk-hold"
                    >
                        <PauseCircle className="mr-1.5 size-3.5" aria-hidden />
                        Hold for review
                    </Button>
                )}
                emptyState={
                    <EmptyState
                        icon={ReceiptText}
                        title={q.trim() || status !== "ALL" ? "No orders match" : "No orders yet"}
                        description={
                            q.trim() || status !== "ALL"
                                ? "Clear the search or pick another status to see the rest."
                                : "An order is an advertiser's booking on a listing. The first one appears here the moment it is placed."
                        }
                    />
                }
            />

            <ServerPager
                total={page.total}
                pageNumber={pageNumber}
                pageSize={pageSize}
                onPageChange={onPageChange}
                note={live ? undefined : " · seeded rows; connect the API for real orders"}
            />

            <ReviewActionDialog
                request={review}
                onOpenChange={(open) => !open && setReview(null)}
                onSettled={(outcome) => {
                    // The held orders get their pill on the reload; the failed ones stay ticked for another go.
                    review?.keep(outcome.failed.map((failure) => failure.row));
                    onChanged?.();
                }}
            />
        </div>
    );
}
