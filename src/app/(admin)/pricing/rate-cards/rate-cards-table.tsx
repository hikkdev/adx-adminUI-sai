"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { formatDate } from "@/lib/format";
import { RATE_CARD_STATE_META, rateCardService, type RateCard } from "@/services/rate-cards";

interface RateCardsTableProps {
    cards: RateCard[];
    embedded?: boolean;
    onChanged: () => void;
}

/**
 * The DR 10 rate-card register: one row a card, versioned, with what it covers
 * and when. Rows open the builder. The layout is the frame's; the rows are the
 * backend's, and only an ACTIVE row gates publishing.
 */
export function RateCardsTable({ cards, embedded, onChanged }: RateCardsTableProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);
    const [name, setName] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function create() {
        setBusy(true);
        try {
            const card = await rateCardService.create({ name: name.trim() });
            toast.success(`Created ${card.name} v${card.version} as a draft`);
            setCreating(false);
            setName("");
            onChanged();
            router.push(`/pricing/rate-cards/${card.id}`);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not create that card.");
        } finally {
            setBusy(false);
        }
    }

    const columns = React.useMemo<ColumnDef<RateCard>[]>(
        () => [
            {
                id: "rate-card",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Rate card</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium text-foreground">{row.original.name}</p>
                        <p className="text-xs text-muted-foreground">
                            Floor {(Number(row.original.floorPct) * 100).toFixed(0)}% · rounds to ₹
                            {row.original.roundingRupees}
                        </p>
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
                accessorFn: (card) => card.cityName ?? "All cities",
                header: "Coverage",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.cityName ?? "All cities"}
                    </span>
                ),
            },
            {
                id: "effective-from",
                accessorKey: "effectiveFrom",
                header: "Effective from",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.effectiveFrom
                            ? formatDate(row.original.effectiveFrom)
                            : "On approval"}
                    </span>
                ),
            },
            {
                id: "effective-to",
                accessorKey: "effectiveTo",
                header: "Effective to",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.effectiveTo ? formatDate(row.original.effectiveTo) : "Open-ended"}
                    </span>
                ),
            },
            {
                id: "sites",
                accessorFn: (card) => card.sitesPriced ?? 0,
                header: ({ column }) => <SortableHeader column={column}>Sites priced</SortableHeader>,
                cell: ({ row }) =>
                    row.original.sitesPriced && row.original.sitesPriced > 0
                        ? row.original.sitesPriced
                        : "Not applied yet",
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={RATE_CARD_STATE_META[row.original.status]} />
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
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 size-4" />
                        New rate card
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={cards}
                searchPlaceholder="Search rate cards"
                initialPageSize={10}
                onRowClick={(card) => router.push(`/pricing/rate-cards/${card.id}`)}
                emptyState={
                    <p className="py-10 text-center text-sm text-muted-foreground">
                        No rate cards yet. Until one is approved, nothing gates publishing and the
                        simulator has no base rate to trace from.
                    </p>
                }
            />

            <ConfirmDialog
                open={creating}
                onOpenChange={setCreating}
                title="New rate card"
                description="Cards are versioned by name. Reusing an existing name starts the next version of it."
                confirmLabel="Create draft"
                busy={busy}
                disabled={name.trim().length < 2}
                onConfirm={() => void create()}
            >
                <div className="space-y-1.5 pt-2">
                    <Label htmlFor="new-card-name">Name</Label>
                    <Input
                        id="new-card-name"
                        className="h-9"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Bengaluru Metro Premium"
                    />
                </div>
            </ConfirmDialog>
        </div>
    );
}
