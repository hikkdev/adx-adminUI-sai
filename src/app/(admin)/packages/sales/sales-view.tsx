"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { agentLabel, type AgentSummary } from "@/services/agents";
import {
    PACKAGE_SHELVES,
    PACKAGE_SHELF_LABEL,
    PACKAGE_SORTS,
    PACKAGE_SORT_LABEL,
    cycleLabel,
    packageSaleStatusMeta,
    type PackageShelf,
    type PackageSort,
    type Sale,
    type SalesPage,
} from "@/services/packages";
import { SALES_SUBTITLE, SALES_TITLE } from "./sales-loader";

interface SalesViewProps {
    page: SalesPage;
    q: string;
    onQChange: (q: string) => void;
    shelf: PackageShelf | "ALL";
    onShelfChange: (shelf: PackageShelf | "ALL") => void;
    sort: PackageSort;
    onSortChange: (sort: PackageSort) => void;
    pageNumber: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    /** The roster, for naming the agent on a row. */
    agents: AgentSummary[];
}

/** What to call the agent on a row: their name from the roster, else the id the sale carries. */
export function sellerLabel(sale: Pick<Sale, "agentId">, agents: Map<string, string>): string {
    if (!sale.agentId) return "Self-served";
    return agents.get(sale.agentId) ?? sale.agentId;
}

/** "Ends 1 Oct 2026", "Renews 1 Oct 2026", or a dash. The next billing wins when both are set. */
export function endsLabel(sale: Pick<Sale, "endsAt" | "nextBillingAt" | "status">): string {
    if (sale.status === "ACTIVE" && sale.nextBillingAt) return `Renews ${formatDate(sale.nextBillingAt)}`;
    if (sale.endsAt) return `Ends ${formatDate(sale.endsAt)}`;
    return "—";
}

/**
 * The package-sales desk — no DR 10 frame covers the console side (the
 * frame draws the agent's own book), so this is the console's list idiom
 * over `GET /packages/sales`: the shelf chips from the server's counts, a
 * search, a sort, and the server's pager.
 *
 * Every rupee figure is the decimal string off the wire, printed by
 * `formatMoney`. A commission of null — no PACKAGE_SOLD recorded — is drawn
 * as a dash, not as ₹0.00. A row opens nothing: there is no sale detail
 * screen in the console yet.
 */
export function SalesView({
    page,
    q,
    onQChange,
    shelf,
    onShelfChange,
    sort,
    onSortChange,
    pageNumber,
    onPageChange,
    pageSize,
    agents,
}: SalesViewProps) {
    /** Agent id → how the console says their name, with their AGT- id beside it. */
    const agentNames = React.useMemo(
        () =>
            new Map(
                agents.map((agent) => [agent.id, agent.displayId ? `${agentLabel(agent)} · ${agent.displayId}` : agentLabel(agent)]),
            ),
        [agents],
    );

    const columns = React.useMemo<ColumnDef<Sale>[]>(
        () => [
            {
                id: "reference",
                accessorKey: "reference",
                header: "Reference",
                cell: ({ row }) => <span className="font-mono text-xs text-foreground">{row.original.reference}</span>,
            },
            {
                id: "advertiser",
                accessorFn: (sale) => sale.advertiserName ?? "",
                header: "Advertiser",
                cell: ({ row }) => <span className="font-medium text-foreground">{row.original.advertiserName ?? row.original.advertiserId}</span>,
            },
            {
                id: "package",
                accessorKey: "packageName",
                header: "Package",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="text-foreground">{row.original.packageName}</p>
                        <p className="text-xs text-muted-foreground">
                            {row.original.months} {row.original.months === 1 ? "month" : "months"}
                        </p>
                    </div>
                ),
            },
            {
                id: "cycle",
                accessorKey: "cycle",
                header: "Cycle",
                cell: ({ row }) => <span className="text-muted-foreground">{cycleLabel(row.original.cycle)}</span>,
            },
            {
                id: "perMonth",
                accessorKey: "pricePerMonth",
                header: "₹ / month",
                cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.pricePerMonth)}</span>,
            },
            {
                id: "total",
                accessorKey: "total",
                header: "Total",
                cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.total)}</span>,
            },
            {
                id: "commission",
                accessorFn: (sale) => sale.commission ?? "",
                header: "Commission",
                cell: ({ row }) => (
                    <span className="tabular-nums text-muted-foreground">
                        {/* Null is "nothing recorded", which is not ₹0.00. */}
                        {row.original.commission === null ? "—" : formatMoney(row.original.commission)}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={packageSaleStatusMeta(row.original.status)} />,
            },
            {
                id: "starts",
                accessorFn: (sale) => sale.startsAt ?? "",
                header: "Starts",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {row.original.startsAt ? formatDate(row.original.startsAt) : "—"}
                    </span>
                ),
            },
            {
                id: "ends",
                accessorFn: (sale) => sale.nextBillingAt ?? sale.endsAt ?? "",
                header: "Ends / next billing",
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{endsLabel(row.original)}</span>,
            },
            {
                id: "agent",
                accessorFn: (sale) => sale.agentId ?? "",
                header: "Agent",
                cell: ({ row }) => <span className="text-muted-foreground">{sellerLabel(row.original, agentNames)}</span>,
            },
        ],
        [agentNames],
    );

    /* The chip counts come from the server, computed without the shelf in
       force. They do not sum to `total` under "All": a pending or cancelled
       sale is on no shelf, so "All" carries no count of its own. */
    const chips: FilterChip<PackageShelf | "ALL">[] = [
        { value: "ALL", label: "All" },
        ...PACKAGE_SHELVES.map((value) => ({ value, label: PACKAGE_SHELF_LABEL[value], count: page.counts[value] })),
    ];

    const from = page.total === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
    const to = Math.min(pageNumber * pageSize, page.total);
    const lastPage = Math.max(1, Math.ceil(page.total / pageSize));

    return (
        <div className="space-y-5">
            <PageHeader
                title={SALES_TITLE}
                subtitle={
                    page.total === 0
                        ? SALES_SUBTITLE
                        : `${formatNumber(page.total)} ${page.total === 1 ? "sale" : "sales"}${shelf === "ALL" ? "" : ` ${PACKAGE_SHELF_LABEL[shelf].toLowerCase()}`}${q.trim() ? ` matching “${q.trim()}”` : ""} · ${page.counts.EXPIRING} expiring within two weeks`
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder="Search advertiser, reference or package"
                        aria-label="Search sales"
                        className="h-9 w-[280px] bg-card pl-8"
                    />
                </div>
                <Select value={sort} onValueChange={(value) => onSortChange(value as PackageSort)}>
                    <SelectTrigger className="h-9 w-[220px] bg-card" aria-label="Sort">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PACKAGE_SORTS.map((value) => (
                            <SelectItem key={value} value={value}>
                                {PACKAGE_SORT_LABEL[value]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <FilterChips chips={chips} value={shelf} onChange={onShelfChange} />

            <DataTable
                columns={columns}
                data={page.items}
                showColumnToggle={false}
                showPagination={false}
                emptyState={
                    <EmptyState
                        icon={Package}
                        title={q.trim() || shelf !== "ALL" ? "No sales match" : "No sales yet"}
                        description={
                            q.trim() || shelf !== "ALL"
                                ? "Clear the search or pick another shelf to see the rest."
                                : "A sale is recorded the moment an agent sends a payment link or an advertiser buys a plan themselves."
                        }
                    />
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                    {from}-{to} of {formatNumber(page.total)}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1}>
                        Previous
                    </Button>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">
                        {pageNumber}
                    </span>
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber + 1)} disabled={pageNumber >= lastPage}>
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
}
