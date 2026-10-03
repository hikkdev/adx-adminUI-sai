"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { ApiError } from "@/lib/api-client";
import { supplyService } from "@/services/supply";
import { Button } from "@/components/ui/button";
import { BulkActions } from "@/components/adx/bulk-actions";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { LoadMore } from "@/components/adx/load-more";
import { ROSTER_MENU_LABEL, RosterRowMenu, type RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { useRosterPermission, useRosterSuspension } from "@/components/adx/party-roster-row-actions";
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { BulkOutcome } from "@/lib/bulk";
import {
    RECHECK_PAGE,
    RECHECK_STATE_META,
    VERIFICATION_ACTION_PERMISSION,
    caseReference,
    caseRowLabel,
    caseWaiting,
    inChip,
    queueRowLabel,
    verificationChips,
    verificationCounts,
    verificationQueueSubtitle,
    type VerificationChip,
} from "@/services/verification-queue";
import { VerificationReview } from "./verification-review";
import { QueueLines } from "./queue-lines";
import { RowActionDialog, useCaseActions, useRowAction, useVerificationActions } from "./verification-actions";
import {
    REMOVABILITY_META,
    type ComplianceCase,
    type VerificationQueueRow,
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

/** Days until (positive) or since (negative) the verification falls due. */
function daysTo(iso: string | null): number | null {
    if (!iso) return null;
    return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** The keys of the queue actions the row menu lists, in the menu's order — the status slot (Suspend… / Reinstate) is the rosters' own. */
const ROW_MENU_KEYS = ["remind", "site-check", "extend"] as const;

/**
 * Listings › Verification ("Spot re-checks" — the photo re-check that the
 * spot still stands, never the lease or permit, which is Renewals') — since 3 Oct 2026 the other queues' layout (the
 * owner: "If verifications lapsed, what action can we take here? There's no
 * actionable button or bulk action or selection option"): the summary line
 * under the title where the four number cards were, the state chips with
 * their counts, the shared table with its checkboxes, Columns and paging,
 * the rosters' row menu and the shared bulk bar. The compliance cases below
 * are the same table with their own menu and bar.
 *
 * What each action does and the route behind it is in `verification-actions`.
 */
export function VerificationQueue({
    rows,
    cases,
    casesHaveMore = false,
    casesLoadingMore = false,
    casesMoreError = null,
    onLoadMoreCases,
    onChanged,
}: Props) {
    const router = useRouter();
    const changed = React.useCallback(() => onChanged?.(), [onChanged]);
    const [chip, setChip] = React.useState<VerificationChip>("all");
    const [sweeping, setSweeping] = React.useState(false);
    /* Which listing's submitted photographs are open for review, if any. */
    const [reviewing, setReviewing] = React.useState<VerificationQueueRow | null>(null);

    const maySweep = useRosterPermission(VERIFICATION_ACTION_PERMISSION.sweep);
    const listingActions = useVerificationActions();
    const caseActions = useCaseActions();
    const listingRow = useRowAction(listingActions);
    const caseRow = useRowAction(caseActions);
    const suspension = useRosterSuspension("LISTING", "LISTING", changed);
    const statusActionsFor = suspension.statusActions;

    /* The row menu's queue items: only those the viewer may take, and only where the action applies. */
    const rowActions = React.useMemo(
        () => listingActions.filter((action) => (ROW_MENU_KEYS as readonly string[]).includes(action.key)),
        [listingActions],
    );
    const openListingAction = listingRow.open;
    const openCaseAction = caseRow.open;

    const columns = React.useMemo<ColumnDef<VerificationQueueRow>[]>(
        () => [
            {
                id: "listing",
                accessorFn: (row) => `${row.title} ${row.displayId ?? ""} ${row.city ?? ""}`,
                header: ({ column }) => <SortableHeader column={column}>Listing</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <Link href={`/listings/${row.original.listingId}`} className="font-medium text-foreground hover:underline">
                            {row.original.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{[row.original.displayId, row.original.city].filter(Boolean).join(" · ") || "—"}</p>
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
                id: "cadence",
                accessorFn: (row) => row.removability,
                header: "Cadence",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {REMOVABILITY_META[row.original.removability].label} · {REMOVABILITY_META[row.original.removability].cadenceDays}d
                    </span>
                ),
            },
            {
                id: "verified",
                accessorFn: (row) => row.verifiedAt ?? "",
                header: "Last verified",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{row.original.verifiedAt ? formatDate(row.original.verifiedAt) : "Never"}</span>
                ),
            },
            {
                id: "due",
                accessorFn: (row) => row.verificationExpiresAt ?? "",
                header: ({ column }) => <SortableHeader column={column}>Due</SortableHeader>,
                cell: ({ row }) => {
                    const days = daysTo(row.original.verificationExpiresAt);
                    return (
                        <span className={cn("whitespace-nowrap text-xs tabular-nums", days !== null && days < 0 ? "font-medium text-danger" : "text-muted-foreground")}>
                            {days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`}
                        </span>
                    );
                },
            },
            {
                id: "state",
                accessorFn: (row) => row.state,
                header: "State",
                cell: ({ row }) => (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={RECHECK_STATE_META[row.original.state]} />
                        {row.original.status === "SUSPENDED" && (row.original.suspensionScopes ?? []).length === 0 ? (
                            <StatusBadge status={{ label: "Suspended", tone: "danger" }} />
                        ) : (
                            <SuspendedChip scopes={row.original.suspensionScopes} />
                        )}
                    </span>
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                enableSorting: false,
                size: 48,
                cell: ({ row }) => {
                    /* The rosters' menu: Photos first, the listing, then what can be done about the overdue re-check, then the status slot. */
                    const listing = row.original;
                    const queueItems = rowActions.filter((action) => !action.skip?.(listing));
                    const statusActions = statusActionsFor({ id: listing.listingId, name: listing.title, scopes: listing.suspensionScopes, accountState: null });
                    const entries: RosterMenuEntry[] = [
                        { kind: "label", label: ROSTER_MENU_LABEL },
                        { kind: "item", label: "Photos", onSelect: () => setReviewing(listing) },
                        { kind: "item", label: "View listing", onSelect: () => router.push(`/listings/${listing.listingId}`) },
                        ...(queueItems.length > 0 ? ([{ kind: "separator" }] as RosterMenuEntry[]) : []),
                        ...queueItems.map((action): RosterMenuEntry => ({ kind: "item", label: action.label, onSelect: () => openListingAction(action.key, listing) })),
                        ...(statusActions.length > 0 ? ([{ kind: "separator" }] as RosterMenuEntry[]) : []),
                        ...statusActions.map((action): RosterMenuEntry => ({ kind: "item", ...action })),
                    ];
                    return <RosterRowMenu entries={entries} />;
                },
            },
        ],
        [router, rowActions, statusActionsFor, openListingAction],
    );

    const caseColumns = React.useMemo<ColumnDef<ComplianceCase>[]>(
        () => [
            {
                /* No raw database id: what the case is about, the listing's LST- reference, and the day it opened. */
                id: "case",
                accessorFn: (item) => caseReference(item),
                header: "Case",
                cell: ({ row }) => (
                    <div className="min-w-0 whitespace-nowrap">
                        <p className="text-sm font-medium text-foreground">{caseReference(row.original)}</p>
                        <p className="text-xs text-muted-foreground">opened {formatDate(row.original.openedAt)}</p>
                    </div>
                ),
            },
            {
                id: "listing",
                accessorFn: (item) => `${item.listingTitle} ${item.listingDisplayId ?? ""}`,
                header: "Listing",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <Link href={`/listings/${row.original.listingId}`} className="font-medium text-foreground hover:underline">
                            {row.original.listingTitle || "—"}
                        </Link>
                        {row.original.listingDisplayId ? <p className="text-xs text-muted-foreground">{row.original.listingDisplayId}</p> : null}
                    </div>
                ),
            },
            {
                id: "publisher",
                accessorFn: (item) => item.publisherName ?? "",
                header: "Publisher",
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.publisherName ?? "—"}</span>,
            },
            {
                id: "attempts",
                accessorFn: (item) => item.attemptCount,
                header: "Attempts",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap tabular-nums">
                        {row.original.attemptCount} of 4
                        {row.original.lastAttemptAt ? <span className="block text-xs text-muted-foreground">last {formatDate(row.original.lastAttemptAt)}</span> : null}
                    </span>
                ),
            },
            {
                id: "due",
                accessorFn: (item) => item.dueAt,
                header: ({ column }) => <SortableHeader column={column}>Due</SortableHeader>,
                cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.original.dueAt)}</span>,
            },
            {
                id: "status",
                accessorFn: (item) => item.status,
                header: "Status",
                cell: ({ row }) => <StatusBadge status={COMPLIANCE_STATUS_META[row.original.status]} />,
            },
            {
                id: "actions",
                enableHiding: false,
                enableSorting: false,
                size: 48,
                cell: ({ row }) => {
                    const item = row.original;
                    const offered = caseActions.filter((action) => !action.skip?.(item));
                    const entries: RosterMenuEntry[] = [
                        { kind: "label", label: ROSTER_MENU_LABEL },
                        { kind: "item", label: "View listing", onSelect: () => router.push(`/listings/${item.listingId}`) },
                        ...(offered.length > 0 ? ([{ kind: "separator" }] as RosterMenuEntry[]) : []),
                        ...offered.map((action): RosterMenuEntry => ({ kind: "item", label: action.label, onSelect: () => openCaseAction(action.key, item) })),
                    ];
                    return <RosterRowMenu entries={entries} />;
                },
            },
        ],
        [router, caseActions, openCaseAction],
    );

    /**
     * The sweep walks overdue re-checks one step down the enforcement ladder. It
     * is idempotent on the backend, so a double click costs a round trip and
     * nothing else.
     */
    const runSweep = async () => {
        setSweeping(true);
        try {
            const result = await supplyService.runEnforcementSweep();
            toast.success(
                result.lapsed === 0 && result.suspended === 0
                    ? "Nothing to do — no re-check is overdue."
                    : `${result.holdsOpened} holds opened, ${result.casesOpened} cases opened, ${result.suspended} suspended.`
            );
            changed();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not run the enforcement sweep.");
        } finally {
            setSweeping(false);
        }
    };

    const counts = verificationCounts(rows);
    const visible = rows.filter((row) => inChip(row, chip));
    const waiting = cases.filter(caseWaiting).length;

    /* After a run from the bar: the failures stay ticked, the rest go, and the queue reloads once. */
    const settle =
        <T,>(keep: (rows: T[]) => void) =>
        (outcome: BulkOutcome<T>) => {
            keep(outcome.failed.map((failure) => failure.row));
            changed();
        };

    return (
        <div className="space-y-5">
            <PageHeader
                title={RECHECK_PAGE.title}
                subtitle={RECHECK_PAGE.subtitle}
                actions={
                    maySweep ? (
                        <Button size="sm" variant="outline" onClick={runSweep} disabled={sweeping}>
                            {sweeping ? "Running…" : "Run enforcement sweep"}
                        </Button>
                    ) : undefined
                }
            />

            <QueueLines crossLink={RECHECK_PAGE.crossLink} summary={verificationQueueSubtitle(counts, waiting)} />

            <FilterChips<VerificationChip> value={chip} onChange={setChip} chips={verificationChips(counts)} />

            <DataTable
                columns={columns}
                data={visible}
                searchPlaceholder="Search listings, reference, city, publisher"
                initialPageSize={10}
                getRowId={(row) => row.listingId}
                /* No action the viewer may take, no checkboxes. */
                bulkActions={
                    listingActions.length > 0
                        ? (selected, _clear, keep) => <BulkActions<VerificationQueueRow> rows={selected} actions={listingActions} label={queueRowLabel} onSettled={settle(keep)} />
                        : undefined
                }
                emptyState={
                    <EmptyState
                        icon={ShieldCheck}
                        title={chip === "all" ? "Nothing due" : "Nothing under this chip"}
                        description={chip === "all" ? "Every live spot is inside its re-check window." : "Choose another state, or All."}
                    />
                }
            />

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
                    subtitle="Opened three days after a re-check falls overdue. Suspension falls due 48 hours after opening."
                />
                <div className="mt-3">
                    <DataTable
                        columns={caseColumns}
                        data={cases}
                        searchPlaceholder="Search cases, listing, publisher"
                        initialPageSize={10}
                        getRowId={(item) => item.id}
                        bulkActions={
                            caseActions.length > 0
                                ? (selected, _clear, keep) => <BulkActions<ComplianceCase> rows={selected} actions={caseActions} label={caseRowLabel} onSettled={settle(keep)} />
                                : undefined
                        }
                        emptyState={<EmptyState icon={ShieldCheck} title="No open cases" description="A case opens three days after a re-check falls overdue." />}
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

            <RowActionDialog<VerificationQueueRow>
                actions={listingActions}
                pending={listingRow.pending}
                label={queueRowLabel}
                onClose={listingRow.close}
                onSettled={changed}
            />
            <RowActionDialog<ComplianceCase> actions={caseActions} pending={caseRow.pending} label={caseRowLabel} onClose={caseRow.close} onSettled={changed} />
            {suspension.dialogs}
        </div>
    );
}
