"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { ROSTER_MENU_LABEL, RosterRowMenu, type RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { SortableHeader } from "@/components/adx/data-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { VerifiedTick } from "@/components/adx/verified-tick";
import { failureMessage } from "@/lib/bulk";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listingCategoryLabel, listingsService, type ListingDraftRow } from "@/services/listings";

/**
 * QR-8's listing drafts, inside the Listings table (2 Oct 2026, the owner:
 * "can we move drafts inside Listings since it's a part of that list
 * anyways?"). A draft is a spot a publisher started on their phone and saved
 * to finish later; the reference (`LST-…`) is the one the listing takes when
 * they finish, so a note on a call names the same spot the table shows
 * afterwards. The columns are the table's own where they apply — Listing,
 * Publisher, Category, Status, and the last save in place of Submitted.
 */

/** The permission `DELETE /listings/drafts/desk/:id` asks — a delete power, never the edit tier alone. */
export const DRAFT_DELETE_PERMISSION = "marketplace.delete";

/** The wizard's step names, as the phone's flow config keys them; the index when a key is unknown. */
export function draftStepLabel(row: Pick<ListingDraftRow, "stepKey" | "stepIndex">): string {
    const named: Record<string, string> = {
        "select-category": "Category",
        venue: "Venue",
        "spot-type": "Spot type",
        "spot-details": "Spot details",
        details: "Spot details",
        "more-info": "More info",
        "content-rules": "Content rules",
        pricing: "Pricing",
        documents: "Documents",
        review: "Review",
    };
    return (row.stepKey && named[row.stepKey]) ?? `Step ${row.stepIndex + 1}`;
}

/** "Today" / "1 day" / "9 days" — how long a draft has sat untouched. */
export const idleLabel = (days: number): string => (days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`);

export const draftHref = (row: Pick<ListingDraftRow, "id">): string => `/listings/drafts/${encodeURIComponent(row.id)}`;

/** The row menu: open the draft, and — with the permission — throw it away. */
export function draftRowMenu(row: ListingDraftRow, options: { open: (row: ListingDraftRow) => void; onDelete: ((row: ListingDraftRow) => void) | null }): RosterMenuEntry[] {
    return [
        { kind: "label", label: ROSTER_MENU_LABEL },
        { kind: "item", label: "Open draft", onSelect: () => options.open(row) },
        ...(options.onDelete
            ? ([{ kind: "separator" }, { kind: "item", label: "Delete draft…", destructive: true, onSelect: () => options.onDelete!(row) }] as RosterMenuEntry[])
            : []),
    ];
}

export function draftColumns(options: { open: (row: ListingDraftRow) => void; onDelete: ((row: ListingDraftRow) => void) | null }): ColumnDef<ListingDraftRow>[] {
    return [
        {
            id: "listing",
            accessorFn: (row) => `${row.title ?? ""} ${row.displayId}`,
            header: ({ column }) => <SortableHeader column={column}>Listing</SortableHeader>,
            cell: ({ row }) => (
                <div className="flex items-center gap-2.5">
                    <InitialsAvatar name={row.original.title ?? row.original.displayId} size="sm" />
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.original.title ?? <span className="text-muted-foreground">Untitled</span>}</p>
                        <p className="font-mono text-xs text-muted-foreground">{row.original.displayId}</p>
                    </div>
                </div>
            ),
        },
        {
            id: "publisher",
            accessorFn: (row) => `${row.publisher.name} ${row.publisher.mobile}`,
            header: "Publisher",
            cell: ({ row }) => (
                <div className="min-w-0">
                    <Link
                        href={`/publishers/${row.original.publisher.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex items-center gap-1 text-sm text-foreground hover:underline"
                    >
                        <span className="truncate">{row.original.publisher.name}</span>
                        <VerifiedTick kycStatus={row.original.publisher.kycStatus} size={12} />
                    </Link>
                    <p className="text-xs text-muted-foreground">
                        <a href={`tel:${row.original.publisher.mobile}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                            {row.original.publisher.mobile}
                        </a>
                        {row.original.publisher.city ? ` · ${row.original.publisher.city}` : ""}
                    </p>
                </div>
            ),
        },
        {
            id: "category",
            accessorFn: (row) => listingCategoryLabel(row.category),
            header: "Category",
            cell: ({ row }) => (
                <div>
                    <p className={cn("text-sm", row.original.category ? "text-foreground" : "text-muted-foreground")}>
                        {row.original.category ? listingCategoryLabel(row.original.category) : "No category yet"}
                    </p>
                    <p className="text-xs text-muted-foreground">Stopped at {draftStepLabel(row.original)}</p>
                </div>
            ),
        },
        {
            id: "status",
            accessorFn: () => "Draft",
            header: "Status",
            cell: () => <StatusBadge status={{ label: "Draft", tone: "neutral" }} />,
        },
        {
            id: "saved",
            accessorFn: (row) => row.updatedAt,
            header: ({ column }) => <SortableHeader column={column}>Last saved</SortableHeader>,
            cell: ({ row }) => (
                <div>
                    <p className="text-sm text-muted-foreground">{formatDate(row.original.updatedAt)}</p>
                    <p className={cn("text-xs", row.original.idleDays >= 7 ? "font-medium text-amber-700" : "text-muted-foreground")}>
                        {row.original.idleDays === 0 ? "Saved today" : `Idle ${idleLabel(row.original.idleDays)}`}
                    </p>
                </div>
            ),
        },
        {
            id: "actions",
            enableHiding: false,
            enableSorting: false,
            size: 48,
            cell: ({ row }) => <RosterRowMenu entries={draftRowMenu(row.original, options)} />,
        },
    ];
}

/** "Delete draft…" — confirmed, then `DELETE /listings/drafts/desk/:id`. */
export function DeleteDraftDialog({ draft, onOpenChange, onDeleted }: { draft: ListingDraftRow | null; onOpenChange: (open: boolean) => void; onDeleted: () => void }) {
    const [busy, setBusy] = React.useState(false);
    async function confirm() {
        if (!draft || busy) return;
        setBusy(true);
        try {
            await listingsService.deleteDraft(draft.id);
            toast.success(`Draft ${draft.displayId} deleted`, { description: draft.title ?? undefined });
            onOpenChange(false);
            onDeleted();
        } catch (cause) {
            toast.error(`Could not delete ${draft.displayId}`, { description: failureMessage(cause) });
        } finally {
            setBusy(false);
        }
    }
    return (
        <ConfirmDialog
            open={draft !== null}
            onOpenChange={onOpenChange}
            title={draft ? `Delete draft ${draft.displayId}?` : ""}
            description={
                draft
                    ? `${draft.publisher.name}'s half-written spot${draft.title ? ` “${draft.title}”` : ""} is removed for good, and their phone no longer offers it to finish. Recorded with your name in the audit trail.`
                    : ""
            }
            confirmLabel="Delete draft"
            destructive
            busy={busy}
            onConfirm={() => void confirm()}
        />
    );
}
