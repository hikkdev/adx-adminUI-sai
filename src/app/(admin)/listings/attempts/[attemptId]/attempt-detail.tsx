"use client";

import Link from "next/link";
import { ChevronLeft, MapPin } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { KpiCard } from "@/components/adx/kpi-card";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import {
    ATTEMPT_ORIGIN_META,
    ATTEMPT_STATUS_META,
    LISTING_LIFECYCLE_META,
    LISTING_LIFECYCLE_WAITING_ON,
    REMOVABILITY_META,
    type AttemptListing,
    type ListingAttempt,
} from "@/types";

const WAITING_LABEL = {
    publisher: "Publisher",
    adx: "ADX",
    nobody: "—",
} as const;

const spotColumns: ColumnDef<AttemptListing>[] = [
    {
        accessorKey: "title",
        header: ({ column }) => <SortableHeader column={column}>Spot</SortableHeader>,
        cell: ({ row }) => (
            <div className="min-w-0">
                <Link
                    href={`/listings/${row.original.id}`}
                    className="font-medium text-foreground hover:underline"
                >
                    {row.original.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                    {row.original.address}
                    {row.original.city ? `, ${row.original.city}` : ""}
                </p>
            </div>
        ),
    },
    {
        accessorKey: "removability",
        header: "Cadence",
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {REMOVABILITY_META[row.original.removability].label} ·{" "}
                {REMOVABILITY_META[row.original.removability].cadenceDays}d
            </span>
        ),
    },
    {
        accessorKey: "documentsClearedAt",
        header: "Documents",
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {row.original.documentsClearedAt
                    ? `Cleared ${formatDate(row.original.documentsClearedAt)}`
                    : "Outstanding"}
            </span>
        ),
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={LISTING_LIFECYCLE_META[row.original.status]} />,
    },
    {
        id: "waiting",
        header: "Waiting on",
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {WAITING_LABEL[LISTING_LIFECYCLE_WAITING_ON[row.original.status]]}
            </span>
        ),
    },
];

export function AttemptDetail({ attempt }: { attempt: ListingAttempt }) {
    const { progress } = attempt;
    const outstanding = progress.listingCount - progress.documentsCleared;

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/listings/attempts"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="size-3.5" /> Listing attempts
                </Link>
                <div className="mt-2">
                    <PageHeader
                        title={attempt.id}
                        subtitle={
                            attempt.publisherName
                                ? `${attempt.publisherName} · ${ATTEMPT_ORIGIN_META[attempt.origin]}`
                                : `Unowned, seeded · ${ATTEMPT_ORIGIN_META[attempt.origin]}`
                        }
                        actions={<StatusBadge status={ATTEMPT_STATUS_META[attempt.status]} />}
                    />
                </div>
                {attempt.note && (
                    <p className="mt-2 text-sm text-muted-foreground">{attempt.note}</p>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "spots",
                        label: "Spots in this batch",
                        value: String(progress.listingCount),
                        hint: attempt.sourceFilename ?? "one agreement covers all",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "documents",
                        label: "Documents cleared",
                        value: `${progress.documentsCleared}`,
                        hint: `${outstanding} outstanding`,
                        deltaTone: outstanding > 0 ? "negative" : "positive",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "visits",
                        label: "Site visits due",
                        value: String(progress.awaitingSiteVerification),
                        hint: "documents cleared, awaiting an agent",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "live",
                        label: "Live and earning",
                        value: String(progress.live),
                        hint: `${progress.documentsRejected} documents rejected`,
                    }}
                />
            </div>

            {attempt.status === "AWAITING_ACCEPTANCE" && (
                <Card className="rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none">
                    <p className="text-sm text-foreground">
                        Waiting on {attempt.publisherName ?? "the publisher"} to accept the listing
                        agreement.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        The agreement covers all {progress.listingCount} spots and publishes only those
                        whose documents clear, so it can be accepted before the paperwork is complete.
                    </p>
                </Card>
            )}

            <div>
                <PageHeader
                    size="section"
                    title="Spots"
                    subtitle="Each clears its own document and verification gate, independently of the rest."
                />
                <div className="mt-3">
                    <DataTable
                        columns={spotColumns}
                        data={attempt.listings}
                        searchPlaceholder="Search spots or address"
                        initialPageSize={25}
                        emptyState={
                            <EmptyState
                                icon={MapPin}
                                title="No spots yet"
                                description="Listings added to this attempt appear here."
                            />
                        }
                    />
                </div>
                {attempt.listings.length < progress.listingCount && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        Showing {attempt.listings.length} of {progress.listingCount} spots.
                    </p>
                )}
            </div>
        </div>
    );
}
