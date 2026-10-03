"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactINR, formatNumber } from "@/lib/format";

const GRID = "hsl(240 5.9% 90%)";
const TICK = { fontSize: 11, fill: "hsl(240 3.8% 46.1%)" };
const TOOLTIP_STYLE = {
    borderRadius: 8,
    border: `1px solid ${GRID}`,
    fontSize: 12,
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
};

/**
 * Up to five series distinguishable without relying on colour alone — each
 * also differs in dash pattern, because a line chart read by someone who
 * cannot separate red from green is otherwise a single tangle.
 */
const STROKES = [
    { colour: "hsl(359.5 85.5% 29.8%)", dash: undefined },
    { colour: "hsl(240 10% 12%)", dash: "6 3" },
    { colour: "hsl(201 89% 35%)", dash: "2 3" },
    { colour: "hsl(142 60% 28%)", dash: "8 3 2 3" },
    { colour: "hsl(28 85% 40%)", dash: "1 4" },
];

export interface ExploreSeries {
    key: string;
    label: string;
    /** Money prints compact rupees on its axis; everything else prints plain. */
    money: boolean;
    /** Percentages share an axis of their own, so a rate is not flattened by a crore. */
    ratio: boolean;
}

export interface ExplorePoint {
    bucket: string;
    label: string;
    [metric: string]: string | number;
}

/**
 * AN-2: the Explore chart.
 *
 * One line per chosen metric, over whatever grain was asked for. Two axes,
 * not one: rupees and counts on the left, percentages on the right, because
 * plotting occupancy against GMV on a shared axis draws occupancy as a flat
 * line at zero.
 */
export function ExploreChart({ data, series, height = 320 }: { data: ExplorePoint[]; series: ExploreSeries[]; height?: number }) {
    const hasRatio = series.some((line) => line.ratio);
    const hasLevel = series.some((line) => !line.ratio);
    const anyMoney = series.some((line) => line.money && !line.ratio);
    const interval = data.length <= 10 ? 0 : Math.ceil(data.length / 8) - 1;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 8, right: hasRatio ? 8 : 16, bottom: 0, left: anyMoney ? -4 : -16 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} interval={interval} />
                {hasLevel && (
                    <YAxis
                        yAxisId="level"
                        tick={TICK}
                        tickLine={false}
                        axisLine={false}
                        width={anyMoney ? 64 : 48}
                        tickFormatter={(value: number) => (anyMoney ? formatCompactINR(value) : formatNumber(value))}
                    />
                )}
                {hasRatio && (
                    <YAxis
                        yAxisId="ratio"
                        orientation="right"
                        tick={TICK}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={(value: number) => `${value}%`}
                    />
                )}
                <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => {
                        const line = series.find((candidate) => candidate.label === name);
                        if (!line) return formatNumber(value);
                        if (line.ratio) return `${Number(value).toFixed(2)}%`;
                        return line.money ? formatCompactINR(value) : formatNumber(value);
                    }}
                />
                {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                {series.map((line, index) => {
                    const stroke = STROKES[index % STROKES.length]!;
                    return (
                        <Line
                            key={line.key}
                            yAxisId={line.ratio ? "ratio" : "level"}
                            type="monotone"
                            dataKey={line.key}
                            name={line.label}
                            stroke={stroke.colour}
                            strokeWidth={2}
                            strokeDasharray={stroke.dash}
                            dot={false}
                            activeDot={{ r: 3 }}
                        />
                    );
                })}
            </LineChart>
        </ResponsiveContainer>
    );
}
