"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FLAG_SURFACE_LABEL, type SurfaceCoverage } from "@/services/flags";

const GRID = "hsl(240 5.9% 90%)";
const TICK = { fontSize: 11, fill: "hsl(240 3.8% 46.1%)" };
const TOOLTIP_STYLE = {
    borderRadius: 8,
    border: `1px solid ${GRID}`,
    fontSize: 12,
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
};

/** The height the lazy wrapper reserves — five surfaces, one row each. */
export const FEATURE_COVERAGE_CHART_HEIGHT = 168;

/**
 * The Coverage card's bars on Settings › Feature flags (CG5): one row per
 * surface, the registered features the document names stacked with the
 * manual rows on that surface. Drawn the way the dashboard's series charts
 * are (CE6) — the same grid, ticks and tooltip — so the two read as one
 * console.
 */
export function FeatureCoverageChart({ data }: { data: SurfaceCoverage[] }) {
    const rows = data.map((row) => ({ ...row, label: FLAG_SURFACE_LABEL[row.surface] }));
    return (
        <ResponsiveContainer width="100%" height={FEATURE_COVERAGE_CHART_HEIGHT}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} tick={TICK} height={20} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={68} tick={TICK} />
                <Tooltip
                    cursor={{ fill: "hsl(240 4.8% 95.9% / 0.6)" }}
                    formatter={(value, name) => [String(value), name === "features" ? "Registered" : "Manual"]}
                    contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="features" stackId="surface" fill="hsl(240 10% 12%)" maxBarSize={14} />
                <Bar dataKey="manual" stackId="surface" fill="hsl(359.5 85.5% 29.8%)" radius={[0, 3, 3, 0]} maxBarSize={14} />
            </BarChart>
        </ResponsiveContainer>
    );
}
