"use client";

import * as React from "react";
import Link from "next/link";
import { PackageOpen } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { LoadMore } from "@/components/adx/load-more";
import { formatDate } from "@/lib/format";
import {
    ATTEMPT_ORIGIN_META,
    ATTEMPT_STATUS_META,
    type ListingAttempt,
} from "@/types";

/**
 * Progress across a batch. Bulk imports run to hundreds of spots, each clearing
 * its own document and verification gate, so the batch reads as a ratio rather
 * than a status.
 */
function ProgressBar({ attempt }: { attempt: ListingAttempt }) {
    const { listingCount, documentsCleared, live } = attempt.progress;
    const total = Math.max(1, listingCount);
    return (
        <div className="min-w-[150px]">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div className="bg-success" style={{ width: `${(live / total) * 100}%` }} />
                <div
                    className="bg-info/70"
                    style={{ width: `${(Math.max(0, documentsCleared - live) / total) * 100}%` }}
                />
            </div>
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {live} live · {documentsCleared} documented · {listingCount} total
            </p>
        </div>
    );
}

interface Props {
    attempts: ListingAttempt[];
    /** The server has a page after the last one read. */
    hasMore?: boolean;
    loadingMore?: boolean;
    moreError?: string | null;
    onLoadMore?: () => void;
}

export function AttemptsTable({ attempts, hasMore = false, loadingMore = false, moreError = null, onLoadMore }: Props) {
    const columns = React.useMemo<ColumnDef<ListingAttempt>[]>(
        () => [
            {
                accessorKey: "id",
                header: ({ column }) => <SortableHeader column={column}>Attempt</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <Link
                            href={`/listings/attempts/${row.original.id}`}
                            className="font-medium text-foreground hover:underline"
                        >
                            {row.original.id}
                        </Link>
                        {row.original.sourceFilename && (
                            <p className="text-xs text-muted-foreground">
                                {row.original.sourceFilename}
                            </p>
                        )}
                    </div>
                ),
            },
            {
                accessorKey: "publisherName",
                header: "Publisher",
                cell: ({ row }) =>
                    row.original.publisherName ?? (
                        <span className="italic text-muted-foreground">Unowned · seeded</span>
                    ),
            },
            {
                accessorKey: "origin",
                header: "Origin",
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {ATTEMPT_ORIGIN_META[row.original.origin]}
                    </span>
                ),
            },
            {
                id: "progress",
                header: "Progress",
                cell: ({ row }) => <ProgressBar attempt={row.original} />,
            },
            {
                accessorKey: "createdAt",
                header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>,
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {formatDate(row.original.createdAt)}
                    </span>
                ),
            },
            {
                accessorKey: "status",
                header: "Agreement",
                cell: ({ row }) => <StatusBadge status={ATTEMPT_STATUS_META[row.original.status]} />,
            },
        ],
        []
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Listing attempts"
                subtitle="Every batch of inventory and the agreement that covers it. One agreement per attempt, however many spots it holds."
            />
            <DataTable
                columns={columns}
                data={attempts}
                searchPlaceholder="Search attempts, publisher, file"
                emptyState={
                    <EmptyState
                        icon={PackageOpen}
                        title="No attempts yet"
                        description="Importing a partner's spreadsheet creates one."
                    />
                }
            />
            {/* The read is one page of the server's largest size; the next
                page is a click away rather than quietly cut off. */}
            <LoadMore
                shown={attempts.length}
                noun="attempt"
                hasMore={hasMore}
                loading={loadingMore}
                error={moreError}
                onLoadMore={() => onLoadMore?.()}
            />
        </div>
    );
}
