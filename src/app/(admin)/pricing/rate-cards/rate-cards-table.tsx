"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { RATE_CARD_STATUS_META, type RateCard } from "@/types";

interface RateCardsTableProps {
    rateCards: RateCard[];
    embedded?: boolean;
}

export function RateCardsTable({ rateCards, embedded }: RateCardsTableProps) {
    const router = useRouter();

    const columns = React.useMemo<ColumnDef<RateCard>[]>(
        () => [
            {
                id: "rate-card",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Rate card</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium text-foreground">{row.original.name}</p>
                        <p className="text-xs text-muted-foreground">{row.original.mediaType}</p>
                    </div>
                ),
            },
            {
                id: "version",
                accessorKey: "version",
                header: "Version",
                cell: ({ row }) => `v${row.original.version}`,
            },
            {
                id: "coverage",
                accessorKey: "coverage",
                header: "Coverage",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.coverage}</span>
                ),
            },
            {
                id: "effective-from",
                accessorKey: "effectiveFrom",
                header: "Effective from",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.effectiveFrom}</span>
                ),
            },
            {
                id: "effective-to",
                accessorKey: "effectiveTo",
                header: "Effective to",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.effectiveTo}</span>
                ),
            },
            {
                id: "sites",
                accessorKey: "sitesPriced",
                header: ({ column }) => <SortableHeader column={column}>Sites priced</SortableHeader>,
                cell: ({ row }) =>
                    row.original.sitesPriced > 0 ? row.original.sitesPriced : "Not applied yet",
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={RATE_CARD_STATUS_META[row.original.status]} />
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-5">
            <PageHeader
                size={embedded ? "section" : "page"}
                title="Rate cards"
                subtitle="Versioned base rates per city and media type"
                actions={
                    <Button onClick={() => toast.info("New cards start as drafts from the builder.")}>
                        <Plus className="mr-1.5 size-4" />
                        New rate card
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={rateCards}
                searchPlaceholder="Search rate cards"
                initialPageSize={10}
                onRowClick={(rateCard) => router.push(`/pricing/rate-cards/${rateCard.id}`)}
            />
        </div>
    );
}
