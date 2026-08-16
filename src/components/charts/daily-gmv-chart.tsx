"use client";

import {
    Area,
    AreaChart,
    CartesianGrid,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatCompactINR, formatINR } from "@/lib/format";
import type { DayPoint } from "@/types";

interface DailyGmvChartProps {
    data: (DayPoint & { previous: number })[];
}

/** Analytics "Daily GMV", current period area with previous period line. */
export function DailyGmvChart({ data }: DailyGmvChartProps) {
    return (
        <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                <defs>
                    <linearGradient id="dailyGmvFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(359.5 85.5% 29.8%)" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="hsl(359.5 85.5% 29.8%)" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(240 5.9% 90%)" strokeWidth={1} />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    ticks={["1 Apr", "7 Apr", "13 Apr", "19 Apr", "25 Apr", "30 Apr"]}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                    dy={6}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    ticks={[0, 20000, 40000, 60000, 80000]}
                    tickFormatter={(value: number) => formatCompactINR(value)}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                />
                <Tooltip
                    formatter={(value, name) => [
                        formatINR(Number(value)),
                        name === "value" ? "This period" : "Previous",
                    ]}
                    contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(240 5.9% 90%)",
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                    }}
                />
                <Line
                    type="monotone"
                    dataKey="previous"
                    stroke="hsl(240 3.8% 70%)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                />
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(359.5 85.5% 29.8%)"
                    strokeWidth={1.75}
                    fill="url(#dailyGmvFill)"
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
