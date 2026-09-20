"use client";

import * as React from "react";
import Link from "next/link";
import { FilePenLine } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/adx/page-header";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { VerifiedTick } from "@/components/adx/verified-tick";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { ListingDraftRow, ListingDraftsPage } from "@/services/listings";

/**
 * QR-8 — the drafts desk. The owner: "allow draft facility for listings …
 * We can use it to reach out to advertisers or publishers later with sales
 * team or onboarding team." Every publisher's half-written spot, with who
 * to call beside it and how long it has sat. The reference (`LST-…`) is
 * the one the listing will carry when they finish, so a note on a call
 * names the same spot the desk sees later.
 */

export type IdleChip = 0 | 1 | 3 | 7 | 30;

const IDLE_CHIPS: { value: IdleChip; label: string }[] = [
    { value: 0, label: "All" },
    { value: 1, label: "Idle 1 day+" },
    { value: 3, label: "Idle 3 days+" },
    { value: 7, label: "Idle a week+" },
    { value: 30, label: "Idle a month+" },
];

/** The wizard's step names, as the phone's flow config keys them; the index when a key is unknown. */
function stepLabel(row: ListingDraftRow): string {
    const named: Record<string, string> = {
        "select-category": "Category",
        venue: "Venue",
        "spot-type": "Spot type",
        "spot-details": "Spot details",
        "more-info": "More info",
        "content-rules": "Content rules",
        pricing: "Pricing",
        documents: "Documents",
        review: "Review",
    };
    return (row.stepKey && named[row.stepKey]) ?? `Step ${row.stepIndex + 1}`;
}

const columns: ColumnDef<ListingDraftRow>[] = [
    {
        accessorKey: "displayId",
        header: "Reference",
        cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.displayId}</span>,
    },
    {
        accessorKey: "title",
        header: "Spot",
        cell: ({ row }) => (
            <div className="min-w-0">
                <div className="truncate text-sm text-foreground">{row.original.title ?? <span className="text-muted-foreground">Untitled</span>}</div>
                <div className="text-xs text-muted-foreground">{row.original.category ? row.original.category[0]!.toUpperCase() + row.original.category.slice(1) : "No category yet"}</div>
            </div>
        ),
    },
    {
        id: "publisher",
        header: "Publisher",
        cell: ({ row }) => (
            <div className="min-w-0">
                <Link href={`/publishers/${row.original.publisher.id}`} className="inline-flex items-center gap-1 text-sm text-foreground hover:underline">
                    <span className="truncate">{row.original.publisher.name}</span>
                    <VerifiedTick kycStatus={row.original.publisher.kycStatus} size={12} />
                </Link>
                <div className="text-xs text-muted-foreground">
                    <a href={`tel:${row.original.publisher.mobile}`} className="hover:underline">
                        {row.original.publisher.mobile}
                    </a>
                    {row.original.publisher.city ? ` · ${row.original.publisher.city}` : ""}
                </div>
            </div>
        ),
    },
    {
        id: "step",
        header: "Stopped at",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{stepLabel(row.original)}</span>,
    },
    {
        accessorKey: "idleDays",
        header: ({ column }) => <SortableHeader column={column}>Idle</SortableHeader>,
        cell: ({ row }) => (
            <span className={cn("text-xs", row.original.idleDays >= 7 ? "font-medium text-amber-700" : "text-muted-foreground")}>
                {row.original.idleDays === 0 ? "Today" : `${row.original.idleDays} day${row.original.idleDays === 1 ? "" : "s"}`}
            </span>
        ),
    },
    {
        accessorKey: "updatedAt",
        header: ({ column }) => <SortableHeader column={column}>Last saved</SortableHeader>,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.original.updatedAt)}</span>,
    },
];

export function DraftsView({
    page,
    idle,
    onIdleChange,
    q,
    onQueryChange,
}: {
    page: ListingDraftsPage;
    idle: IdleChip;
    onIdleChange: (idle: IdleChip) => void;
    q: string;
    onQueryChange: (q: string) => void;
}) {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Listing drafts"
                subtitle="Spots publishers started on their phones and saved to finish later. Oldest untouched first — the call list for sales and onboarding. A finished draft becomes the listing under the same reference."
            />

            <div>
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    {IDLE_CHIPS.map((chip) => (
                        <button
                            key={chip.value}
                            type="button"
                            onClick={() => onIdleChange(chip.value)}
                            className={cn(
                                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                idle === chip.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {chip.label}
                        </button>
                    ))}
                    <Input
                        value={q}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder="Search by reference, spot, publisher or number"
                        className="ml-auto h-8 w-full max-w-xs text-xs"
                        aria-label="Search drafts"
                    />
                </div>
                <DataTable
                    columns={columns}
                    data={page.items}
                    showColumnToggle={false}
                    showPagination={page.items.length > 20}
                    initialPageSize={20}
                    emptyState={
                        <EmptyState
                            icon={FilePenLine}
                            title={q.trim() ? "Nothing matches that" : idle > 0 ? "No drafts idle that long" : "No drafts yet"}
                            description={q.trim() ? "Try a wider search." : "A publisher who taps “Save & finish later” in the listing flow appears here."}
                        />
                    }
                />
                {page.total > page.items.length ? (
                    <p className="pt-2 text-xs text-muted-foreground">{`Showing ${page.items.length} of ${page.total}. Narrow with the chips or the search.`}</p>
                ) : null}
            </div>
        </div>
    );
}
