"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { VerifiedTick } from "@/components/adx/verified-tick";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { formatDate } from "@/lib/format";
import { ADVERTISER_TYPE_LABELS, ONBOARDING_SOURCE_LABEL, onboardingLine, type OnboardingSource } from "@/types";
import { ADVERTISER_STATUS_META, type Advertiser } from "@/types";
import { CreateAdvertiserDialog } from "./create-advertiser-dialog";

interface AdvertisersTableProps {
    advertisers: Advertiser[];
    /** Re-read after an account is opened from the desk. */
    onChanged: () => void;
}

export function AdvertisersTable({ advertisers, onChanged }: AdvertisersTableProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);
    /** QR-15: the roster cut by the door the account came through; "all" is every door. */
    const [doorFilter, setDoorFilter] = React.useState<string>("all");
    const rows = React.useMemo(
        () => advertisers.filter((advertiser) => doorFilter === "all" || (advertiser.onboarding?.via ?? null) === doorFilter),
        [advertisers, doorFilter],
    );

    const columns = React.useMemo<ColumnDef<Advertiser>[]>(
        () => [
            selectionColumn<Advertiser>(),
            {
                id: "brand",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Brand</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} size="sm" />
                        <div>
                            <p className="inline-flex items-center gap-1.5 font-medium text-foreground">
                                {row.original.name}
                                <VerifiedTick kycStatus={row.original.kycStatus} />
                            </p>
                            {row.original.displayId ? (
                                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                    {row.original.displayId}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {row.original.companyName ?? ADVERTISER_TYPE_LABELS[row.original.type]}
                                </p>
                            )}
                        </div>
                    </div>
                ),
            },
            {
                id: "contact",
                accessorKey: "contact",
                header: "Contact",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.contact}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={ADVERTISER_STATUS_META[row.original.status]} />
                        <SuspendedChip scopes={row.original.suspensionScopes} />
                    </span>
                ),
            },
            /*
             * "Active campaigns", "Total spend" and "Last campaign activity"
             * used to sit here. There is no campaign table to count, no
             * aggregate that computes spend, and nothing tracks last activity —
             * so each was a number about somebody's business that nothing
             * checked. These three the API can actually answer.
             */
            {
                id: "type",
                accessorKey: "type",
                header: "Type",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {ADVERTISER_TYPE_LABELS[row.original.type]}
                    </span>
                ),
            },
            {
                id: "city",
                accessorKey: "city",
                header: "City",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.city ?? "—"}</span>
                ),
            },
            {
                id: "joined",
                accessorKey: "joinedAt",
                header: ({ column }) => <SortableHeader column={column}>Joined</SortableHeader>,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {formatDate(row.original.joinedAt)}
                    </span>
                ),
            },
            {
                /* QR-14/15: the door the account came through, and who opened it. */
                id: "onboarded",
                header: "Onboarded",
                cell: ({ row }) => <span className="text-muted-foreground">{onboardingLine(row.original.onboarding)}</span>,
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
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                                onSelect={() => router.push(`/advertisers/${row.original.id}`)}
                            >
                                View details
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
                title="Advertisers"
                actions={
                    /* Wired to `POST /advertisers { onBehalf: true }` — the
                       same route the field app uses to open an account at
                       the door — rather than the toast that used to say
                       advertisers join elsewhere. */
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 size-4" />
                        Onboard an advertiser
                    </Button>
                }
            />
            <CreateAdvertiserDialog open={creating} onOpenChange={setCreating} onCreated={onChanged} />
            <div className="flex items-center gap-2">
                <Select value={doorFilter} onValueChange={setDoorFilter}>
                    <SelectTrigger className="h-9 w-[190px]" aria-label="Onboarded via">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Every door</SelectItem>
                        {(Object.keys(ONBOARDING_SOURCE_LABEL) as OnboardingSource[]).map((door) => (
                            <SelectItem key={door} value={door}>
                                {ONBOARDING_SOURCE_LABEL[door]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <DataTable
                columns={columns}
                data={rows}
                searchPlaceholder="Search advertisers, brand, contact"
                initialPageSize={10}
                onRowClick={(advertiser) => router.push(`/advertisers/${advertiser.id}`)}
            />
        </div>
    );
}
