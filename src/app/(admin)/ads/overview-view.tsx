"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/adx/kpi-card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SimpleTable } from "@/components/adx/simple-table";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import { promotionsReadApi, promotionsService, type AdSlot, type PromotionsStats, type SlotAvailability } from "@/services/promotions";
import { AdsFrame } from "./ads-frame";
import { WEEK_DAYS, fillLabel, revenueSplit, slotFill, type Fill } from "./overview-numbers";
import { PerformanceDetail, RangePicker, defaultWindow, isoDay, validRange } from "./performance-view";

interface SlotFillRow {
    slot: AdSlot;
    /** Null when the slot is off sale (nothing to fill) or its availability could not be read. */
    availability: SlotAvailability | null;
}

/**
 * Each slot with its availability from today for a week. The read is the
 * buyer's, which answers on-sale slots only; an off-sale slot, or one the
 * read refuses (ads switched off), is listed without numbers.
 */
async function loadFill(today: string): Promise<SlotFillRow[]> {
    const slots = await promotionsService.slots();
    const last = isoDay(new Date(Date.parse(`${today}T00:00:00Z`) + (WEEK_DAYS - 1) * 86_400_000));
    return Promise.all(
        slots.map(async (slot) => ({
            slot,
            availability: slot.isActive ? await promotionsService.slotAvailability(slot.key, today, last).catch(() => null) : null,
        })),
    );
}

/**
 * AS-1 — the Ads & sponsored Overview: the section's own numbers (the
 * console's rule: one section's numbers live on its Overview tab). What the
 * window brought in, what is live now, what is waiting on the desk, how
 * full each slot is today and over the week, and how it all performed —
 * which was the Performance tab until the section moved out of Growth.
 */
export function AdsOverview() {
    const live = promotionsReadApi();
    const [range, setRange] = React.useState(defaultWindow);
    const valid = validRange(range);
    const [today] = React.useState(() => isoDay(new Date()));

    const stats = useApiResource<PromotionsStats | null>(`promotions:stats:${live}:${range.from}:${range.to}:${valid}`, () =>
        live && valid ? promotionsService.stats(range.from, range.to) : Promise.resolve(null),
    );
    const waiting = useApiResource<number | null>(`promotions:waiting:${live}`, async () =>
        live ? (await promotionsService.ads({ status: "PENDING_REVIEW", pageSize: 1 })).total : null,
    );
    const fill = useApiResource<SlotFillRow[] | null>(`promotions:fill:${live}:${today}`, () => (live ? loadFill(today) : Promise.resolve(null)));

    return (
        <AdsFrame subtitle="What the paid placements brought in, what is live, and how full the slots are." actions={<RangePicker range={range} onChange={setRange} />}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ads-overview-kpis">
                <KpiCard stat={revenueStat(stats.data, stats.loading)} />
                <KpiCard
                    stat={{ id: "ads-live", label: "Display ads live now", value: stats.data ? formatNumber(stats.data.totals.adsRunning) : "—", hint: "running in their slots today" }}
                />
                <KpiCard
                    stat={{ id: "boosts-live", label: "Sponsored listings live now", value: stats.data ? formatNumber(stats.data.totals.boostsRunning) : "—", hint: "shown first in search or similar" }}
                />
                <Link href="/ads/review" className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="ads-waiting">
                    <KpiCard
                        className="h-full transition-colors group-hover:border-foreground/30"
                        stat={{
                            id: "waiting",
                            label: "Waiting for review",
                            value: waiting.data === null ? "—" : formatNumber(waiting.data),
                            hint: waiting.error ? "could not be counted" : "artwork to look at — open the queue →",
                        }}
                    />
                </Link>
            </div>

            <section className="space-y-3" aria-labelledby="fill-heading">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 id="fill-heading" className="text-base font-semibold text-foreground">
                            How full the slots are
                        </h2>
                        <p className="text-sm text-muted-foreground">Ads holding a place each day — paid, or waiting on review or payment — against how many a slot rotates. The week is today and the six days after.</p>
                    </div>
                    <Link href="/ads/slots" className="inline-flex items-center gap-1 text-sm text-info hover:underline">
                        Slots & pricing <ArrowRight className="size-3.5" />
                    </Link>
                </div>
                <ResourceBoundary resource={fill}>
                    {(rows) =>
                        !rows ? null : (
                            <SimpleTable<SlotFillRow>
                                rows={rows}
                                rowKey={(row) => row.slot.id}
                                emptyMessage="No ad slots yet — add one on Slots & pricing."
                                columns={[
                                    {
                                        key: "slot",
                                        label: "Slot",
                                        render: (row) => (
                                            <Link href={`/ads/slots#${row.slot.key}`} className="group">
                                                <span className="block text-sm font-medium text-foreground group-hover:underline">{row.slot.label}</span>
                                                <span className="block font-mono text-[11px] text-muted-foreground">
                                                    {row.slot.key} · {row.slot.maxConcurrent} at once
                                                </span>
                                            </Link>
                                        ),
                                    },
                                    { key: "today", label: "Today", render: (row) => <FillCell row={row} pick="today" today={today} /> },
                                    { key: "week", label: "This week", render: (row) => <FillCell row={row} pick="week" today={today} /> },
                                    {
                                        key: "next",
                                        label: "Next free day",
                                        className: "text-right",
                                        render: (row) => (
                                            <span className="text-xs text-muted-foreground">
                                                {!row.availability ? "—" : row.availability.nextFreeDate === today ? "Today" : row.availability.nextFreeDate ? formatDate(row.availability.nextFreeDate) : "None within 186 days"}
                                            </span>
                                        ),
                                    },
                                ]}
                            />
                        )
                    }
                </ResourceBoundary>
            </section>

            <section className="space-y-3" aria-labelledby="performance-heading">
                <div>
                    <h2 id="performance-heading" className="text-base font-semibold text-foreground">
                        Performance
                    </h2>
                    <p className="text-sm text-muted-foreground">How the paid placements were seen in the window above. Revenue counts on the day a booking was paid.</p>
                </div>
                <ResourceBoundary resource={stats}>{(data) => (data ? <PerformanceDetail stats={data} /> : null)}</ResourceBoundary>
            </section>
        </AdsFrame>
    );
}

function revenueStat(stats: PromotionsStats | null, loading: boolean) {
    if (!stats) return { id: "revenue", label: "Revenue, before GST", value: loading ? "…" : "—", hint: "ads and sponsored, in the window" };
    const split = revenueSplit(stats);
    return {
        id: "revenue",
        label: "Revenue, before GST",
        value: formatMoney(stats.revenue.subtotal),
        hint: `${formatMoney(split.ads)} ads · ${formatMoney(split.sponsored)} sponsored`,
    };
}

/** Booked of capacity with a bar; an off-sale slot, or one unread, says so. */
function FillCell({ row, pick, today }: { row: SlotFillRow; pick: "today" | "week"; today: string }) {
    if (!row.slot.isActive) return <span className="text-xs text-muted-foreground">Off sale</span>;
    if (!row.availability) return <span className="text-xs text-muted-foreground">Could not be read</span>;
    const value: Fill = slotFill(row.availability, today)[pick];
    const pct = value.ratio === null ? 0 : Math.min(100, Math.round(value.ratio * 100));
    return (
        <div className="min-w-[9rem] space-y-1" data-testid={`fill-${pick}-${row.slot.key}`}>
            <span className="block text-xs tabular-nums text-foreground">{fillLabel(value)}</span>
            <Card className="h-1.5 overflow-hidden rounded-full border-0 bg-muted shadow-none" aria-hidden>
                <div className={cn("h-full rounded-full", pct >= 100 ? "bg-danger" : pct >= 75 ? "bg-warning" : "bg-foreground/70")} style={{ width: `${pct}%` }} />
            </Card>
        </div>
    );
}
