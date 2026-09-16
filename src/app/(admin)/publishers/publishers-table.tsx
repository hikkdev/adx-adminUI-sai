"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { KYC_TONE, kycLabel, type RosterPublisher } from "@/services/supply";
import { CreatePublisherDialog } from "./create-publisher-dialog";

interface PublishersTableProps {
    publishers: RosterPublisher[];
    onChanged: () => void;
}

/** The KYC states a publisher record can be in, as the API words them. */
const KYC_FILTERS = ["VERIFIED", "SUBMITTED", "UNDER_REVIEW", "REJECTED", "PENDING", "NOT_STARTED"];

export function PublishersTable({ publishers, onChanged }: PublishersTableProps) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = React.useState(false);
    const [kycFilter, setKycFilter] = React.useState<string>("all");

    const filtered = React.useMemo(
        () =>
            kycFilter === "all"
                ? publishers
                : publishers.filter((publisher) => publisher.kycStatus === kycFilter),
        [publishers, kycFilter]
    );

    const columns = React.useMemo<ColumnDef<RosterPublisher>[]>(
        () => [
            selectionColumn<RosterPublisher>(),
            {
                id: "name",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} size="sm" />
                        <div className="min-w-0">
                            <span className="font-medium text-foreground">{row.original.name}</span>
                            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                {row.original.displayId ?? "No identifier yet"}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "contact",
                accessorKey: "mobile",
                header: "Mobile",
                cell: ({ row }) => (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {row.original.mobile}
                    </span>
                ),
            },
            {
                id: "city",
                accessorFn: (publisher) => publisher.city ?? "",
                header: "City",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.city ?? "—"}</span>
                ),
            },
            {
                id: "arrived",
                accessorFn: (publisher) => (publisher.onboardedByAgent ? "Agent" : "Self-serve"),
                header: "Arrived",
                cell: ({ row }) => (
                    // DR 08 lets a publisher sign up with no agent at all, and
                    // which way they arrived decides who chases their paperwork.
                    <span className="text-muted-foreground">
                        {row.original.onboardedByAgent ? "Onboarded by agent" : "Self-serve"}
                    </span>
                ),
            },
            {
                id: "sites",
                accessorKey: "listingCount",
                header: ({ column }) => <SortableHeader column={column}>Spots</SortableHeader>,
                cell: ({ row }) => (
                    <span className="tabular-nums">{row.original.listingCount}</span>
                ),
            },
            {
                id: "kyc-status",
                accessorKey: "kycStatus",
                header: "KYC status",
                cell: ({ row }) => (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                            status={{
                                label: kycLabel(row.original.kycStatus),
                                tone: KYC_TONE[row.original.kycStatus] ?? "neutral",
                            }}
                        />
                        {/* Lot A: a publisher stays KYC-verified while suspended; the chip says which. */}
                        <SuspendedChip scopes={row.original.suspensionScopes} />
                    </span>
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                size: 48,
                cell: ({ row }) => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">Row actions</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            {/* "Send KYC reminder", "Suspend account" and "Export
                                CSV" used to live here and each only fired a
                                success toast — no endpoint, nothing written.
                                They are gone rather than left looking real;
                                what remains navigates somewhere that acts. */}
                            <DropdownMenuItem
                                onSelect={() => router.push(`/publishers/${row.original.id}`)}
                            >
                                View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push(`/kyc/${row.original.id}`)}>
                                Review KYC
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
            },
        ],
        [router]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Publishers"
                subtitle={`${publishers.length} on the marketplace`}
                actions={
                    <>
                        {/* Lot D (Q43): the legacy book as CSV — validated, then committed. */}
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/publishers/import">Import publishers</Link>
                        </Button>
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="mr-1.5 size-4" />
                            Add publisher
                        </Button>
                    </>
                }
            />

            <DataTable
                columns={columns}
                data={filtered}
                searchPlaceholder="Search publishers, identifier, city"
                initialPageSize={10}
                onRowClick={(publisher) => router.push(`/publishers/${publisher.id}`)}
                toolbar={
                    <Select value={kycFilter} onValueChange={setKycFilter}>
                        <SelectTrigger className="h-9 w-[190px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">KYC: All</SelectItem>
                            {KYC_FILTERS.map((status) => (
                                <SelectItem key={status} value={status}>
                                    {kycLabel(status)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
                emptyState={
                    <EmptyState
                        icon={Tag}
                        title="No publishers yet"
                        description="Publishers appear here once they sign up or an agent onboards them."
                        action={
                            <Button onClick={() => setCreateOpen(true)}>
                                <Plus className="mr-1.5 size-4" />
                                Add publisher
                            </Button>
                        }
                    />
                }
            />

            <CreatePublisherDialog
                open={createOpen}
                onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) onChanged();
                }}
            />
        </div>
    );
}
