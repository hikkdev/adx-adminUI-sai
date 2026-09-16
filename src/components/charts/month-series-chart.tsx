"use client";

import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatCompactINR, formatMoney, formatPct } from "@/lib/format";
import type { MonthSeriesPoint } from "@/services/overview";

interface MonthSeriesChartProps {
    data: MonthSeriesPoint[];
}

/**
 * The analytics page's month-over-month chart: GMV recognised as the bars,
 * bookings authorised as the dashed line beside them, the take rate as the
 * line on the right-hand axis.
 *
 * The `gmv`, `bookings` and `takeRate` numbers only place the marks. What the
 * tooltip prints is the decimal string the API sent for that month, through
 * `formatMoney`, so a figure read off the chart is the figure on the tile.
 */
export function MonthSeriesChart({ data }: MonthSeriesChartProps) {
    return (
        <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -4 }}>
                <CartesianGrid vertical={false} stroke="hsl(240 5.9% 90%)" strokeWidth={1} />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                    dy={6}
                />
                <YAxis
                    yAxisId="money"
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(value: number) => formatCompactINR(value)}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                />
                <YAxis
                    yAxisId="rate"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    domain={[0, (max: number) => Math.max(10, Math.ceil(max / 5) * 5)]}
                    tickFormatter={(value: number) => `${value}%`}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                />
                <Tooltip
                    cursor={{ fill: "hsl(240 4.8% 95.9% / 0.6)" }}
                    formatter={(value, name, item) => {
                        const point = item.payload as MonthSeriesPoint | undefined;
                        if (name === "gmv") return [formatMoney(point?.gmvRecognised), "GMV recognised"];
                        if (name === "bookings")
                            return [formatMoney(point?.bookingsAuthorised), "Bookings authorised"];
                        return [formatPct(point?.takeRatePct ?? String(value)), "Take rate"];
                    }}
                    labelFormatter={(_label, payload) => {
                        const point = payload?.[0]?.payload as MonthSeriesPoint | undefined;
                        return point ? point.month : String(_label);
                    }}
                    contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(240 5.9% 90%)",
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                    }}
                />
                <Bar
                    yAxisId="money"
                    dataKey="gmv"
                    fill="hsl(359.5 85.5% 29.8%)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                />
                <Line
                    yAxisId="money"
                    type="monotone"
                    dataKey="bookings"
                    stroke="hsl(240 3.8% 46.1%)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={{ r: 2.5, strokeWidth: 0, fill: "hsl(240 3.8% 46.1%)" }}
                />
                <Line
                    yAxisId="rate"
                    type="monotone"
                    dataKey="takeRate"
                    stroke="hsl(240 10% 12%)"
                    strokeWidth={1.75}
                    dot={{ r: 3, strokeWidth: 0, fill: "hsl(240 10% 12%)" }}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
