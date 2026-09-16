"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/adx/kpi-card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { DailyGmvChart, MoneySeriesChart, OnboardingChart } from "@/components/charts/lazy";
import type { OnboardingLine } from "@/components/charts/analytics-charts";
import { formatMoney, formatNumber, formatPct } from "@/lib/format";
import type { ApiResource } from "@/lib/use-api-resource";
import {
    BREAKDOWN_DIMENSIONS,
    BREAKDOWN_DIMENSION_LABEL,
    LISTING_CATEGORY_LABEL,
    analyticsTilesOf,
    breakdownSortState,
    foldDailySeries,
    nextBreakdownSort,
    seriesCardsFor,
    serverDelta,
    type AnalyticsSeries,
    type AnalyticsTiles,
    type BreakdownColumn,
    type BreakdownDimension,
    type BreakdownPage,
    type BreakdownRow,
    type BreakdownSort,
    type Delta,
    type ListingCategory,
    type SeriesCard,
} from "@/services/overview";

/* ------------------------------------------------------------------ */
/* The tiles                                                           */
/* ------------------------------------------------------------------ */

export function AnalyticsTilesRow({ tiles, rangeLabel }: { tiles: ApiResource<AnalyticsTiles>; rangeLabel: string }) {
    return (
        <ResourceBoundary resource={tiles}>
            {(data) => (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {analyticsTilesOf(data, rangeLabel).map((stat) => (
                        <KpiCard key={stat.id} stat={stat} />
                    ))}
                </div>
            )}
        </ResourceBoundary>
    );
}

/* ------------------------------------------------------------------ */
/* Daily GMV                                                           */
/* ------------------------------------------------------------------ */

function PeriodLegend() {
    return (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-primary" />
                This period
            </span>
            <span className="flex items-center gap-1.5">
                <svg width="16" height="2" aria-hidden className="text-muted-foreground/70">
                    <line x1="0" y1="1" x2="16" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
                </svg>
                Previous
            </span>
        </div>
    );
}

/**
 * The frame's big card: the daily curve with the previous period dotted
 * beside it. A week or month granularity is the same card with fewer
 * points; the loader picks the granularity from the window's length.
 */
export function DailyGmvCard({ series, granularityLabel }: { series: ApiResource<AnalyticsSeries>; granularityLabel: string }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-foreground">{granularityLabel} GMV (₹)</h2>
                    {series.data ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatMoney(series.data.totals.gmvRecognised)} this period · {formatMoney(series.data.previous.totals.gmvRecognised)} the
                            period before
                            {series.data.gmvSource === "ACCRUAL_GROSS" ? " · the accrual's gross, no spend leg posted yet" : ""}
                        </p>
                    ) : null}
                </div>
                <PeriodLegend />
            </div>
            <div className="mt-4">
                <ResourceBoundary resource={series}>
                    {(data) => <DailyGmvChart data={foldDailySeries(data)} />}
                </ResourceBoundary>
            </div>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* GMV by category and Top publishers                                  */
/* ------------------------------------------------------------------ */

/** The frame's bars: each category's GMV against the biggest, with the figure on the right. */
export function CategoryBarsCard({ categories }: { categories: ApiResource<BreakdownPage> }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h2 className="text-base font-semibold text-foreground">GMV by category</h2>
            <div className="mt-4">
                <ResourceBoundary resource={categories}>
                    {(page) => {
                        const rows = page.items;
                        if (rows.length === 0) {
                            return <p className="text-sm text-muted-foreground">No GMV was recognised in this window.</p>;
                        }
                        const max = Math.max(...rows.map((row) => Number(row.sharePct) || 0), 0);
                        return (
                            <ul className="space-y-4">
                                {rows.map((row) => {
                                    const share = Number(row.sharePct) || 0;
                                    const width = max > 0 ? Math.max(1.5, (share / max) * 100) : 0;
                                    return (
                                        <li key={row.key}>
                                            <div className="flex items-center justify-between text-sm">
                                                <Link href={row.href} className="font-medium text-foreground underline-offset-4 hover:underline">
                                                    {LISTING_CATEGORY_LABEL[row.label as ListingCategory] ?? row.label}
                                                </Link>
                                                <span className="tabular-nums text-muted-foreground">
                                                    {formatMoney(row.gmvRecognised)}
                                                    <span className="ml-1.5 text-xs">({formatPct(row.sharePct)})</span>
                                                </span>
                                            </div>
                                            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} aria-hidden />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        );
                    }}
                </ResourceBoundary>
            </div>
        </Card>
    );
}

/**
 * The frame's ranking: `by=publisher` at the default sort, the first five.
 * G11-1: the frame's per-publisher change against last period is the row's
 * own `deltaPct` over `previous` (the same window shifted back by its own
 * length) — "new this period" when there was nothing then. The city under
 * the name has no source on a breakdown row and is not drawn; the share of
 * the window's GMV, which the row does carry, stands beside the figure.
 */
export function TopPublishersCard({ publishers, onSeeAll }: { publishers: ApiResource<BreakdownPage>; onSeeAll: () => void }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">Top publishers</h2>
                <Button variant="ghost" size="sm" className="h-8" onClick={onSeeAll}>
                    See all
                </Button>
            </div>
            <div className="mt-2">
                <ResourceBoundary resource={publishers}>
                    {(page) =>
                        page.items.length === 0 ? (
                            <p className="mt-2 text-sm text-muted-foreground">No publisher earned anything in this window.</p>
                        ) : (
                            <ol className="divide-y">
                                {page.items.map((row, index) => (
                                    <li key={row.key} className="flex items-center gap-3 py-3">
                                        <span className="w-5 text-sm text-muted-foreground">{index + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <Link href={row.href} className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline">
                                                {row.label}
                                            </Link>
                                            <p className="text-xs text-muted-foreground">
                                                {formatNumber(row.bookingsCount)} {row.bookingsCount === 1 ? "booking" : "bookings"} · {formatPct(row.sharePct)} of GMV
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold tabular-nums text-foreground">{formatMoney(row.gmvRecognised)}</p>
                                            <RowDelta row={row} />
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )
                    }
                </ResourceBoundary>
            </div>
        </Card>
    );
}

/**
 * G11-1: a breakdown row's movement against the previous window. Nothing on
 * a backend that does not serve `previous`; "new this period" when the
 * group had nothing then; the percentage otherwise, with the previous GMV
 * as the title.
 */
function RowDelta({ row }: { row: BreakdownRow }) {
    if (row.previous === undefined) return null;
    if (row.previous === null) return <p className="text-xs text-muted-foreground">new this period</p>;
    const delta = serverDelta(row.deltaPct);
    if (!delta) return <p className="text-xs text-muted-foreground">from {formatMoney(row.previous.gmvRecognised)}</p>;
    return (
        <p className={cn("text-xs font-medium tabular-nums", deltaTone[delta.tone])} title={`${formatMoney(row.previous.gmvRecognised)} · ${formatNumber(row.previous.bookings)} bookings previously`}>
            {delta.text} vs previous
        </p>
    );
}

/* ------------------------------------------------------------------ */
/* The four series cards                                               */
/* ------------------------------------------------------------------ */

const deltaTone = { positive: "text-success", negative: "text-danger", neutral: "text-muted-foreground" } as const;

function DeltaText({ delta, className }: { delta: Delta | null; className?: string }) {
    if (!delta) return null;
    return <span className={cn("text-xs font-medium", deltaTone[delta.tone], className)}>{delta.text} vs previous</span>;
}

function SeriesCardBody({ card, series }: { card: SeriesCard; series: AnalyticsSeries }) {
    const data = foldDailySeries(series);
    if (card.kind === "ONBOARDING") {
        const lines: OnboardingLine[] = (card.counts ?? []).map((count) =>
            count.label === "Publishers" ? "publishersOnboarded" : count.label === "Advertisers" ? "advertisersOnboarded" : "agentsActivated"
        );
        return (
            <>
                <dl className="mt-3 grid grid-cols-3 gap-3">
                    {(card.counts ?? []).map((count) => (
                        <div key={count.label}>
                            <dt className="text-xs text-muted-foreground">{count.label}</dt>
                            <dd className="text-lg font-semibold tabular-nums text-foreground">{formatNumber(count.current)}</dd>
                            <DeltaText delta={count.delta} />
                        </div>
                    ))}
                </dl>
                <div className="mt-3">
                    <OnboardingChart data={data} lines={lines} />
                </div>
            </>
        );
    }
    const metric = card.kind === "PUBLISHER_EARNINGS" ? "earnings" : card.kind === "ADVERTISER_SPEND" ? "spend" : "commissions";
    return (
        <div className="mt-3">
            <MoneySeriesChart data={data} metric={metric} />
        </div>
    );
}

/**
 * The four series the owner asked for, each as its own card: publishers'
 * earnings, advertisers' spend, agents' commissions and the onboarding
 * counts. The segment narrows which are drawn — the server's `series` list
 * says which — so the Publishers segment shows earnings and the publishers
 * onboarded, and nothing about agents.
 */
export function SeriesCards({ series }: { series: ApiResource<AnalyticsSeries> }) {
    return (
        <ResourceBoundary resource={series}>
            {(data) => {
                const cards = seriesCardsFor(data);
                if (cards.length === 0) return null;
                return (
                    <div className="grid gap-4 xl:grid-cols-2">
                        {cards.map((card) => (
                            <Card key={card.kind} className="rounded-lg border-border p-5 shadow-none">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-base font-semibold text-foreground">{card.title}</h2>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>
                                    </div>
                                    {card.kind !== "ONBOARDING" ? (
                                        <div className="text-right">
                                            <p className="text-lg font-semibold tabular-nums text-foreground">{card.total}</p>
                                            <DeltaText delta={card.delta} />
                                        </div>
                                    ) : (
                                        <PeriodLegendCompact />
                                    )}
                                </div>
                                {card.kind !== "ONBOARDING" ? (
                                    <div className="mt-1 flex justify-end">
                                        <PeriodLegend />
                                    </div>
                                ) : null}
                                <SeriesCardBody card={card} series={data} />
                            </Card>
                        ))}
                    </div>
                );
            }}
        </ResourceBoundary>
    );
}

function PeriodLegendCompact() {
    return <span className="text-xs text-muted-foreground">this period, per bucket</span>;
}

/* ------------------------------------------------------------------ */
/* The breakdown table                                                 */
/* ------------------------------------------------------------------ */

export interface BreakdownControls {
    by: BreakdownDimension;
    onByChange: (by: BreakdownDimension) => void;
    q: string;
    onQChange: (q: string) => void;
    sort: BreakdownSort;
    onSortChange: (sort: BreakdownSort) => void;
    page: number;
    onPageChange: (page: number) => void;
    pageSize: number;
}

function SortHeader({
    column,
    sort,
    onSortChange,
    align,
    children,
}: {
    column: BreakdownColumn;
    sort: BreakdownSort;
    onSortChange: (sort: BreakdownSort) => void;
    align?: "right";
    children: React.ReactNode;
}) {
    const state = breakdownSortState(sort);
    const active = state.column === column;
    const Icon = active ? (state.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
        <TableHead className={cn(align === "right" && "text-right")}>
            <button
                type="button"
                className={cn(
                    "-ml-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:text-foreground",
                    active && "text-foreground",
                    align === "right" && "-mr-1 ml-0 flex-row-reverse"
                )}
                onClick={() => onSortChange(nextBreakdownSort(sort, column))}
                aria-pressed={active}
                aria-label={`Sort by ${typeof children === "string" ? children.toLowerCase() : column}${active ? `, ${state.dir === "asc" ? "ascending" : "descending"}` : ""}`}
            >
                {children}
                <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground/70")} />
            </button>
        </TableHead>
    );
}

/** What the by-city breakdown's "Other (typed)" row says on hover — the backend sends the bucket with an empty `href` and no strings. */
export const OTHER_BREAKDOWN_HOVER = "Spots typed under a town no catalogue city answers to. Settings › Geographies › Overview lists the spellings; add an alias or a city to fold them in.";

/**
 * GMV, bookings and earnings by city, publisher, advertiser or agent —
 * `GET /admin/overview/breakdown` on the list contract. Every column the
 * server sorts on is a sortable header; the search box is its `q`; the
 * pager walks its pages. The whole table is computed once per window and
 * dimension server-side, so flipping a column is a cheap re-read.
 */
export function BreakdownCard({ breakdown, controls }: { breakdown: ApiResource<BreakdownPage>; controls: BreakdownControls }) {
    const { by, onByChange, q, onQChange, sort, onSortChange, page, onPageChange, pageSize } = controls;
    const total = breakdown.data?.total ?? 0;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    const earningsColumn = by !== "advertiser" && by !== "agent";

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-foreground">Breakdown</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        GMV, bookings and earnings by {BREAKDOWN_DIMENSION_LABEL[by].toLowerCase()} in this window. A booking on several spots is shared by line total under a
                        listing dimension and counted whole under an advertiser or an agent.
                    </p>
                </div>
                <div className="inline-flex rounded-lg border bg-card p-0.5">
                    {BREAKDOWN_DIMENSIONS.map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => onByChange(option)}
                            aria-pressed={by === option}
                            className={cn(
                                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                by === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {BREAKDOWN_DIMENSION_LABEL[option]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder={`Search ${BREAKDOWN_DIMENSION_LABEL[by].toLowerCase()}s`}
                        aria-label={`Search ${BREAKDOWN_DIMENSION_LABEL[by].toLowerCase()}s`}
                        className="h-9 w-[260px] bg-card pl-8"
                    />
                </div>
            </div>

            <div className="mt-4 overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <SortHeader column="label" sort={sort} onSortChange={onSortChange}>
                                {BREAKDOWN_DIMENSION_LABEL[by]}
                            </SortHeader>
                            <SortHeader column="gmv" sort={sort} onSortChange={onSortChange} align="right">
                                GMV
                            </SortHeader>
                            <TableHead className="text-right">Share</TableHead>
                            <SortHeader column="bookings" sort={sort} onSortChange={onSortChange} align="right">
                                Bookings
                            </SortHeader>
                            <SortHeader column="value" sort={sort} onSortChange={onSortChange} align="right">
                                Booked value
                            </SortHeader>
                            {earningsColumn ? (
                                <SortHeader column="earnings" sort={sort} onSortChange={onSortChange} align="right">
                                    Publisher earnings
                                </SortHeader>
                            ) : null}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {breakdown.error ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                                    {breakdown.error}
                                </TableCell>
                            </TableRow>
                        ) : breakdown.data === null ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                                    Loading…
                                </TableCell>
                            </TableRow>
                        ) : breakdown.data.items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                                    {q.trim() ? "Nothing matches the search in this window." : "Nothing was recognised in this window."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            breakdown.data.items.map((row: BreakdownRow) => (
                                <TableRow key={row.key}>
                                    <TableCell className="font-medium text-foreground">
                                        {row.href ? (
                                            <Link href={row.href} className="underline-offset-4 hover:underline">
                                                {by === "category" ? (LISTING_CATEGORY_LABEL[row.label as ListingCategory] ?? row.label) : row.label}
                                            </Link>
                                        ) : (
                                            /* Lot X-B: the by-city "Other (typed)" bucket — spots typed under a town no catalogue city answers to; no listings page takes that cut. */
                                            <span title={OTHER_BREAKDOWN_HOVER} className="cursor-help underline decoration-dotted underline-offset-4">
                                                {row.label}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{formatMoney(row.gmvRecognised)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatPct(row.sharePct)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatNumber(row.bookingsCount)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatMoney(row.bookingsValue)}</TableCell>
                                    {earningsColumn ? <TableCell className="text-right tabular-nums">{formatMoney(row.publisherEarnings)}</TableCell> : null}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                    {from}-{to} of {formatNumber(total)}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
                        Previous
                    </Button>
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">{page}</span>
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(page + 1)} disabled={page >= lastPage}>
                        Next
                    </Button>
                </div>
            </div>
        </Card>
    );
}
