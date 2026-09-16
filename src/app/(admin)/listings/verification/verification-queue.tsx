"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { ApiError } from "@/lib/api-client";
import { supplyService } from "@/services/supply";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { KpiCard } from "@/components/adx/kpi-card";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { LoadMore } from "@/components/adx/load-more";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { VerificationReview } from "./verification-review";
import {
    REMOVABILITY_META,
    VERIFICATION_STATE_META,
    type ComplianceCase,
    type VerificationQueueRow,
    type VerificationState,
    COMPLIANCE_STATUS_META,
} from "@/types";

interface Props {
    rows: VerificationQueueRow[];
    /** The pages read so far, due-soonest first. */
    cases: ComplianceCase[];
    /** The server has a page of cases after the last one read. */
    casesHaveMore?: boolean;
    casesLoadingMore?: boolean;
    casesMoreError?: string | null;
    onLoadMoreCases?: () => void;
    /** Refetches after a mutation changes what this queue should show. */
    onChanged?: () => void;
}

const FILTERS: (VerificationState | "all")[] = ["all", "LAPSED", "RISKY"];

/** Days until (positive) or since (negative) the verification falls due. */
function daysTo(iso: string | null): number | null {
    if (!iso) return null;
    return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const queueColumns = (
    onReview: (row: VerificationQueueRow) => void
): ColumnDef<VerificationQueueRow>[] => [
    {
        accessorKey: "title",
        header: ({ column }) => <SortableHeader column={column}>Listing</SortableHeader>,
        cell: ({ row }) => (
            <Link
                href={`/listings/${row.original.listingId}`}
                className="font-medium text-foreground hover:underline"
            >
                {row.original.title}
            </Link>
        ),
    },
    {
        accessorKey: "publisherName",
        header: "Publisher",
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {row.original.publisherName ?? "Unclaimed"}
            </span>
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
        accessorKey: "verifiedAt",
        header: "Last verified",
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
                {row.original.verifiedAt ? formatDate(row.original.verifiedAt) : "Never"}
            </span>
        ),
    },
    {
        accessorKey: "verificationExpiresAt",
        header: ({ column }) => <SortableHeader column={column}>Due</SortableHeader>,
        cell: ({ row }) => {
            const days = daysTo(row.original.verificationExpiresAt);
            return (
                <span
                    className={cn(
                        "text-xs tabular-nums",
                        days !== null && days < 0
                            ? "font-medium text-danger"
                            : "text-muted-foreground"
                    )}
                >
                    {days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                </span>
            );
        },
    },
    {
        accessorKey: "state",
        header: "State",
        cell: ({ row }) => <StatusBadge status={VERIFICATION_STATE_META[row.original.state]} />,
    },
    {
        id: "review",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
            <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => onReview(row.original)}
            >
                Photos
            </Button>
        ),
    },
];

const caseColumns: ColumnDef<ComplianceCase>[] = [
    {
        accessorKey: "id",
        header: "Case",
        cell: ({ row }) => (
            <span className="font-medium text-foreground">{row.original.id}</span>
        ),
    },
    { accessorKey: "listingTitle", header: "Listing" },
    {
        accessorKey: "publisherName",
        header: "Publisher",
        cell: ({ row }) => row.original.publisherName ?? "—",
    },
    {
        accessorKey: "attemptCount",
        header: "Attempts",
        cell: ({ row }) => (
            <span className="tabular-nums">{row.original.attemptCount} of 4</span>
        ),
    },
    {
        accessorKey: "dueAt",
        header: ({ column }) => <SortableHeader column={column}>Due</SortableHeader>,
        cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">{formatDate(row.original.dueAt)}</span>
        ),
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={COMPLIANCE_STATUS_META[row.original.status]} />,
    },
];

export function VerificationQueue({
    rows,
    cases,
    casesHaveMore = false,
    casesLoadingMore = false,
    casesMoreError = null,
    onLoadMoreCases,
    onChanged,
}: Props) {
    const [filter, setFilter] = React.useState<VerificationState | "all">("all");
    const [sweeping, setSweeping] = React.useState(false);
    /* Which listing's submitted photographs are open for review, if any. */
    const [reviewing, setReviewing] = React.useState<VerificationQueueRow | null>(null);
    const columns = React.useMemo(() => queueColumns(setReviewing), []);

    /**
     * The sweep walks lapsed listings one step down the enforcement ladder. It
     * is idempotent on the backend, so a double click costs a round trip and
     * nothing else.
     */
    const runSweep = async () => {
        setSweeping(true);
        try {
            const result = await supplyService.runEnforcementSweep();
            toast.success(
                result.lapsed === 0 && result.suspended === 0
                    ? "Nothing to do — no listing has lapsed."
                    : `${result.holdsOpened} holds opened, ${result.casesOpened} cases opened, ${result.suspended} suspended.`
            );
            onChanged?.();
        } catch (cause) {
            toast.error(
                cause instanceof ApiError ? cause.message : "Could not run the enforcement sweep."
            );
        } finally {
            setSweeping(false);
        }
    };

    const lapsed = rows.filter((row) => row.state === "LAPSED");
    const risky = rows.filter((row) => row.state === "RISKY");
    const visible = filter === "all" ? rows : rows.filter((row) => row.state === filter);
    const openCases = cases.filter((c) => c.status === "OPEN" || c.status === "CONTACTED");

    return (
        <div className="space-y-6">
            <PageHeader
                title="Verification queue"
                subtitle="Listings inside their re-verification window or past it. A lapse pauses earnings, not the campaign."
                actions={
                    <Button size="sm" variant="outline" onClick={runSweep} disabled={sweeping}>
                        {sweeping ? "Running…" : "Run enforcement sweep"}
                    </Button>
                }
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "lapsed",
                        label: "Lapsed",
                        value: String(lapsed.length),
                        hint: "earnings paused",
                        deltaTone: "negative",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "risky",
                        label: "In the risk window",
                        value: String(risky.length),
                        hint: "shown to advertisers as due",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "cases",
                        label: "Compliance cases",
                        value: String(openCases.length),
                        hint: "awaiting contact",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "suspended",
                        label: "Suspended",
                        value: String(rows.filter((r) => r.status === "SUSPENDED").length),
                        hint: "past the 48-hour window",
                    }}
                />
            </div>

            <div>
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    {FILTERS.map((value) => {
                        const count =
                            value === "all" ? rows.length : rows.filter((r) => r.state === value).length;
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setFilter(value)}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                    filter === value
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {value === "all" ? "All" : VERIFICATION_STATE_META[value].label} {count}
                            </button>
                        );
                    })}
                </div>

                <DataTable
                    columns={columns}
                    data={visible}
                    searchPlaceholder="Search listings or publisher"
                    emptyState={
                        <EmptyState
                            icon={ShieldCheck}
                            title="Nothing due"
                            description="Every live listing is inside its verification window."
                        />
                    }
                />
            </div>

            <VerificationReview
                row={reviewing}
                onOpenChange={(open) => {
                    if (!open) setReviewing(null);
                }}
                onReviewed={onChanged}
            />

            <div>
                <PageHeader
                    size="section"
                    title="Compliance cases"
                    subtitle="Opened three days into a lapse. Suspension falls due 48 hours after opening."
                />
                <div className="mt-3">
                    <DataTable
                        columns={caseColumns}
                        data={cases}
                        searchPlaceholder="Search cases"
                        showColumnToggle={false}
                        emptyState={
                            <EmptyState
                                icon={ShieldCheck}
                                title="No open cases"
                                description="Cases open three days into a lapse."
                            />
                        }
                    />
                    {/* The read is one page of the server's largest size, due-soonest
                        first; the next page is a click away rather than quietly cut off. */}
                    <LoadMore
                        className="mt-3"
                        shown={cases.length}
                        noun="case"
                        hasMore={casesHaveMore}
                        loading={casesLoadingMore}
                        error={casesMoreError}
                        onLoadMore={() => onLoadMoreCases?.()}
                    />
                </div>
            </div>
        </div>
    );
}
