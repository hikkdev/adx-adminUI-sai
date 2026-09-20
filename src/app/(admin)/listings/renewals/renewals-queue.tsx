"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { ApiError } from "@/lib/api-client";
import { supplyService } from "@/services/supply";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { KpiCard } from "@/components/adx/kpi-card";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { RIGHTS_BASIS_LABEL, RIGHTS_STATE_META, type RightsQueueRow, type RightsState } from "@/types";

/**
 * QR-24: the renewals desk. Every spot held on a lease, a licence or a permit
 * whose term ends within sixty days or has ended, soonest first. A lapsed
 * spot is off the shelf until the publisher's renewed document is approved
 * on the review desk — that approval, with a later end date, is what
 * extends the term; this page only watches and nudges.
 */

const FILTERS: (RightsState | "all")[] = ["all", "LAPSED", "ENDING"];

const columns: ColumnDef<RightsQueueRow>[] = [
    {
        accessorKey: "title",
        header: ({ column }) => <SortableHeader column={column}>Listing</SortableHeader>,
        cell: ({ row }) => (
            <Link href={`/listings/${row.original.id}`} className="font-medium text-foreground hover:underline">
                {row.original.title}
            </Link>
        ),
    },
    {
        accessorKey: "publisherName",
        header: "Publisher",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.publisherName ?? "Unclaimed"}</span>,
    },
    {
        accessorKey: "rightsBasis",
        header: "Held on",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{RIGHTS_BASIS_LABEL[row.original.rightsBasis]}</span>,
    },
    {
        accessorKey: "rightsValidUntil",
        header: ({ column }) => <SortableHeader column={column}>Runs out</SortableHeader>,
        cell: ({ row }) => {
            const days = row.original.daysLeft;
            return (
                <span className={cn("text-xs tabular-nums", days !== null && days <= 0 ? "font-medium text-danger" : "text-muted-foreground")}>
                    {row.original.rightsValidUntil ? formatDate(row.original.rightsValidUntil) : "—"}
                    {days === null ? "" : days <= 0 ? ` · ${Math.abs(days)}d ago` : ` · in ${days}d`}
                </span>
            );
        },
    },
    {
        accessorKey: "state",
        header: "State",
        cell: ({ row }) => <StatusBadge status={RIGHTS_STATE_META[row.original.state]} />,
    },
    {
        id: "shelf",
        header: "Shelf",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.availableNow ? "On" : "Off"}</span>,
    },
    {
        id: "review",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                <Link href={`/listings/review/${row.original.id}`}>Documents</Link>
            </Button>
        ),
    },
];

export function RenewalsQueue({ rows, onChanged }: { rows: RightsQueueRow[]; onChanged?: () => void }) {
    const [filter, setFilter] = React.useState<RightsState | "all">("all");
    const [sweeping, setSweeping] = React.useState(false);

    const runSweep = async () => {
        setSweeping(true);
        try {
            const result = await supplyService.runRightsSweep();
            toast.success(
                result.lapsed === 0 && result.reminded === 0
                    ? "Nothing to do — every term is either current or already handled."
                    : `${result.reminded} reminded, ${result.lapsed} lapsed.`
            );
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not run the renewals sweep.");
        } finally {
            setSweeping(false);
        }
    };

    const lapsed = rows.filter((row) => row.state === "LAPSED");
    const ending = rows.filter((row) => row.state === "ENDING");
    const visible = filter === "all" ? rows : rows.filter((row) => row.state === filter);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Renewals due"
                subtitle="Spots held on a lease, a licence or a permit whose term ends within sixty days or has ended. A lapsed spot takes no new booking until the renewed document is approved on the review desk."
                actions={
                    <Button size="sm" variant="outline" onClick={runSweep} disabled={sweeping} data-testid="renewals-sweep">
                        {sweeping ? "Running…" : "Run the renewals sweep"}
                    </Button>
                }
            />

            <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard stat={{ id: "lapsed", label: "Lapsed", value: String(lapsed.length), hint: "off the shelf", deltaTone: "negative" }} />
                <KpiCard stat={{ id: "ending", label: "Ending within 30 days", value: String(ending.length), hint: "publisher reminded" }} />
                <KpiCard stat={{ id: "later", label: "Ending within 60 days", value: String(rows.length - lapsed.length - ending.length), hint: "no reminder yet" }} />
            </div>

            <div>
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    {FILTERS.map((option) => (
                        <Button
                            key={option}
                            size="sm"
                            variant={filter === option ? "default" : "outline"}
                            className="h-7 px-2 text-xs"
                            onClick={() => setFilter(option)}
                            data-testid={`renewals-filter-${option.toLowerCase()}`}
                        >
                            {option === "all" ? `All (${rows.length})` : `${RIGHTS_STATE_META[option].label} (${rows.filter((row) => row.state === option).length})`}
                        </Button>
                    ))}
                </div>
                {visible.length === 0 ? (
                    <EmptyState icon={CalendarClock} title="Nothing due" description="No lease, licence or permit runs out in the next sixty days." />
                ) : (
                    <DataTable columns={columns} data={visible} />
                )}
            </div>
        </div>
    );
}
