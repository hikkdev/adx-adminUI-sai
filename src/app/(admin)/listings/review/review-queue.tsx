"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { compareMoney, formatDate, formatMoney } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import {
    ageLabel,
    approvalBlockers,
    CATEGORY_LABEL,
    documentsLabel,
    GATE_META,
    PRICING_UNIT_LABEL,
    sizeLabel,
    type ReviewQueueRow,
} from "@/services/listing-review";

/**
 * DR 10's listing review queue — the "Listings · 5 awaiting review" frame,
 * narrowed to the desk: everything at PENDING_REVIEW, oldest wait first, with
 * what a reviewer scans before opening a case. The status select the frame
 * draws is pointless here (every row is pending review), so the chips filter
 * on what actually decides the order of work: a price under the floor,
 * paperwork still to check, a spot that has been back before.
 *
 * Rows link into the desk's own case page rather than `/listings/[id]`, which
 * still resolves from fixtures — a live id handed to that page answers 404.
 */

interface Props {
    rows: ReviewQueueRow[];
}

type Chip = "all" | "below_floor" | "paperwork" | "resubmitted" | "ready";

const isBelowFloor = (row: ReviewQueueRow) =>
    row.gate.state === "BELOW_FLOOR" || row.gate.state === "AWAITING_APPROVAL";
const hasPaperworkOutstanding = (row: ReviewQueueRow) =>
    row.documentSummary.total === 0 ||
    row.documentSummary.pending > 0 ||
    row.documentSummary.rejected > 0;
const isReady = (row: ReviewQueueRow) => {
    const blockers = approvalBlockers(row);
    return blockers.hard.length === 0 && blockers.soft.length === 0;
};

const MATCHES: Record<Chip, (row: ReviewQueueRow) => boolean> = {
    all: () => true,
    below_floor: isBelowFloor,
    paperwork: hasPaperworkOutstanding,
    resubmitted: (row) => row.priorReason !== null,
    ready: isReady,
};

const columns = (now: number): ColumnDef<ReviewQueueRow>[] => [
    {
        id: "listing",
        accessorKey: "title",
        header: ({ column }) => <SortableHeader column={column}>Listing</SortableHeader>,
        cell: ({ row }) => {
            const size = sizeLabel(row.original);
            return (
                <div className="flex items-center gap-2.5">
                    <InitialsAvatar name={row.original.title} size="sm" />
                    <div className="min-w-0">
                        <Link
                            href={`/listings/review/${row.original.id}`}
                            className="font-medium text-foreground hover:underline"
                        >
                            {row.original.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                            {row.original.city ?? "City not given"}
                            {size ? ` · ${size}` : ""}
                            {row.original.displayId ? ` · ${row.original.displayId}` : ""}
                        </p>
                    </div>
                </div>
            );
        },
    },
    {
        id: "publisher",
        accessorFn: (row) => row.publisher?.name ?? "",
        header: "Publisher",
        cell: ({ row }) => {
            const { publisher, agent } = row.original;
            return (
                <div className="min-w-0">
                    {publisher ? (
                        <Link
                            href={`/publishers/${publisher.id}`}
                            className="text-foreground hover:underline"
                        >
                            {publisher.name}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground">Unclaimed</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                        {agent
                            ? `via ${agent.name ?? "agent"}${agent.displayId ? ` · ${agent.displayId}` : ""}`
                            : "Self-serve"}
                    </p>
                </div>
            );
        },
    },
    {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {CATEGORY_LABEL[row.original.category]}
                {row.original.subType ? ` · ${row.original.subType}` : ""}
            </span>
        ),
    },
    {
        id: "asking",
        accessorFn: (row) => row.asking.ratePerDay ?? "",
        sortingFn: (a, b) => compareMoney(a.original.asking.ratePerDay, b.original.asking.ratePerDay),
        header: ({ column }) => <SortableHeader column={column}>Asking rate</SortableHeader>,
        cell: ({ row }) => {
            const { ratePerDay, basePrice, pricingUnit } = row.original.asking;
            return (
                <div className="tabular-nums">
                    <p className="text-foreground">
                        {formatMoney(ratePerDay)}
                        <span className="text-xs text-muted-foreground"> / day</span>
                    </p>
                    {basePrice && pricingUnit !== "PER_DAY" ? (
                        <p className="text-xs text-muted-foreground">
                            {formatMoney(basePrice)} {PRICING_UNIT_LABEL[pricingUnit]}
                        </p>
                    ) : null}
                </div>
            );
        },
    },
    {
        id: "gate",
        accessorFn: (row) => row.gate.state,
        header: "Rate-card floor",
        cell: ({ row }) => {
            const { gate } = row.original;
            return (
                <div className="space-y-1">
                    <StatusBadge status={GATE_META[gate.state]} />
                    {gate.state === "OK" || gate.state === "BELOW_FLOOR" ? (
                        <p className="text-xs tabular-nums text-muted-foreground">
                            floor {formatMoney(gate.floor)}
                        </p>
                    ) : null}
                </div>
            );
        },
    },
    {
        id: "documents",
        accessorFn: (row) => row.documentSummary.verified,
        header: "Documents",
        cell: ({ row }) => {
            const summary = row.original.documentSummary;
            const outstanding = hasPaperworkOutstanding(row.original);
            return (
                <span
                    className={cn(
                        "text-xs",
                        outstanding ? "font-medium text-warning" : "text-muted-foreground"
                    )}
                >
                    {documentsLabel(summary)}
                </span>
            );
        },
    },
    {
        accessorKey: "photoCount",
        header: "Photos",
        cell: ({ row }) => (
            <span
                className={cn(
                    "text-xs tabular-nums",
                    row.original.photoCount === 0 ? "font-medium text-warning" : "text-muted-foreground"
                )}
            >
                {row.original.photoCount === 0 ? "None" : row.original.photoCount}
            </span>
        ),
    },
    {
        accessorKey: "submittedAt",
        header: ({ column }) => <SortableHeader column={column}>Submitted</SortableHeader>,
        cell: ({ row }) => (
            <div className="text-xs">
                <p className="text-foreground">
                    {row.original.submittedAt ? formatDate(row.original.submittedAt) : "Undated"}
                </p>
                <p className="tabular-nums text-muted-foreground">
                    {now ? `${ageLabel(row.original.submittedAt, now)} waiting` : ""}
                    {row.original.priorReason ? " · resubmitted" : ""}
                </p>
            </div>
        ),
    },
    {
        id: "review",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
                <Link href={`/listings/review/${row.original.id}`}>Review</Link>
            </Button>
        ),
    },
];

export function ReviewQueue({ rows }: Props) {
    // Null before hydration; ages wait for the clock rather than guess.
    const now = useNow() ?? 0;
    const [chip, setChip] = React.useState<Chip>("all");
    const cols = React.useMemo(() => columns(now), [now]);

    const chips: FilterChip<Chip>[] = [
        { value: "all", label: "All", count: rows.length },
        { value: "below_floor", label: "Below floor", count: rows.filter(isBelowFloor).length },
        { value: "paperwork", label: "Paperwork outstanding", count: rows.filter(hasPaperworkOutstanding).length },
        { value: "resubmitted", label: "Resubmitted", count: rows.filter(MATCHES.resubmitted).length },
        { value: "ready", label: "Ready to approve", count: rows.filter(isReady).length },
    ];
    const visible = rows.filter(MATCHES[chip]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Listing review"
                subtitle={
                    rows.length === 0
                        ? "Nothing awaiting review."
                        : `${rows.length} awaiting review · oldest wait first`
                }
                actions={
                    <>
                        <Button size="sm" variant="outline" asChild>
                            <Link href="/listings/verification">Verification queue</Link>
                        </Button>
                        <Button size="sm" asChild>
                            <Link href="/listings/new">
                                <Plus className="size-4" aria-hidden />
                                Add listing
                            </Link>
                        </Button>
                    </>
                }
            />

            <div>
                <FilterChips chips={chips} value={chip} onChange={setChip} className="pb-3" />
                <DataTable
                    columns={cols}
                    data={visible}
                    searchPlaceholder="Search listings, publisher, category"
                    emptyState={
                        <EmptyState
                            icon={ClipboardCheck}
                            title={chip === "all" ? "Nothing waiting" : "Nothing in this set"}
                            description={
                                chip === "all"
                                    ? "Every listing a publisher has sent for review has been decided."
                                    : "Try another filter — the rest of the queue is still here."
                            }
                        />
                    }
                />
            </div>
        </div>
    );
}
