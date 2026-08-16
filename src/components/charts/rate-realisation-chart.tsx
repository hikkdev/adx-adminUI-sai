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
import type { WeekRealisation } from "@/types";

interface RateRealisationChartProps {
    data: WeekRealisation[];
}

/** Pricing overview: card rate vs realised rate, grouped weekly bars. */
export function RateRealisationChart({ data }: RateRealisationChartProps) {
    return (
        <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -4 }} barGap={3}>
                <CartesianGrid vertical={false} stroke="hsl(240 5.9% 90%)" strokeWidth={1} />
                <XAxis
                    dataKey="week"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                    dy={6}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    ticks={[0, 40000, 80000, 120000]}
                    tickFormatter={(value: number) => formatCompactINR(value)}
                    tick={{ fontSize: 11, fill: "hsl(240 3.8% 46.1%)" }}
                />
                <Tooltip
                    cursor={{ fill: "hsl(240 4.8% 95.9% / 0.6)" }}
                    formatter={(value, name) => [
                        formatINR(Number(value)),
                        name === "cardRate" ? "Card rate" : "Realised rate",
                    ]}
                    contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(240 5.9% 90%)",
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                    }}
                />
                <Bar dataKey="cardRate" fill="hsl(240 10% 12%)" radius={[3, 3, 0, 0]} maxBarSize={16} />
                <Bar
                    dataKey="realisedRate"
                    fill="hsl(240 4% 65%)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={16}
                />
            </BarChart>
        </ResponsiveContainer>
    );
}
