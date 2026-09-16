"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeIndianRupee, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import {
    SUBSCRIPTION_STATES,
    SUBSCRIPTION_STATE_META,
    formatRate,
    graceUntil,
    revenueService,
    sourceLabel,
    subscriptionPublisherLabel,
    type PublisherPlan,
    type SubscriptionState,
    type SubscriptionsPage,
} from "@/services/revenue";
import type { PublisherSubscription } from "@/types/revenue";
import { GrantDialog } from "./grant-dialog";

interface SubscriptionsViewProps {
    page: SubscriptionsPage;
    q: string;
    onQChange: (q: string) => void;
    state: SubscriptionState | "ALL";
    onStateChange: (state: SubscriptionState | "ALL") => void;
    pageNumber: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    /** The catalogue, for the grant dialog. */
    plans: PublisherPlan[];
    /** Lot J2: the publisher policy's grace, for the "in grace" note on an ended row; 0 when unread. */
    graceDays: number;
    onChanged: () => void;
}

/** What to call the publisher on a row: the name and PUB- id the list read carries, else the id. */
export const publisherLabel = subscriptionPublisherLabel;

/** "Ends 1 Oct 2026" or "Open-ended". */
export function endsLabel(row: Pick<PublisherSubscription, "endsAt">): string {
    return row.endsAt ? formatDate(row.endsAt) : "Open-ended";
}

/** The chips' "All" is the book, whatever the facet — the server's counts summed. */
export function sumCounts(counts: Record<string, number>): number {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

/**
 * The subscriptions tab — Lot J2 (d): the list contract. The state facet,
 * the search and the page go to the API; the chip counts come back computed
 * without the state in force; the publisher is named on the row. An ended
 * row inside the policy's grace says so, and every row shows whether it
 * renews on its own.
 */
export function SubscriptionsView({
    page,
    q,
    onQChange,
    state,
    onStateChange,
    pageNumber,
    onPageChange,
    pageSize,
    plans,
    graceDays,
    onChanged,
}: SubscriptionsViewProps) {
    const [granting, setGranting] = React.useState(false);
    const [ending, setEnding] = React.useState<PublisherSubscription | null>(null);
    const [busy, setBusy] = React.useState(false);

    const end = async () => {
        if (!ending || busy) return;
        setBusy(true);
        try {
            await revenueService.endSubscription(ending.id);
            toast.success(`${ending.planName ?? ending.tier} ended`, {
                description: "The publisher's bookings carry the ladder's next rung from now.",
            });
            setEnding(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The change did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    const columns = React.useMemo<ColumnDef<PublisherSubscription>[]>(
        () => [
            {
                id: "publisher",
                accessorFn: (row) => publisherLabel(row),
                header: "Publisher",
                cell: ({ row }) => (
                    <Link
                        href={`/publishers/${encodeURIComponent(row.original.publisherId)}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        {publisherLabel(row.original)}
                    </Link>
                ),
            },
            {
                id: "plan",
                accessorFn: (row) => row.planName ?? row.tier,
                header: "Plan",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="text-foreground">{row.original.planName ?? row.original.tier}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{row.original.tier}</p>
                    </div>
                ),
            },
            {
                id: "source",
                accessorKey: "source",
                header: "Source",
                cell: ({ row }) => <span className="text-muted-foreground">{sourceLabel(row.original.source)}</span>,
            },
            {
                id: "price",
                accessorKey: "pricePerMonth",
                header: "₹ / month",
                cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.pricePerMonth)}</span>,
            },
            {
                id: "rate",
                accessorKey: "ratePct",
                header: "Commission",
                cell: ({ row }) => <span className="tabular-nums">{formatRate(row.original.ratePct)}</span>,
            },
            {
                id: "starts",
                accessorKey: "startsAt",
                header: "Starts",
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.startsAt)}</span>,
            },
            {
                id: "ends",
                accessorFn: (row) => row.endsAt ?? "",
                header: "Ends",
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{endsLabel(row.original)}</span>,
            },
            {
                id: "autoRenew",
                accessorKey: "autoRenew",
                header: "Auto-renew",
                cell: ({ row }) =>
                    row.original.autoRenew ? (
                        <Badge variant="secondary" className="rounded-sm" data-testid={`auto-renew-${row.original.id}`}>
                            On
                        </Badge>
                    ) : (
                        <span className="text-muted-foreground">Off</span>
                    ),
            },
            {
                id: "state",
                accessorFn: (row) => row.state,
                header: "State",
                cell: ({ row }) => {
                    const grace = graceUntil(row.original, graceDays);
                    return (
                        <div className="min-w-0">
                            <StatusBadge status={SUBSCRIPTION_STATE_META[row.original.state]} />
                            {grace && (
                                <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground" data-testid={`in-grace-${row.original.id}`}>
                                    In grace until {formatDate(grace.toISOString())}
                                </p>
                            )}
                        </div>
                    );
                },
            },
            {
                id: "actions",
                header: () => <span className="sr-only">Actions</span>,
                cell: ({ row }) =>
                    row.original.state !== "ENDED" ? (
                        <div className="text-right">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 bg-card text-xs"
                                onClick={() => setEnding(row.original)}
                                aria-label={`End ${row.original.planName ?? row.original.tier} for ${publisherLabel(row.original)}`}
                            >
                                End
                            </Button>
                        </div>
                    ) : null,
            },
        ],
        [graceDays],
    );

    /* The chip counts come from the server, computed without the state in force. */
    const chips: FilterChip<SubscriptionState | "ALL">[] = [
        { value: "ALL", label: "All", count: sumCounts(page.counts) },
        ...SUBSCRIPTION_STATES.map((value) => ({ value, label: SUBSCRIPTION_STATE_META[value].label, count: page.counts[value] })),
    ];

    const from = page.total === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
    const to = Math.min(pageNumber * pageSize, page.total);
    const lastPage = Math.max(1, Math.ceil(page.total / pageSize));
    const filtered = q.trim().length > 0 || state !== "ALL";

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder="Search publisher name or PUB- id"
                        aria-label="Search subscriptions"
                        className="h-9 w-[280px] bg-card pl-8"
                    />
                </div>
                <Button size="sm" onClick={() => setGranting(true)} disabled={plans.length === 0}>
                    <Plus className="mr-1.5 size-4" />
                    Grant
                </Button>
            </div>

            <FilterChips chips={chips} value={state} onChange={onStateChange} />

            <DataTable
                columns={columns}
                data={page.items}
                showColumnToggle={false}
                showPagination={false}
                emptyState={
                    <EmptyState
                        icon={BadgeIndianRupee}
                        title={filtered ? "No subscriptions match" : "No subscriptions yet"}
                        description={
                            filtered
                                ? "Clear the search or pick another state to see the rest."
                                : "A subscription is granted here or bought in the app; either way it is the commission rate the publisher's bookings carry."
                        }
                    />
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                    {from}-{to} of {formatNumber(page.total)}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1}>
                        Previous
                    </Button>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">
                        {pageNumber}
                    </span>
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber + 1)} disabled={pageNumber >= lastPage}>
                        Next
                    </Button>
                </div>
            </div>

            <GrantDialog open={granting} onOpenChange={setGranting} plans={plans} onGranted={onChanged} />

            <ConfirmDialog
                open={ending !== null}
                onOpenChange={(open) => !open && setEnding(null)}
                title="End this subscription?"
                description={
                    ending
                        ? `${publisherLabel(ending)} loses the ${ending.planName ?? ending.tier} rate (${formatRate(ending.ratePct)}) from now. Their bookings are charged the ladder's next rung; nothing already accrued changes.`
                        : ""
                }
                confirmLabel="End subscription"
                destructive
                busy={busy}
                onConfirm={() => void end()}
            />
        </div>
    );
}
