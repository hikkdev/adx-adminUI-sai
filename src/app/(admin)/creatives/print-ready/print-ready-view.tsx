"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    PRINT_JOB_STATUS_LABEL,
    PRINT_READINESS_META,
    fileSizeLabel,
    printReadinessOf,
    type CreativeReviewRow,
    type PrintReadiness,
} from "@/services/moderation";

export type ReadyFilter = "ALL" | PrintReadiness["state"];

/**
 * CR-1: approved artwork and where it stands on the way to a hoarding.
 *
 * The owner's words: review it and "push it to print partners with all specs
 * for printing". The specs are the spot's — its size in feet, its category —
 * and the artwork's own pixels, and the push is the print job on the spot's
 * order. This tab is the join: every approved creative, its spot, and whether
 * a shop has it yet. A row with no job is the one to act on, from the order.
 */
export function PrintReadyView({
    rows,
    filter,
    onFilterChange,
}: {
    rows: CreativeReviewRow[];
    filter: ReadyFilter;
    onFilterChange: (filter: ReadyFilter) => void;
}) {
    const router = useRouter();
    const readiness = new Map(rows.map((row) => [row.id, printReadinessOf(row)]));
    const count = (state: PrintReadiness["state"]) => rows.filter((row) => readiness.get(row.id)?.state === state).length;
    const shown = filter === "ALL" ? rows : rows.filter((row) => readiness.get(row.id)?.state === filter);

    const columns: ColumnDef<CreativeReviewRow>[] = [
        {
            id: "campaign",
            accessorFn: (row) => row.campaign.name,
            header: ({ column }) => <SortableHeader column={column}>Campaign</SortableHeader>,
            cell: ({ row }) => (
                <div className="min-w-0 max-w-[16rem]">
                    <p className="truncate font-medium text-foreground">{row.original.campaign.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {row.original.campaign.reference} · {row.original.campaign.advertiser.companyName ?? row.original.campaign.advertiser.name}
                    </p>
                </div>
            ),
        },
        {
            id: "spot",
            accessorFn: (row) => row.spot?.listing.title ?? "",
            header: ({ column }) => <SortableHeader column={column}>Spot</SortableHeader>,
            cell: ({ row }) => {
                const listing = row.original.spot?.listing;
                if (!listing) return <span className="text-sm text-muted-foreground">Whole campaign</span>;
                return (
                    <div className="min-w-0 max-w-[14rem]">
                        <p className="truncate text-sm text-foreground">{listing.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {[listing.city, listing.widthFt && listing.heightFt ? `${listing.widthFt} × ${listing.heightFt} ft` : null, listing.category]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                );
            },
        },
        {
            id: "artwork",
            header: "Artwork",
            cell: ({ row }) => (
                <div className="text-xs text-muted-foreground tabular-nums">
                    <p className="text-sm text-foreground">
                        {row.original.widthPx && row.original.heightPx ? `${row.original.widthPx} × ${row.original.heightPx} px` : "Size unknown"}
                    </p>
                    <p>
                        {row.original.fileName ?? "—"}
                        {row.original.fileSize ? ` · ${fileSizeLabel(row.original.fileSize)}` : ""}
                    </p>
                </div>
            ),
        },
        {
            id: "approved",
            accessorFn: (row) => row.reviewedAt ?? "",
            header: ({ column }) => <SortableHeader column={column}>Approved</SortableHeader>,
            cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.reviewedAt ? formatDate(row.original.reviewedAt) : "—"}</span>,
        },
        {
            id: "print",
            header: "Print",
            cell: ({ row }) => {
                const state = readiness.get(row.original.id)!;
                return (
                    <div className="flex flex-col gap-1" data-testid={`ready-${row.original.id}`}>
                        <StatusBadge status={PRINT_READINESS_META[state.state]} />
                        {state.state === "AT_SHOP" && (
                            <span className="text-xs text-muted-foreground">
                                {state.partner} · {PRINT_JOB_STATUS_LABEL[state.jobStatus]}
                            </span>
                        )}
                        {(state.state === "AT_SHOP" || state.state === "NO_JOB") && (
                            <Link
                                href={`/orders/${state.orderId}`}
                                onClick={(event) => event.stopPropagation()}
                                className="text-xs text-primary underline-offset-4 hover:underline"
                            >
                                {state.state === "NO_JOB" ? "Open the order to print it" : "Order"}
                            </Link>
                        )}
                    </div>
                );
            },
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Print-ready"
                subtitle={
                    rows.length === 0
                        ? "No approved artwork yet."
                        : `${rows.length} approved artwork${rows.length === 1 ? "" : "s"}${count("NO_JOB") ? `, ${count("NO_JOB")} on a booked spot with no print job` : ""}.`
                }
            />

            <FilterChips<ReadyFilter>
                value={filter}
                onChange={onFilterChange}
                chips={[
                    { value: "ALL", label: "All", count: rows.length },
                    { value: "NO_JOB", label: "No print job yet", count: count("NO_JOB") },
                    { value: "AT_SHOP", label: "With a shop", count: count("AT_SHOP") },
                    { value: "NOT_BOOKED", label: "Spot not booked", count: count("NOT_BOOKED") },
                    { value: "CAMPAIGN_WIDE", label: "Whole campaign", count: count("CAMPAIGN_WIDE") },
                ]}
            />

            <DataTable
                columns={columns}
                data={shown}
                initialPageSize={25}
                onRowClick={(row) => router.push(`/creatives/${row.id}`)}
                emptyState={
                    <Card className="rounded-lg border-border shadow-none">
                        <EmptyState
                            icon={Printer}
                            title={filter === "ALL" ? "Nothing approved yet" : "Nothing here"}
                            description="Artwork approved on the Review tab appears here with its spot's specs and whether a print shop has it."
                        />
                    </Card>
                }
            />
        </div>
    );
}
