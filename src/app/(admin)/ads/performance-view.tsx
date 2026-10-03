"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/adx/kpi-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatMoney, formatNumber } from "@/lib/format";
import { BOOST_PLACEMENT_LABEL, PROMOTION_STATUS_META, pctLabel, type BoostPlacement, type PromotionStatus, type PromotionsStats } from "@/services/promotions";

/** A `YYYY-MM-DD` for a Date, in UTC — the server's whole days. */
export const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** The last thirty days, today included — what the server answers with no window named. */
export function defaultWindow(now = new Date()): { from: string; to: string } {
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = new Date(to.getTime() - 29 * 86_400_000);
    return { from: isoDay(from), to: isoDay(to) };
}

/** Both ends are whole days and the window does not end before it starts. */
export function validRange(range: { from: string; to: string }): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to) && range.from <= range.to;
}

/** The From / To pair the Overview's numbers are read over. */
export function RangePicker({ range, onChange }: { range: { from: string; to: string }; onChange: (next: { from: string; to: string }) => void }) {
    return (
        <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
                <Label htmlFor="perf-from" className="text-xs">
                    From
                </Label>
                <Input id="perf-from" type="date" value={range.from} max={range.to} onChange={(e) => onChange({ ...range, from: e.target.value })} className="h-9 w-40 bg-card" />
            </div>
            <div className="space-y-1">
                <Label htmlFor="perf-to" className="text-xs">
                    To
                </Label>
                <Input id="perf-to" type="date" value={range.to} min={range.from} onChange={(e) => onChange({ ...range, to: e.target.value })} className="h-9 w-40 bg-card" />
            </div>
            {!validRange(range) && <p className="pb-2 text-xs text-danger">The window ends before it starts.</p>}
        </div>
    );
}

/**
 * How the paid placements were seen in a window — what was the Performance
 * tab, drawn on the Overview since AS-1: views and taps, what was collected
 * net of refunds, by slot and by placement, and the ads that drew most.
 * Revenue is counted on the day a booking was paid.
 */
export function PerformanceDetail({ stats }: { stats: PromotionsStats }) {
    return (
        <div className="space-y-5" data-testid="ads-performance">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard stat={{ id: "views", label: "Views", value: formatNumber(stats.totals.impressions), hint: "ads and sponsored listings, in the window" }} />
                <KpiCard stat={{ id: "taps", label: "Taps", value: formatNumber(stats.totals.clicks), hint: `tap rate ${pctLabel(stats.totals.ctr, stats.totals.impressions)}` }} />
                <KpiCard stat={{ id: "bookings", label: "Paid bookings", value: formatNumber(stats.revenue.bookings), hint: "less any refunded" }} />
                <KpiCard stat={{ id: "collected", label: "Collected, with GST", value: formatMoney(stats.revenue.total), hint: `${formatMoney(stats.revenue.refunded)} refunded` }} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">By ad slot</h3>
                    <SimpleTable
                        rows={stats.bySlot}
                        rowKey={(row) => row.slotKey}
                        emptyMessage="No ad was paid for in this window."
                        columns={[
                            { key: "slot", label: "Slot", render: (row) => <span className="text-sm">{row.label}</span> },
                            { key: "bookings", label: "Bookings", className: "text-right", render: (row) => <span className="tabular-nums">{row.bookings}</span> },
                            { key: "revenue", label: "Revenue", className: "text-right", render: (row) => <span className="tabular-nums">{formatMoney(row.revenue)}</span> },
                            { key: "views", label: "Views", className: "text-right", render: (row) => <span className="tabular-nums">{formatNumber(row.impressions)}</span> },
                            { key: "ctr", label: "Tap rate", className: "text-right", render: (row) => <span className="tabular-nums">{pctLabel(row.ctr, row.impressions)}</span> },
                        ]}
                    />
                </section>
                <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">By sponsored placement</h3>
                    <SimpleTable
                        rows={stats.byPlacement}
                        rowKey={(row) => row.placement}
                        emptyMessage="No sponsored listing was paid for in this window."
                        columns={[
                            { key: "placement", label: "Placement", render: (row) => <span className="text-sm">{BOOST_PLACEMENT_LABEL[row.placement as BoostPlacement] ?? row.placement}</span> },
                            { key: "bookings", label: "Bookings", className: "text-right", render: (row) => <span className="tabular-nums">{row.bookings}</span> },
                            { key: "revenue", label: "Revenue", className: "text-right", render: (row) => <span className="tabular-nums">{formatMoney(row.revenue)}</span> },
                            { key: "views", label: "Views", className: "text-right", render: (row) => <span className="tabular-nums">{formatNumber(row.impressions)}</span> },
                            { key: "ctr", label: "Tap rate", className: "text-right", render: (row) => <span className="tabular-nums">{pctLabel(row.ctr, row.impressions)}</span> },
                        ]}
                    />
                </section>
            </div>

            <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Top ads</h3>
                <SimpleTable
                    rows={stats.topAds}
                    rowKey={(row) => row.adBookingId}
                    emptyMessage="No ad was seen in this window."
                    columns={[
                        {
                            key: "ad",
                            label: "Ad",
                            render: (row) => (
                                <span>
                                    <span className="block text-sm font-medium text-foreground">{row.title}</span>
                                    <span className="block font-mono text-[11px] text-muted-foreground">
                                        {row.displayId ?? row.adBookingId} · {row.slotKey}
                                    </span>
                                </span>
                            ),
                        },
                        { key: "status", label: "Status", render: (row) => <StatusBadge status={PROMOTION_STATUS_META[row.status as PromotionStatus] ?? { label: row.status, tone: "neutral" }} /> },
                        { key: "views", label: "Views", className: "text-right", render: (row) => <span className="tabular-nums">{formatNumber(row.impressions)}</span> },
                        { key: "taps", label: "Taps", className: "text-right", render: (row) => <span className="tabular-nums">{formatNumber(row.clicks)}</span> },
                        { key: "ctr", label: "Tap rate", className: "text-right", render: (row) => <span className="tabular-nums">{pctLabel(row.ctr, row.impressions)}</span> },
                    ]}
                />
            </section>
        </div>
    );
}
