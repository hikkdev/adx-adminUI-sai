"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Wallet } from "lucide-react";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { compareMoney, formatDate, formatMoney, sumMoney } from "@/lib/format";
import {
    SIZE_BAND_LABEL,
    WALLET_KIND_LABEL,
    shortId,
    type WalletKind,
    type WalletRow,
} from "@/services/finance";
import type { StatusMeta } from "@/types";

interface WalletsTableProps {
    wallets: WalletRow[];
    kind: WalletKind | "ALL";
    onKindChange: (kind: WalletKind | "ALL") => void;
}

/**
 * Every wallet on the platform, filtered by whose it is.
 *
 * The filter is a round trip rather than a client-side predicate because the
 * endpoint takes `kind` and caps its answer at 200 rows: filtering after the
 * cap would quietly hide agents behind a page of publishers.
 *
 * Three kinds of wallet with three different economics sit in this one list,
 * which is why the kind is a column and not just a filter. A publisher wallet
 * fills up daily and empties by withdrawal; an agent wallet fills by incentive;
 * an advertiser wallet only ever receives credits and refunds and cannot be
 * topped up at all.
 */

const KIND_META: Record<WalletKind, StatusMeta> = {
    PUBLISHER: { label: "Publisher", tone: "info" },
    AGENT: { label: "Agent", tone: "neutral" },
    ADVERTISER: { label: "Advertiser", tone: "warning" },
    /* Lot B (B4b): a payee with no sign-in. Credits arrive at cost approval;
       ops raises the withdrawal on its behalf. */
    PRINT_PARTNER: { label: "Print partner", tone: "neutral" },
};

export function WalletsTable({ wallets, kind, onKindChange }: WalletsTableProps) {
    const router = useRouter();

    /* Summed as paise, never as floats — these tiles are the first place a
       rounding error would show up and the last place anyone would look. */
    const totals = React.useMemo(
        () => ({
            balance: sumMoney(wallets.map((row) => row.balance)),
            goodwill: sumMoney(wallets.map((row) => row.goodwill)),
        }),
        [wallets]
    );

    const columns = React.useMemo<ColumnDef<WalletRow>[]>(
        () => [
            {
                id: "owner",
                accessorKey: "owner",
                header: ({ column }) => <SortableHeader column={column}>Party</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex min-w-0 items-center gap-2.5">
                        <InitialsAvatar name={row.original.owner} size="sm" />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{row.original.owner}</p>
                            <p className="truncate text-xs text-muted-foreground">
                                {/* An agent wallet joins no name, so the endpoint answers
                                    the literal "Agent". The wallet id keeps the rows
                                    distinguishable rather than pretending otherwise. */}
                                {row.original.displayId ?? shortId(row.original.id, "WLT-")}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "kind",
                accessorKey: "kind",
                header: "Kind",
                cell: ({ row }) => <StatusBadge status={KIND_META[row.original.kind]} />,
            },
            {
                id: "band",
                accessorKey: "sizeBand",
                header: "Band",
                cell: ({ row }) =>
                    row.original.sizeBand ? (
                        <span className="text-muted-foreground">
                            {SIZE_BAND_LABEL[row.original.sizeBand]}
                        </span>
                    ) : (
                        <span className="text-muted-foreground/60">—</span>
                    ),
            },
            {
                id: "balance",
                accessorKey: "balance",
                header: ({ column }) => <SortableHeader column={column}>Balance</SortableHeader>,
                sortingFn: (a, b) => compareMoney(a.original.balance, b.original.balance),
                cell: ({ row }) => (
                    <span className="font-medium tabular-nums">{formatMoney(row.original.balance)}</span>
                ),
            },
            {
                id: "goodwill",
                accessorKey: "goodwill",
                header: ({ column }) => <SortableHeader column={column}>Goodwill</SortableHeader>,
                sortingFn: (a, b) => compareMoney(a.original.goodwill, b.original.goodwill),
                cell: ({ row }) => (
                    <span className="tabular-nums text-muted-foreground">
                        {formatMoney(row.original.goodwill)}
                    </span>
                ),
            },
            {
                id: "lastActivityAt",
                accessorKey: "lastActivityAt",
                header: ({ column }) => <SortableHeader column={column}>Last activity</SortableHeader>,
                cell: ({ row }) =>
                    row.original.lastActivityAt ? (
                        <span className="text-muted-foreground">
                            {formatDate(row.original.lastActivityAt)}
                        </span>
                    ) : (
                        <span className="text-muted-foreground/60">Never used</span>
                    ),
            },
        ],
        []
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Wallets"
                subtitle="Every wallet ADX holds money in. Balances are settled money; goodwill can be spent on the platform and never withdrawn."
            />

            <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard
                    stat={{
                        id: "wallets-shown",
                        label: "Wallets shown",
                        value: String(wallets.length),
                        hint: kind === "ALL" ? "Across every kind" : `${WALLET_KIND_LABEL[kind]} wallets`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "settled-balance",
                        label: "Settled balance",
                        value: formatMoney(totals.balance),
                        hint: "What ADX owes these parties, cleared and pending together",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "goodwill-outstanding",
                        label: "Goodwill outstanding",
                        value: formatMoney(totals.goodwill),
                        hint: "Spendable on ADX, never payable out",
                    }}
                />
            </div>

            <FilterChips<WalletKind | "ALL">
                value={kind}
                onChange={onKindChange}
                chips={[
                    { value: "ALL", label: "All wallets" },
                    { value: "PUBLISHER", label: "Publishers" },
                    { value: "AGENT", label: "Agents" },
                    { value: "ADVERTISER", label: "Advertisers" },
                    { value: "PRINT_PARTNER", label: "Print partners" },
                ]}
            />

            <DataTable
                columns={columns}
                data={wallets}
                searchPlaceholder="Search by party or id…"
                initialPageSize={20}
                onRowClick={(row) => router.push(`/finance/wallets/${row.id}`)}
                emptyState={
                    <EmptyState
                        icon={Wallet}
                        title="No wallets here"
                        description="A wallet opens the first time a party earns, is credited or is refunded. Nothing has opened one under this filter yet."
                    />
                }
            />
        </div>
    );
}
