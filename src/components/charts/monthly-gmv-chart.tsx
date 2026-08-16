"use client";

import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatCompactINR, formatINR } from "@/lib/format";
import type { MonthPoint } from "@/types";

interface MonthlyGmvChartProps {
    data: MonthPoint[];
}

/** Dashboard "Monthly GMV" bar chart, graphite bars on hairline grid. */
export function MonthlyGmvChart({ data }: MonthlyGmvChartProps) {
    return (
        <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} stroke="hsl(240 5.9% 90%)" strokeWidth={1} />
                <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                    dy={6}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    ticks={[0, 500000, 1000000, 1500000, 2000000]}
                    tickFormatter={(value: number) => formatCompactINR(value)}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                />
                <Tooltip
                    cursor={{ fill: "hsl(240 4.8% 95.9% / 0.6)" }}
                    formatter={(value) => [formatINR(Number(value)), "GMV"]}
                    contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(240 5.9% 90%)",
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                    }}
                />
                <Bar
                    dataKey="value"
                    fill="hsl(240 10% 12%)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                />
            </BarChart>
        </ResponsiveContainer>
    );
}
