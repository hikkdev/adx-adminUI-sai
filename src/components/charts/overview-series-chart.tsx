"use client";

import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactINR, formatNumber } from "@/lib/format";
import { dayLong, type OverviewSeriesPoint } from "@/services/section-overviews";

const GRID = "hsl(240 5.9% 90%)";
const TICK = { fontSize: 11, fill: "hsl(240 3.8% 46.1%)" };
const ACCENT = "hsl(359.5 85.5% 29.8%)";
const INK = "hsl(240 10% 12%)";
const MUTED = "hsl(240 3.8% 46.1%)";
const TOOLTIP_STYLE = {
    borderRadius: 8,
    border: `1px solid ${GRID}`,
    fontSize: 12,
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
};

/** Every `n`th tick, so a ninety-day axis does not print ninety labels. */
function tickInterval(points: number): number {
    if (points <= 10) return 0;
    return Math.ceil(points / 8) - 1;
}

function heading(point: OverviewSeriesPoint | undefined, fallback: unknown): string {
    if (!point) return String(fallback);
    return point.previousDay ? `${dayLong(point.day)} · vs ${dayLong(point.previousDay)}` : dayLong(point.day);
}

/**
 * The overview tabs' day series (package O-C): this window solid, the
 * previous window's day at the same position dotted beside it — the
 * analytics page's curve, over the one point shape every section's series
 * folds to. A count series keeps its axis to whole numbers; a money series
 * prints compact rupees on the axis and the decimal string the API sent
 * in the tooltip.
 */
export function OverviewSeriesChart({ data, money = false, height = 200, id }: { data: OverviewSeriesPoint[]; money?: boolean; height?: number; id: string }) {
    const gradient = `overview-series-${id}`;
    const stroke = money ? INK : ACCENT;
    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: money ? -8 : -16 }}>
                <defs>
                    <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stroke} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} dy={6} interval={tickInterval(data.length)} />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={money ? 48 : 40}
                    allowDecimals={false}
                    tickFormatter={(value: number) => (money ? formatCompactINR(value) : formatNumber(value))}
                    tick={TICK}
                />
                <Tooltip
                    formatter={(value, name, item) => {
                        const point = item.payload as OverviewSeriesPoint | undefined;
                        if (name === "previous") return [point?.previousText ?? "—", "Previous"];
                        return [point?.text ?? String(value), "This window"];
                    }}
                    labelFormatter={(label, payload) => heading(payload?.[0]?.payload as OverviewSeriesPoint | undefined, label)}
                    contentStyle={TOOLTIP_STYLE}
                />
                <Line type="monotone" dataKey="previous" stroke={MUTED} strokeWidth={1.25} strokeDasharray="3 4" dot={false} activeDot={{ r: 2.5 }} connectNulls={false} />
                <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={1.75} fill={`url(#${gradient})`} dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
