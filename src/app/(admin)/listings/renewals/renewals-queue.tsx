"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, CalendarClock } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { supplyService } from "@/services/supply";
import { Button } from "@/components/ui/button";
import { BulkActions, type BulkAction } from "@/components/adx/bulk-actions";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { ROSTER_MENU_LABEL, RosterRowMenu, type RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { BulkOutcome } from "@/lib/bulk";
import {
    RENEWALS_PAGE,
    RENEWALS_HORIZON_DAYS,
    RENEWAL_ACTION_PERMISSION,
    RENEWAL_STATE_META,
    daysLeftLabel,
    inRenewalChip,
    remindRenewalSkip,
    renewalBucket,
    renewalChips,
    renewalCounts,
    renewalRowLabel,
    renewalsSubtitle,
    type RenewalChip,
} from "@/services/renewals-queue";
import { RIGHTS_BASIS_LABEL, type RightsQueueRow } from "@/types";
import { QueueLines } from "../verification/queue-lines";
import { RowActionDialog, useRowAction } from "../verification/verification-actions";

/**
 * Listings › Renewals — the lease, licence or permit (the publisher's right
 * to sell the space) ending within sixty days or ended, soonest first. Not
 * the photo re-check; that is Verification, and each page points at the
 * other (3 Oct 2026, the owner: "There's some lapsed ones but it doesn't
 * show in renewals tab").
 *
 * Since 3 Oct 2026 the other queues' layout: the summary line where the
 * three number cards were, the chips with their counts, the shared table
 * with its checkboxes, Columns and paging, the rosters' row menu and the
 * shared bulk bar. An expired spot is off the shelf until the renewed
 * document is approved on the review desk — that approval, with a later end
 * date, is what extends the term; this page watches and nudges:
 *
 *   View listing                 the listing page
 *   Open documents               the review desk, where the renewed paper is approved
 *   Remind publisher to renew    `POST /supply/listings/:id/rights/remind`  supply.edit (bar and menu)
 *   Run the renewals sweep       `POST /supply/rights/sweep`                system.jobs (top right)
 *
 * An action the viewer may not take is not offered.
 */

const listingNoun = ["listing", "listings"] as const;

function useRenewalActions(): BulkAction<RightsQueueRow>[] {
    const mayRemind = useRosterPermission(RENEWAL_ACTION_PERMISSION.remind);
    const supplyLive = isLive("supply");
    return React.useMemo(() => {
        const actions: BulkAction<RightsQueueRow>[] = [];
        if (supplyLive && mayRemind) {
            actions.push({
                key: "remind-renewal",
                label: "Remind publisher to renew",
                icon: BellRing,
                skip: remindRenewalSkip,
                participle: "reminded",
                noun: listingNoun,
                phrase: (count) => `Remind the publishers of ${count}`,
                description:
                    "Each publisher gets an app notice that opens the listing, asking for the renewed lease, licence or permit. A listing reminded in the last 24 hours is refused and stays ticked.",
                run: (row) => supplyService.remindRightsRenewal(row.id),
            });
        }
        return actions;
    }, [supplyLive, mayRemind]);
}

export function RenewalsQueue({ rows, onChanged }: { rows: RightsQueueRow[]; onChanged?: () => void }) {
    const router = useRouter();
    const changed = React.useCallback(() => onChanged?.(), [onChanged]);
    const [chip, setChip] = React.useState<RenewalChip>("all");
    const [sweeping, setSweeping] = React.useState(false);

    const maySweep = useRosterPermission(RENEWAL_ACTION_PERMISSION.sweep);
    const actions = useRenewalActions();
    const rowAction = useRowAction(actions);
    const openAction = rowAction.open;

    const columns = React.useMemo<ColumnDef<RightsQueueRow>[]>(
        () => [
            {
                id: "listing",
                accessorFn: (row) => `${row.title} ${row.displayId ?? ""}`,
                header: ({ column }) => <SortableHeader column={column}>Listing</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <Link href={`/listings/${row.original.id}`} className="font-medium text-foreground hover:underline">
                            {row.original.title}
                        </Link>
                        {row.original.displayId ? <p className="text-xs text-muted-foreground">{row.original.displayId}</p> : null}
                    </div>
                ),
            },
            {
                id: "publisher",
                accessorFn: (row) => row.publisherName ?? "",
                header: "Publisher",
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.publisherName ?? "Unclaimed"}</span>,
            },
            {
                id: "held",
                accessorFn: (row) => RIGHTS_BASIS_LABEL[row.rightsBasis],
                header: "Held on",
                cell: ({ row }) => <span className="text-xs text-muted-foreground">{RIGHTS_BASIS_LABEL[row.original.rightsBasis]}</span>,
            },
            {
                id: "ends",
                accessorFn: (row) => row.rightsValidUntil ?? "",
                header: ({ column }) => <SortableHeader column={column}>Ends</SortableHeader>,
                cell: ({ row }) => {
                    const days = row.original.daysLeft;
                    return (
                        <span className={cn("whitespace-nowrap text-xs tabular-nums", days !== null && days <= 0 ? "font-medium text-danger" : "text-muted-foreground")}>
                            {row.original.rightsValidUntil ? formatDate(row.original.rightsValidUntil) : "—"}
                            {days === null ? "" : ` · ${daysLeftLabel(days)}`}
                        </span>
                    );
                },
            },
            {
                id: "reminded",
                accessorFn: (row) => row.rightsRemindedAt ?? "",
                header: "Last reminded",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {row.original.rightsRemindedAt ? formatDate(row.original.rightsRemindedAt) : "Not yet"}
                    </span>
                ),
            },
            {
                id: "state",
                accessorFn: (row) => renewalBucket(row),
                header: "State",
                cell: ({ row }) => <StatusBadge status={RENEWAL_STATE_META[renewalBucket(row.original)]} />,
            },
            {
                id: "shelf",
                accessorFn: (row) => (row.availableNow ? "On" : "Off"),
                header: "Shelf",
                cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.availableNow ? "On" : "Off"}</span>,
            },
            {
                id: "actions",
                enableHiding: false,
                enableSorting: false,
                size: 48,
                cell: ({ row }) => {
                    /* The rosters' menu: the listing and its papers, then what can be done about the term. */
                    const listing = row.original;
                    const offered = actions.filter((action) => !action.skip?.(listing));
                    const entries: RosterMenuEntry[] = [
                        { kind: "label", label: ROSTER_MENU_LABEL },
                        { kind: "item", label: "View listing", onSelect: () => router.push(`/listings/${listing.id}`) },
                        { kind: "item", label: "Open documents", onSelect: () => router.push(`/listings/review/${listing.id}`) },
                        ...(offered.length > 0 ? ([{ kind: "separator" }] as RosterMenuEntry[]) : []),
                        ...offered.map((action): RosterMenuEntry => ({ kind: "item", label: action.label, onSelect: () => openAction(action.key, listing) })),
                    ];
                    return <RosterRowMenu entries={entries} />;
                },
            },
        ],
        [router, actions, openAction],
    );

    const runSweep = async () => {
        setSweeping(true);
        try {
            const result = await supplyService.runRightsSweep();
            toast.success(
                result.lapsed === 0 && result.reminded === 0
                    ? "Nothing to do — every term is either current or already handled."
                    : `${result.reminded} reminded, ${result.lapsed} expired.`
            );
            changed();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not run the renewals sweep.");
        } finally {
            setSweeping(false);
        }
    };

    const counts = renewalCounts(rows);
    const visible = rows.filter((row) => inRenewalChip(row, chip));

    /* After a run from the bar: the failures stay ticked, the rest go, and the queue reloads once. */
    const settle = (keep: (rows: RightsQueueRow[]) => void) => (outcome: BulkOutcome<RightsQueueRow>) => {
        keep(outcome.failed.map((failure) => failure.row));
        changed();
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title={RENEWALS_PAGE.title}
                subtitle={RENEWALS_PAGE.subtitle}
                actions={
                    maySweep ? (
                        <Button size="sm" variant="outline" onClick={runSweep} disabled={sweeping} data-testid="renewals-sweep">
                            {sweeping ? "Running…" : "Run the renewals sweep"}
                        </Button>
                    ) : undefined
                }
            />

            <QueueLines crossLink={RENEWALS_PAGE.crossLink} summary={renewalsSubtitle(counts)} />

            <FilterChips<RenewalChip> value={chip} onChange={setChip} chips={renewalChips(counts)} />

            <DataTable
                columns={columns}
                data={visible}
                searchPlaceholder="Search listings, reference, publisher"
                initialPageSize={10}
                getRowId={(row) => row.id}
                /* No action the viewer may take, no checkboxes. */
                bulkActions={
                    actions.length > 0
                        ? (selected, _clear, keep) => <BulkActions<RightsQueueRow> rows={selected} actions={actions} label={renewalRowLabel} onSettled={settle(keep)} />
                        : undefined
                }
                emptyState={
                    <EmptyState
                        icon={CalendarClock}
                        title={chip === "all" ? "Nothing due" : "Nothing under this chip"}
                        description={
                            chip === "all"
                                ? `No lease, licence or permit runs out in the next ${RENEWALS_HORIZON_DAYS} days.`
                                : "Choose another state, or All."
                        }
                    />
                }
            />

            <RowActionDialog<RightsQueueRow> actions={actions} pending={rowAction.pending} label={renewalRowLabel} onClose={rowAction.close} onSettled={changed} />
        </div>
    );
}
