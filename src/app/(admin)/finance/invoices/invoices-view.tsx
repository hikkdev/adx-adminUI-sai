"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import {
    INVOICE_KIND_META,
    INVOICE_KINDS,
    INVOICE_STATUS_META,
    INVOICE_STATUSES,
    type InvoiceKind,
    type InvoiceRow,
    type InvoiceStatus,
    type LegalEntity,
    type ListPage,
} from "@/services/invoices";
import { GstinBanner } from "./gstin-banner";

export interface InvoiceFilter {
    status: InvoiceStatus | "ALL";
    kind: InvoiceKind | "ALL";
    q: string;
    page: number;
}

interface InvoicesViewProps {
    page: ListPage<InvoiceRow>;
    filter: InvoiceFilter;
    onFilterChange: (next: Partial<InvoiceFilter>) => void;
    /** Null while unread or unreadable; the banner only draws on a known empty GSTIN. */
    entity: LegalEntity | null;
}

/**
 * The register as DR 10 draws it — number, advertiser, taxable, GST, total,
 * due, status — with the two facets the backend indexes on above it.
 *
 * "GST 18%" on the frame became "GST": a line carries its own rate, a
 * package sale's differs from a fee's, and the column shows the invoice's
 * sum whatever the rates were. Export CSV is gone rather than faked: there
 * is no export route on this register.
 */
export function InvoicesView({ page, filter, onFilterChange, entity }: InvoicesViewProps) {
    const router = useRouter();
    const allCount = INVOICE_STATUSES.reduce((sum, status) => sum + (page.counts[status] ?? 0), 0);
    const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
    const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
    const to = Math.min(page.total, page.page * page.pageSize);
    const filtered = filter.q.trim() !== "" || filter.status !== "ALL" || filter.kind !== "ALL";

    return (
        <div className="space-y-5">
            <PageHeader title="Invoices" subtitle="GST invoices raised to advertisers" />

            <GstinBanner entity={entity} />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <FilterChips<InvoiceStatus | "ALL">
                    value={filter.status}
                    onChange={(status) => onFilterChange({ status })}
                    chips={[
                        { value: "ALL", label: "All", count: allCount },
                        ...INVOICE_STATUSES.map((status) => ({
                            value: status,
                            label: INVOICE_STATUS_META[status].label,
                            count: page.counts[status] ?? 0,
                        })),
                    ]}
                />
                <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
                <FilterChips<InvoiceKind | "ALL">
                    value={filter.kind}
                    onChange={(kind) => onFilterChange({ kind })}
                    chips={[
                        { value: "ALL", label: "Every kind" },
                        ...INVOICE_KINDS.map((kind) => ({
                            value: kind,
                            label: INVOICE_KIND_META[kind].label,
                        })),
                    ]}
                />
            </div>

            <div className="relative w-full sm:w-80">
                <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                />
                <Input
                    value={filter.q}
                    onChange={(event) => onFilterChange({ q: event.target.value })}
                    placeholder="Search number, advertiser or GSTIN"
                    className="h-9 bg-card pl-8"
                    aria-label="Search invoices"
                />
            </div>

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                {page.items.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-4 py-2.5 font-medium">Invoice</th>
                                    <th className="px-4 py-2.5 font-medium">Advertiser</th>
                                    <th className="px-4 py-2.5 font-medium">Kind</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Taxable</th>
                                    <th className="px-4 py-2.5 text-right font-medium">GST</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                                    <th className="px-4 py-2.5 font-medium">Due</th>
                                    <th className="px-4 py-2.5 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page.items.map((invoice) => (
                                    <tr
                                        key={invoice.id}
                                        className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                                        onClick={() => router.push(`/finance/invoices/${invoice.id}`)}
                                    >
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/finance/invoices/${invoice.id}`}
                                                className="font-medium text-foreground hover:underline"
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                {invoice.number}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {invoice.recipientName}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={INVOICE_KIND_META[invoice.kind]} />
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {formatMoney(invoice.taxableValue)}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                            {formatMoney(invoice.gstTotal)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                                            {formatMoney(invoice.total)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {invoice.dueAt ? formatDate(invoice.dueAt) : "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={INVOICE_STATUS_META[invoice.status]} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                        {filtered
                            ? "No invoices match this filter."
                            : "No invoices yet. One is issued the moment a campaign's hold is placed or a package sale is paid."}
                    </p>
                )}
            </Card>

            {page.total > page.pageSize && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>
                        {from}–{to} of {page.total}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={page.page <= 1}
                            onClick={() => onFilterChange({ page: page.page - 1 })}
                        >
                            Previous
                        </Button>
                        <span>
                            Page {page.page} of {pages}
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={page.page >= pages}
                            onClick={() => onFilterChange({ page: page.page + 1 })}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
