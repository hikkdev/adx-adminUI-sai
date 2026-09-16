"use client";

import {
    Area,
    AreaChart,
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatCompactINR, formatMoney, formatNumber } from "@/lib/format";
import type { MonthSeriesPoint } from "@/services/overview";

const GRID = "hsl(240 5.9% 90%)";
const TICK = { fontSize: 11, fill: "hsl(240 3.8% 46.1%)" };
const TOOLTIP_STYLE = {
    borderRadius: 8,
    border: `1px solid ${GRID}`,
    fontSize: 12,
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
};

/**
 * The dashboard's "Monthly GMV" card (`5102:23003`): the frame's bars are
 * the month's recognised GMV, and the bookings count rides on the right
 * axis as a line — twelve months of `GET /admin/overview?from&to`.
 *
 * The `gmv` number only places the bar; the tooltip prints the decimal
 * string the API sent, so a figure read off the chart is the tile's figure.
 */
export function DashboardGmvChart({ data }: { data: MonthSeriesPoint[] }) {
    return (
        <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -4 }}>
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} dy={6} />
                <YAxis
                    yAxisId="money"
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(value: number) => formatCompactINR(value)}
                    tick={TICK}
                />
                <YAxis
                    yAxisId="count"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    allowDecimals={false}
                    tick={TICK}
                />
                <Tooltip
                    cursor={{ fill: "hsl(240 4.8% 95.9% / 0.6)" }}
                    formatter={(value, name, item) => {
                        const point = item.payload as MonthSeriesPoint | undefined;
                        if (name === "gmv") return [formatMoney(point?.gmvRecognised), "GMV recognised"];
                        return [formatNumber(point?.bookingsCount ?? Number(value)), "Bookings"];
                    }}
                    labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload as MonthSeriesPoint | undefined;
                        return point ? point.month : String(label);
                    }}
                    contentStyle={TOOLTIP_STYLE}
                />
                <Bar yAxisId="money" dataKey="gmv" fill="hsl(240 10% 12%)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line
                    yAxisId="count"
                    type="monotone"
                    dataKey="bookingsCount"
                    stroke="hsl(359.5 85.5% 29.8%)"
                    strokeWidth={1.75}
                    dot={{ r: 2.5, strokeWidth: 0, fill: "hsl(359.5 85.5% 29.8%)" }}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}

/**
 * The dashboard's "Publisher growth" card: the frame's curve is the month's
 * new publishers, twelve months of the same series read.
 */
export function PublisherGrowthChart({ data }: { data: MonthSeriesPoint[] }) {
    return (
        <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                    <linearGradient id="publisher-growth-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(240 10% 12%)" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="hsl(240 10% 12%)" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} dy={6} />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} tick={TICK} />
                <Tooltip
                    formatter={(value, _name, item) => {
                        const point = item.payload as MonthSeriesPoint | undefined;
                        return [formatNumber(point?.newPublishers ?? Number(value)), "New publishers"];
                    }}
                    labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload as MonthSeriesPoint | undefined;
                        return point ? point.month : String(label);
                    }}
                    contentStyle={TOOLTIP_STYLE}
                />
                <Area
                    type="monotone"
                    dataKey="newPublishers"
                    stroke="hsl(240 10% 12%)"
                    strokeWidth={1.75}
                    fill="url(#publisher-growth-fill)"
                    dot={false}
                    activeDot={{ r: 3 }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
