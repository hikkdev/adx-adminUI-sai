/**
 * The workload chart's three bands, shared by the chart and the legend
 * beside it. Kept apart from the chart module so the legend can import the
 * colours without pulling Recharts into the initial bundle — the chart
 * itself loads through `lazy.tsx`.
 *
 * The frame's palette: low in the neutral grey, medium in the warning
 * amber, high in the accent.
 */
export const WORKLOAD_COLORS = {
    low: "hsl(240 5.9% 84%)",
    medium: "hsl(34 100% 30%)",
    high: "hsl(359.5 85.5% 29.8%)",
} as const;
