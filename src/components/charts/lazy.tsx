"use client";

import dynamic from "next/dynamic";

/**
 * Deferred versions of the chart components.
 *
 * Recharts is by far the heaviest thing on the screens that use it — the chart
 * routes carried ~160 kB of route-specific JavaScript against a 102 kB shared
 * baseline, and Recharts is the bulk of it. Because every chart here renders
 * into a fixed-height `ResponsiveContainer`, the library can be fetched after
 * first paint without the page reflowing: each placeholder below reserves
 * exactly the height its chart will occupy.
 *
 * `ssr: false` is what actually keeps the library out of the initial payload,
 * and it is only legal inside a Client Component — hence this module carrying
 * the "use client" boundary on behalf of the server pages that import it.
 * Charts are browser-only anyway (Recharts measures the DOM to size itself), so
 * nothing is lost by skipping their server render.
 *
 * Import from here instead of from the individual chart modules. Importing the
 * modules directly still works and still renders identically — it just puts
 * Recharts back into the initial bundle.
 */

/** Reserves the chart's exact footprint so nothing shifts when it loads in. */
function ChartSkeleton({ height }: { height: number }) {
    return (
        <div
            className="w-full animate-pulse rounded-md bg-muted/60"
            style={{ height }}
            aria-hidden
        />
    );
}

export const MonthSeriesChart = dynamic(
    () => import("./month-series-chart").then((m) => m.MonthSeriesChart),
    { ssr: false, loading: () => <ChartSkeleton height={280} /> },
);

export const DashboardGmvChart = dynamic(
    () => import("./dashboard-charts").then((m) => m.DashboardGmvChart),
    { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);

export const PublisherGrowthChart = dynamic(
    () => import("./dashboard-charts").then((m) => m.PublisherGrowthChart),
    { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);

export const FeatureCoverageChart = dynamic(
    () => import("./feature-coverage-chart").then((m) => m.FeatureCoverageChart),
    { ssr: false, loading: () => <ChartSkeleton height={168} /> },
);

/* Lot G (Q115) — package CG1: the analytics page's day-granular charts. */

export const DailyGmvChart = dynamic(
    () => import("./analytics-charts").then((m) => m.DailyGmvChart),
    { ssr: false, loading: () => <ChartSkeleton height={280} /> },
);

export const MoneySeriesChart = dynamic(
    () => import("./analytics-charts").then((m) => m.MoneySeriesChart),
    { ssr: false, loading: () => <ChartSkeleton height={180} /> },
);

export const OnboardingChart = dynamic(
    () => import("./analytics-charts").then((m) => m.OnboardingChart),
    { ssr: false, loading: () => <ChartSkeleton height={180} /> },
);

export const WorkloadChart = dynamic(
    () => import("./workload-chart").then((m) => m.WorkloadChart),
    { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);

/* Package O-C: the overview tabs' day series, this window against the previous. */

export const OverviewSeriesChart = dynamic(
    () => import("./overview-series-chart").then((m) => m.OverviewSeriesChart),
    { ssr: false, loading: () => <ChartSkeleton height={200} /> },
);
