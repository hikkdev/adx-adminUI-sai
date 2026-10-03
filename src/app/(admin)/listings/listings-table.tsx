"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { ArrowDownToLine, Download, Map, Plus, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BulkActions } from "@/components/adx/bulk-actions";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { ROSTER_MENU_LABEL, RosterRowMenu, type RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { suspensionRowActions, useRosterPermission, useRosterSuspension } from "@/components/adx/party-roster-row-actions";
import { StatusBadge } from "@/components/adx/status-badge";
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { saveBlob } from "@/lib/api-client";
import { failureMessage, formatCsv } from "@/lib/bulk";
import { isLive } from "@/lib/api-config";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useFeature } from "@/lib/use-feature";
import {
    LISTING_CATEGORY_KEYS,
    LISTING_LIFECYCLE,
    LISTING_STATUS_TONE,
    listingCategoryLabel,
    listingStatusLabel,
    listingsCsvRows,
    listingsService,
    type AdminListing,
    type AdminListingsPage,
    type ListingDraftRow,
    type ListingDraftsPage,
    type ListingLifecycle,
} from "@/services/listings";
import { DRAFT_DELETE_PERMISSION, DeleteDraftDialog, draftColumns, draftHref } from "./listing-drafts";
import { listingRowLabel, useListingBulkActions } from "./listings-bulk";
import { DirectoryViewToggle, ListingGridCard, useDirectoryView } from "./listing-grid-card";

/** What the Status dropdown can show: one lifecycle status, all of them, or the drafts publishers saved half-way. */
export type DirectoryStatus = ListingLifecycle | "ALL" | "DRAFTS";

interface ListingsTableProps {
    page: AdminListingsPage;
    /** The drafts on show — only while the status is DRAFTS. */
    drafts: ListingDraftsPage | null;
    /** How many drafts there are, for the dropdown's "Drafts · N"; null while unknown. */
    draftsTotal: number | null;
    status: DirectoryStatus;
    onStatusChange: (status: DirectoryStatus) => void;
    /** One of the four categories, or null for all. */
    category: string | null;
    onCategoryChange: (category: string | null) => void;
    onChanged: () => void;
}

/** A day the way the console prints one — "24 Sept 2026" — or a dash. */
const onDay = (iso: string | null): string => (iso ? formatDate(iso) : "—");

/** The status option's words: "Live · 5". */
const optionLabel = (label: string, count: number | null): string => (count === null ? label : `${label} · ${formatNumber(count)}`);

export function ListingsTable({ page, drafts, draftsTotal, status, onStatusChange, category, onCategoryChange, onChanged }: ListingsTableProps) {
    const router = useRouter();
    /* CG5: the bolt chip is a surface of `marketplace.instant-booking`. Off,
       it is not drawn — the same rule the apps follow — however a row's
       column reads, because the feature is what the chip advertises. */
    const instantBooking = useFeature("marketplace.instant-booking").enabled === true;
    const suspension = useRosterSuspension("LISTING", "LISTING", onChanged);
    const statusActionsFor = suspension.statusActions;
    const bulkActions = useListingBulkActions();
    const mayDeleteDraft = useRosterPermission(DRAFT_DELETE_PERMISSION) && isLive("listings");
    const [deleting, setDeleting] = React.useState<ListingDraftRow | null>(null);
    const [exporting, setExporting] = React.useState(false);
    const drafting = status === "DRAFTS";
    /* 3 Oct 2026: Table or Grid, as this viewer last left it. Drafts are a table always — they have no photographs. */
    const [view, setView] = useDirectoryView();

    const columns = React.useMemo<ColumnDef<AdminListing>[]>(
        () => [
            {
                id: "listing",
                accessorFn: (listing) => `${listing.title} ${listing.displayId ?? ""}`,
                header: ({ column }) => <SortableHeader column={column}>Listing</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.title} size="sm" />
                        <div className="min-w-0">
                            <p className="font-medium text-foreground">{row.original.title}</p>
                            <p className="text-xs text-muted-foreground">
                                {[row.original.displayId, row.original.city, row.original.size].filter(Boolean).join(" · ") || row.original.address}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "publisher",
                accessorFn: (listing) => listing.publisherName ?? "",
                header: "Publisher",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {/* A scraped listing nobody has claimed genuinely has no publisher. */}
                        {row.original.publisherName ?? "Unclaimed"}
                    </span>
                ),
            },
            {
                id: "category",
                accessorFn: (listing) => `${listingCategoryLabel(listing.category)} ${listing.subType ?? ""}`,
                header: "Category",
                cell: ({ row }) => (
                    <div>
                        {/* 2 Oct 2026: the label, never the API's OUTDOOR; the publisher's own type beneath. */}
                        <p className="text-sm text-foreground">{listingCategoryLabel(row.original.category) || "—"}</p>
                        {row.original.subType ? <p className="text-xs text-muted-foreground">{row.original.subType}</p> : null}
                    </div>
                ),
            },
            {
                id: "rate",
                // Sorting needs a number; the printed figure never goes through one.
                accessorFn: (listing) => Number(listing.ratePerDay ?? 0),
                header: ({ column }) => <SortableHeader column={column}>Rate / day</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium">
                        {/* Priced in what the publisher is paid per day. A spot with no
                            rate is one nobody has priced, which is not zero. */}
                        {row.original.ratePerDay ? formatMoney(row.original.ratePerDay) : "—"}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={{ label: listingStatusLabel(row.original.status), tone: LISTING_STATUS_TONE[row.original.status] }} />
                        {/* Lot A: STOP_OPEN_WORK or STOP_ACCRUAL alone leave the
                            lifecycle where it was; the chip is what says so. */}
                        {row.original.status !== "SUSPENDED" && <SuspendedChip scopes={row.original.suspensionScopes} />}
                        {/* Lot D (Q105): the publisher's opt-in. Drawn only when
                            the row carries the column; a row without it is not "off". */}
                        {instantBooking && row.original.instantBooking === true && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                                <Zap className="size-3" aria-hidden />
                                Instant
                            </span>
                        )}
                        {/* Lot E: the rate sits under the floor of the card in
                            force. The chip says where the price is; the case
                            on /pricing/approvals says what was decided about it. */}
                        {row.original.belowFloor === true && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                                <ArrowDownToLine className="size-3" aria-hidden />
                                Below floor
                            </span>
                        )}
                    </span>
                ),
            },
            {
                id: "rating",
                // Lot D (Q104): the published reviews' average. Sorting needs a
                // number; the printed figure is the string the API sent.
                accessorFn: (listing) => Number(listing.ratingAvg ?? 0),
                header: ({ column }) => <SortableHeader column={column}>Rating</SortableHeader>,
                cell: ({ row }) =>
                    row.original.ratingAvg ? (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                            <Star className="size-3.5 fill-warning text-warning" aria-hidden />
                            {row.original.ratingAvg}
                            <span className="text-xs text-muted-foreground">({row.original.reviewCount})</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    ),
            },
            {
                id: "submitted",
                accessorFn: (listing) => listing.submittedAt ?? "",
                header: ({ column }) => <SortableHeader column={column}>Submitted</SortableHeader>,
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{onDay(row.original.submittedAt)}</span>,
            },
            {
                id: "actions",
                enableHiding: false,
                enableSorting: false,
                size: 48,
                cell: ({ row }) => {
                    /* The rosters' menu (2 Oct 2026): View details · Review listing
                       while it waits on the desk · then the status slot. */
                    const listing = row.original;
                    const statusActions = statusActionsFor({ id: listing.id, name: listing.title, scopes: listing.suspensionScopes, accountState: null });
                    const entries: RosterMenuEntry[] = [
                        { kind: "label", label: ROSTER_MENU_LABEL },
                        { kind: "item", label: "View details", onSelect: () => router.push(`/listings/${listing.id}`) },
                        ...(listing.status === "PENDING_REVIEW"
                            ? ([{ kind: "item", label: "Review listing", onSelect: () => router.push(`/listings/review/${listing.id}`) }] as RosterMenuEntry[])
                            : []),
                        ...(statusActions.length > 0 ? ([{ kind: "separator" }] as RosterMenuEntry[]) : []),
                        ...statusActions.map((action): RosterMenuEntry => ({ kind: "item", ...action })),
                    ];
                    return <RosterRowMenu entries={entries} />;
                },
            },
        ],
        [router, instantBooking, statusActionsFor],
    );

    const draftColumnDefs = React.useMemo(
        () =>
            draftColumns({
                open: (row) => router.push(draftHref(row)),
                onDelete: mayDeleteDraft ? (row) => setDeleting(row) : null,
            }),
        [router, mayDeleteDraft],
    );

    async function exportMatching() {
        if (exporting) return;
        setExporting(true);
        try {
            const rows = await listingsService.listAll({
                ...(status === "ALL" || status === "DRAFTS" ? {} : { status: [status] }),
                ...(category ? { category } : {}),
                sort: "SUBMITTED",
            });
            saveCsv(rows, "listings.csv");
            toast.success(`${formatNumber(rows.length)} ${rows.length === 1 ? "listing" : "listings"} exported`);
        } catch (cause) {
            toast.error("Could not export the listings", { description: failureMessage(cause) });
        } finally {
            setExporting(false);
        }
    }

    const shown = page.items.length;
    const awaiting = page.counts.PENDING_REVIEW ?? 0;
    const everything = LISTING_LIFECYCLE.reduce((sum, key) => sum + (page.counts[key] ?? 0), 0);

    const toolbar = (
        <>
            <Select value={status} onValueChange={(value) => onStatusChange(value as DirectoryStatus)}>
                <SelectTrigger className="h-9 w-[230px] bg-card" aria-label="Status">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">{optionLabel("All statuses", everything)}</SelectItem>
                    {LISTING_LIFECYCLE.map((value) => (
                        <SelectItem key={value} value={value}>
                            {/* The count comes from the server and is computed
                                without this filter, so every option can say how
                                many rows it would show. */}
                            {optionLabel(listingStatusLabel(value), page.counts[value] ?? 0)}
                        </SelectItem>
                    ))}
                    <SelectSeparator />
                    {/* 2 Oct 2026: the spots publishers saved half-way — a separate record, listed here because they are part of this list. */}
                    <SelectItem value="DRAFTS">{optionLabel("Drafts", draftsTotal)}</SelectItem>
                </SelectContent>
            </Select>
            {!drafting && (
                <Select value={category ?? "ALL"} onValueChange={(value) => onCategoryChange(value === "ALL" ? null : value)}>
                    <SelectTrigger className="h-9 w-[180px] bg-card" aria-label="Category">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All categories</SelectItem>
                        {LISTING_CATEGORY_KEYS.map((key) => (
                            <SelectItem key={key} value={key}>
                                {listingCategoryLabel(key)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            {!drafting && (
                <Button
                    variant="outline"
                    className="h-9 bg-card"
                    onClick={() => void exportMatching()}
                    disabled={exporting || page.total === 0}
                    title="Every listing under this status and category. Tick rows to export only those."
                    data-testid="export-matching"
                >
                    <Download className="mr-1.5 size-4" />
                    {exporting ? "Exporting…" : "Export CSV"}
                </Button>
            )}
        </>
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Listings"
                subtitle={
                    drafting
                        ? `${formatNumber(drafts?.total ?? 0)} drafts — spots publishers started on their phones and saved to finish later, newest first. A finished draft becomes the listing under the same reference.`
                        : shown < page.total
                          ? `${awaiting} awaiting review · showing the first ${shown} of ${page.total} — narrow the status to see the rest`
                          : `${awaiting} awaiting review · ${page.total} listings`
                }
                actions={
                    <>
                        {!drafting && <DirectoryViewToggle view={view} onChange={setView} />}
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/listings/map">
                                <Map className="mr-1.5 size-4" />
                                Map view
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/listings/new">
                                <Plus className="mr-1.5 size-4" />
                                Add listing
                            </Link>
                        </Button>
                    </>
                }
            />
            {drafting ? (
                <DataTable
                    columns={draftColumnDefs}
                    data={drafts?.items ?? []}
                    searchPlaceholder="Search drafts, publisher, number"
                    initialPageSize={10}
                    onRowClick={(row) => router.push(draftHref(row))}
                    toolbar={toolbar}
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={page.items}
                    searchPlaceholder="Search listings, publisher, category"
                    initialPageSize={10}
                    onRowClick={(listing) => router.push(`/listings/${listing.id}`)}
                    toolbar={toolbar}
                    /* The grid draws the same rows, ticks and pages as cards (3 Oct 2026). */
                    view={view}
                    renderCard={(listing) => <ListingGridCard listing={listing} instantBooking={instantBooking} />}
                    /* The shared selection and bulk bar — keyed by id so the failures stay ticked over the reload. */
                    getRowId={(listing) => listing.id}
                    bulkActions={(selected, _clear, keep) => (
                        <>
                            <BulkActions<AdminListing>
                                rows={selected}
                                actions={bulkActions}
                                label={listingRowLabel}
                                onSettled={(outcome) => {
                                    keep(outcome.failed.map((failure) => failure.row));
                                    onChanged();
                                }}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 bg-card"
                                onClick={() => saveCsv(selected, "listings-selected.csv")}
                                data-testid="bulk-export"
                            >
                                <Download className="mr-1.5 size-3.5" />
                                Export CSV
                            </Button>
                        </>
                    )}
                />
            )}
            {drafting && drafts && drafts.total > drafts.items.length ? (
                <p className="text-xs text-muted-foreground">{`Showing the newest ${drafts.items.length} of ${drafts.total} drafts. The rest are behind them, oldest last.`}</p>
            ) : null}
            {suspension.dialogs}
            <DeleteDraftDialog draft={deleting} onOpenChange={(open) => !open && setDeleting(null)} onDeleted={onChanged} />
        </div>
    );
}

function saveCsv(rows: readonly AdminListing[], filename: string): void {
    saveBlob(new Blob([formatCsv(listingsCsvRows(rows))], { type: "text/csv;charset=utf-8" }), filename);
}
