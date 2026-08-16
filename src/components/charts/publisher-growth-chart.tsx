"use client";

import {
    Area,
    AreaChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
} from "recharts";
import { formatNumber } from "@/lib/format";
import type { MonthPoint } from "@/types";

interface PublisherGrowthChartProps {
    data: MonthPoint[];
}

/** Dashboard "Publisher growth" cumulative area curve. */
export function PublisherGrowthChart({ data }: PublisherGrowthChartProps) {
    return (
        <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: 4 }}>
                <defs>
                    <linearGradient id="publisherGrowthFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(240 10% 12%)" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="hsl(240 10% 12%)" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                    dy={6}
                />
                <Tooltip
                    formatter={(value) => [`${formatNumber(Number(value))} publishers`, "Total"]}
                    contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(240 5.9% 90%)",
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                    }}
                />
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(240 10% 12%)"
                    strokeWidth={1.5}
                    fill="url(#publisherGrowthFill)"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
