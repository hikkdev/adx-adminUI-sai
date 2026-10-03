"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/format";
import type { PromotionStats } from "@/services/promotions";

const GRID = "hsl(240 5.9% 90%)";
const TICK = { fontSize: 10, fill: "hsl(240 3.8% 46.1%)" };
const TOOLTIP_STYLE = { borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12, boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)" };

const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * One measure a day, one small chart. Views and taps are two scales apart,
 * so they are two charts side by side rather than one with two axes.
 */
function DayBars({ data, dataKey, label, fill }: { data: PromotionStats["byDay"]; dataKey: "impressions" | "clicks"; label: string; fill: string }) {
    return (
        <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{label} a day</p>
            <ResponsiveContainer width="100%" height={140}>
                <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -12 }} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} tick={TICK} minTickGap={16} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={TICK} />
                    <Tooltip
                        cursor={{ fill: "hsl(240 4.8% 95.9% / 0.6)" }}
                        formatter={(value) => [formatNumber(Number(value)), label]}
                        labelFormatter={(value) => dayLabel(String(value))}
                        contentStyle={TOOLTIP_STYLE}
                    />
                    <Bar dataKey={dataKey} fill={fill} radius={[4, 4, 0, 0]} maxBarSize={14} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export function StatsCharts({ stats }: { stats: PromotionStats }) {
    if (stats.byDay.length === 0) return <p className="text-sm text-muted-foreground">No views or taps counted yet.</p>;
    return (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="ad-stats-chart">
            <DayBars data={stats.byDay} dataKey="impressions" label="Views" fill="hsl(240 10% 12%)" />
            <DayBars data={stats.byDay} dataKey="clicks" label="Taps" fill="hsl(359.5 85.5% 29.8%)" />
        </div>
    );
}
