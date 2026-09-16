"use client";

import * as React from "react";
import Link from "next/link";
import { FileCheck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { LoadMore } from "@/components/adx/load-more";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { LISTING_CLAIM_STATUSES, LISTING_CLAIM_STATUS_META, type ListingClaim, type ListingClaimStatus } from "@/services/supply";
import { ClaimDecideDialog } from "./claim-decide-dialog";

/**
 * The claims desk — Q-C item 3. A publisher asserting a scraped listing is
 * theirs; two can claim one spot. The row is the record the route sends —
 * listing and claimant by id, linked to their pages, because the route
 * joins neither name and this desk does not invent one.
 */

interface Props {
    claims: ListingClaim[];
    /** The chip in force — the server's `?status=`; null is every state. */
    status: ListingClaimStatus | null;
    onStatusChange: (status: ListingClaimStatus | null) => void;
    hasMore?: boolean;
    loadingMore?: boolean;
    moreError?: string | null;
    onLoadMore?: () => void;
    /** Refetches after a decision changes what the desk should show. */
    onChanged?: () => void;
}

const CHIPS: (ListingClaimStatus | null)[] = ["PENDING", ...LISTING_CLAIM_STATUSES.filter((value) => value !== "PENDING"), null];

const columns = (onDecide: (claim: ListingClaim) => void): ColumnDef<ListingClaim>[] => [
    {
        accessorKey: "listingId",
        header: "Listing",
        cell: ({ row }) => (
            <Link href={`/listings/${row.original.listingId}`} className="font-mono text-xs text-foreground hover:underline">
                {row.original.listingId}
            </Link>
        ),
    },
    {
        accessorKey: "claimantPublisherId",
        header: "Claimant",
        cell: ({ row }) => (
            <Link href={`/publishers/${row.original.claimantPublisherId}`} className="font-mono text-xs text-foreground hover:underline">
                {row.original.claimantPublisherId}
            </Link>
        ),
    },
    {
        accessorKey: "evidenceNote",
        header: "Evidence",
        cell: ({ row }) => (
            <span className="line-clamp-2 max-w-[320px] text-xs text-muted-foreground" title={row.original.evidenceNote ?? undefined}>
                {row.original.evidenceNote ?? "—"}
            </span>
        ),
    },
    {
        accessorKey: "createdAt",
        header: ({ column }) => <SortableHeader column={column}>Filed</SortableHeader>,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={LISTING_CLAIM_STATUS_META[row.original.status]} />,
    },
    {
        id: "decision",
        header: "Decision",
        cell: ({ row }) =>
            row.original.status === "PENDING" ? (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onDecide(row.original)}>
                    Decide
                </Button>
            ) : (
                <span className="text-xs text-muted-foreground" title={row.original.decisionNote ?? undefined}>
                    {row.original.decidedAt ? formatDateTime(row.original.decidedAt) : "—"}
                    {row.original.decisionNote ? ` · ${row.original.decisionNote}` : ""}
                </span>
            ),
    },
];

export function ClaimsView({ claims, status, onStatusChange, hasMore = false, loadingMore = false, moreError = null, onLoadMore, onChanged }: Props) {
    const [deciding, setDeciding] = React.useState<ListingClaim | null>(null);
    const cols = React.useMemo(() => columns(setDeciding), []);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Listing claims"
                subtitle="A publisher asserting a scraped listing is theirs. Approving hands the spot over under a fresh attempt; it goes live once they accept the listing agreement."
            />

            <div>
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    {CHIPS.map((value) => (
                        <button
                            key={value ?? "all"}
                            type="button"
                            onClick={() => onStatusChange(value)}
                            className={cn(
                                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                status === value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {value === null ? "All" : LISTING_CLAIM_STATUS_META[value].label}
                        </button>
                    ))}
                </div>

                <DataTable
                    columns={cols}
                    data={claims}
                    searchPlaceholder="Search by listing or claimant id"
                    showColumnToggle={false}
                    emptyState={
                        <EmptyState
                            icon={FileCheck}
                            title={status === "PENDING" ? "Nothing to decide" : "No claims"}
                            description={status === "PENDING" ? "No publisher is waiting on a claim." : "No claim is in this state."}
                        />
                    }
                />
                <LoadMore className="mt-3" shown={claims.length} noun="claim" hasMore={hasMore} loading={loadingMore} error={moreError} onLoadMore={() => onLoadMore?.()} />
            </div>

            <ClaimDecideDialog
                claim={deciding}
                onOpenChange={(open) => {
                    if (!open) setDeciding(null);
                }}
                onDecided={() => onChanged?.()}
            />
        </div>
    );
}
