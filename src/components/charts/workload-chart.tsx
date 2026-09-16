"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WORKLOAD_LEVEL_LABEL, type WorkloadPoint } from "@/services/employees";
import { WORKLOAD_COLORS } from "./workload-colors";

const GRID = "hsl(240 5.9% 90%)";
const TICK = { fontSize: 11, fill: "hsl(240 3.8% 46.1%)" };
const TOOLTIP_STYLE = {
    borderRadius: 8,
    border: `1px solid ${GRID}`,
    fontSize: 12,
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
};

/**
 * The employees overview's "Workload distribution" card (`5102:29144`):
 * the frame's stacked bars, one per bucket of time, each the share of
 * staff at low, medium and high load — `GET /employees/workload`'s
 * `buckets[].share`, as whole percentages that add to 100 for a bucket
 * with anyone in it and to nothing for an empty one.
 *
 * The tooltip prints the counts the shares were cut from, so a figure read
 * off the chart is a number of people, not a rounding.
 */
export function WorkloadChart({ data }: { data: WorkloadPoint[] }) {
    return (
        <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -12 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} dy={6} />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(value: number) => `${value}%`}
                    tick={TICK}
                />
                <Tooltip
                    cursor={{ fill: "hsl(240 4.8% 95.9% / 0.6)" }}
                    formatter={(value, name, item) => {
                        const point = item.payload as WorkloadPoint | undefined;
                        const level = name === "low" ? "LOW" : name === "medium" ? "MEDIUM" : "HIGH";
                        const count = point?.counts[level] ?? 0;
                        return [`${Number(value)}% · ${count} ${count === 1 ? "person" : "people"}`, WORKLOAD_LEVEL_LABEL[level]];
                    }}
                    labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload as WorkloadPoint | undefined;
                        return point ? `From ${point.start} · ${point.staff} staff` : String(label);
                    }}
                    contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="low" stackId="share" fill={WORKLOAD_COLORS.low} maxBarSize={56} />
                <Bar dataKey="medium" stackId="share" fill={WORKLOAD_COLORS.medium} maxBarSize={56} />
                <Bar dataKey="high" stackId="share" fill={WORKLOAD_COLORS.high} maxBarSize={56} radius={[3, 3, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
