"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { RosterRowMenu } from "@/components/adx/party-roster-columns";
import { RosterSearch, StatusSelect } from "@/components/adx/party-roster-filter-bar";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    REVIEW_FILTER_OPTIONS,
    REVIEW_SORTS,
    REVIEW_SORT_LABEL,
    REVIEW_STATE_META,
    RISK_BAND_META,
    reviewSkip,
    reviewStateOf,
    riskPercent,
    whyLine,
    type ReviewAction,
    type ReviewFilter,
    type ReviewPage,
    type ReviewSort,
} from "@/services/order-screening";
import { ORDER_STATUS_META, type Order, type OrderScreening } from "@/types";
import { useOrderReview } from "../order-review-actions";
import { ServerPager } from "@/components/adx/server-pager";
import { placedByColumn, placedOnColumn, siteColumn, valueColumn } from "../orders-table";

/** Whether screening is on and whether it may hold on its own — from Settings › Fraud; null when unread. */
export type ScreeningMode = { enabled: boolean; autoHold: boolean } | null;

interface FraudReviewTableProps {
    page: ReviewPage;
    q: string;
    onQChange: (q: string) => void;
    status: ReviewFilter;
    onStatusChange: (status: ReviewFilter) => void;
    sort: ReviewSort;
    onSortChange: (sort: ReviewSort) => void;
    pageNumber: number;
    onPageChange: (page: number) => void;
    pageSize: number;
    mode: ScreeningMode;
    onChanged: () => void;
}

/** The watch-mode line, word for word — the owner's decision of 2 Oct 2026 made visible. */
export const WATCH_MODE_NOTICE =
    "Watch mode — orders are flagged for review but never paused automatically. Turn on automatic holds in Settings › Fraud once the flags look right.";

const BAR_TONE: Record<NonNullable<OrderScreening["band"]>, string> = {
    LOW: "bg-success",
    REVIEW: "bg-warning",
    HOLD: "bg-danger",
};

/** The Risk cell: the score as a 0–100 bar and number, and the band pill. */
export function RiskCell({ screening }: { screening: OrderScreening | null | undefined }) {
    const percent = riskPercent(screening?.score);
    if (percent === null) return <span className="text-muted-foreground">Not scored</span>;
    const band = screening?.band ?? null;
    return (
        <div className="flex items-center gap-2" data-testid="order-risk">
            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className={cn("h-full rounded-full", band ? BAR_TONE[band] : "bg-muted-foreground/50")} style={{ width: `${percent}%` }} />
            </div>
            <span className="w-7 text-right text-sm font-medium tabular-nums text-foreground">{percent}</span>
            {band && <StatusBadge status={RISK_BAND_META[band]} />}
        </div>
    );
}

/** The Why cell: the two strongest signals in plain words, "+N more" after. */
export function WhyCell({ screening }: { screening: OrderScreening | null | undefined }) {
    const { words, more } = whyLine(screening);
    if (words.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
        <div className="max-w-[260px] text-sm" data-testid="order-why">
            {words.map((line) => (
                <p key={line} className="truncate text-foreground" title={line}>
                    {line}
                </p>
            ))}
            {more > 0 && <p className="text-xs text-muted-foreground">+{more} more</p>}
        </div>
    );
}

/** The bulk bar's four moves, in the contract's order. */
const BULK: { action: ReviewAction; label: string; destructive?: boolean }[] = [
    { action: "HOLD", label: "Hold selected" },
    { action: "RELEASE", label: "Release selected" },
    { action: "CLEAR", label: "Clear selected" },
    { action: "CONFIRM_FRAUD", label: "Cancel as fraud…", destructive: true },
];

/**
 * Orders › Fraud review — order screening, 2 Oct 2026.
 *
 * The orders the automatic score flagged, in the one table layout: the
 * shared filter bar (search, the Status select with its counts, the sort),
 * the DataTable with its checkboxes, Columns menu and bulk bar, the
 * rosters' row menu, and the list's pager. "Order · placed", "Placed by",
 * "Site" and "Value" are the list's own columns; Risk, Why and the review
 * Status are this tab's. A row opens the order.
 *
 * Watch mode first: while automatic holds are off a notice says so, and a
 * hold is always somebody's click.
 */
export function FraudReviewTable({
    page,
    q,
    onQChange,
    status,
    onStatusChange,
    sort,
    onSortChange,
    pageNumber,
    onPageChange,
    pageSize,
    mode,
    onChanged,
}: FraudReviewTableProps) {
    const router = useRouter();
    const review = useOrderReview(onChanged);
    const { menu } = review;

    const columns = React.useMemo<ColumnDef<Order>[]>(
        () => [
            placedOnColumn<Order>(false),
            placedByColumn<Order>(),
            siteColumn<Order>(),
            valueColumn<Order>(),
            {
                id: "risk",
                accessorFn: (order) => order.screening?.score ?? -1,
                header: "Risk",
                cell: ({ row }) => <RiskCell screening={row.original.screening} />,
            },
            {
                id: "why",
                accessorFn: (order) => whyLine(order.screening).words.join(" "),
                header: "Why",
                cell: ({ row }) => <WhyCell screening={row.original.screening} />,
            },
            {
                id: "status",
                accessorFn: (order) => reviewStateOf(order.screening),
                header: "Status",
                cell: ({ row }) => {
                    const state = reviewStateOf(row.original.screening);
                    return (
                        <span title={state === "HELD" ? (row.original.screening?.holdReason ?? undefined) : undefined} data-testid="order-review-status">
                            <StatusBadge status={REVIEW_STATE_META[state]} />
                        </span>
                    );
                },
            },
            {
                /* The order's own stage, one click away in the Columns menu. */
                id: "order-status",
                accessorFn: (order) => order.status,
                header: "Order status",
                cell: ({ row }) => <StatusBadge status={ORDER_STATUS_META[row.original.status]} />,
            },
            {
                id: "actions",
                header: () => <span className="sr-only">Actions</span>,
                cell: ({ row }) => <RosterRowMenu entries={menu(row.original)} />,
                enableHiding: false,
                size: 48,
            },
        ],
        [menu],
    );

    const counts = page.counts;
    const filterLabel = REVIEW_FILTER_OPTIONS.find((option) => option.value === status)?.label ?? "";
    const flagged = counts.FLAGGED;
    const held = counts.HELD;
    const subtitle =
        flagged === undefined && held === undefined
            ? "Orders the automatic score flagged, for a person to look at"
            : `${formatNumber(flagged ?? 0)} flagged · ${formatNumber(held ?? 0)} held${status === "FLAGGED" || status === "ALL" ? "" : `, showing ${filterLabel.toLowerCase()}`}${q.trim() ? ` matching “${q.trim()}”` : ""}`;
    const filtered = q.trim() !== "" || status !== "FLAGGED";

    return (
        <div className="space-y-5">
            <PageHeader
                title="Fraud review"
                subtitle={subtitle}
                actions={
                    <Button asChild variant="outline" className="bg-card">
                        <Link href="/settings/fraud">
                            <Settings2 className="mr-1.5 size-4" aria-hidden />
                            Screening settings
                        </Link>
                    </Button>
                }
            />

            {mode && !mode.enabled && (
                <Card className="flex items-start gap-3 rounded-lg border-border bg-muted/40 p-4 shadow-none" data-testid="screening-off">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="text-sm text-foreground">Screening is off — new orders are not scored. Turn it on in Settings › Fraud.</p>
                </Card>
            )}
            {mode && mode.enabled && !mode.autoHold && (
                <Card className="flex items-start gap-3 rounded-lg border-info/40 bg-info-soft p-4 shadow-none" data-testid="watch-mode">
                    <Eye className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                    <p className="text-sm text-foreground">{WATCH_MODE_NOTICE}</p>
                </Card>
            )}

            <DataTable
                columns={columns}
                data={page.items}
                toolbar={
                    <div className="flex flex-1 flex-wrap items-center gap-2" data-testid="fraud-review-filters">
                        <RosterSearch value={q} onChange={onQChange} placeholder="Search order, advertiser, site or city" />
                        <StatusSelect options={REVIEW_FILTER_OPTIONS} value={status} counts={counts} onChange={(value) => onStatusChange(value as ReviewFilter)} />
                        <Select value={sort} onValueChange={(value) => onSortChange(value as ReviewSort)}>
                            <SelectTrigger className="h-9 w-[200px] bg-card" aria-label="Sort">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {REVIEW_SORTS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {REVIEW_SORT_LABEL[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                }
                initialColumnVisibility={{ "order-status": false }}
                showPagination={false}
                getRowId={(order) => order.id}
                onRowClick={(order) => router.push(`/orders/${order.id}`)}
                bulkActions={(selected, _clear, keep) =>
                    BULK.map(({ action, label, destructive }) => {
                        const permission = review.permissionBlock(action);
                        const none = selected.every((row) => reviewSkip(action, row) !== null);
                        return (
                            <Button
                                key={action}
                                variant="outline"
                                size="sm"
                                className={cn("h-8 bg-card", destructive && "text-danger hover:text-danger")}
                                disabled={permission !== null || none}
                                title={permission ?? (none ? "None of the selected orders can take this." : undefined)}
                                onClick={() => review.start(action, selected, keep)}
                                data-testid={`bulk-${action.toLowerCase().replace(/_/g, "-")}`}
                            >
                                {label}
                            </Button>
                        );
                    })
                }
                emptyState={
                    <EmptyState
                        icon={ShieldCheck}
                        title={filtered ? "No orders match" : "Nothing flagged"}
                        description={
                            filtered
                                ? "Clear the search or pick another status to see the rest."
                                : "When the score flags an order it appears here for a person to look at. Nothing is paused unless somebody holds it."
                        }
                    />
                }
            />

            <ServerPager total={page.total} pageNumber={pageNumber} pageSize={pageSize} onPageChange={onPageChange} />

            {review.dialogs}
        </div>
    );
}
