"use client";

import dynamic from "next/dynamic";

/**
 * Deferred versions of the four chart components.
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

export const DailyGmvChart = dynamic(
    () => import("./daily-gmv-chart").then((m) => m.DailyGmvChart),
    { ssr: false, loading: () => <ChartSkeleton height={280} /> },
);

export const MonthlyGmvChart = dynamic(
    () => import("./monthly-gmv-chart").then((m) => m.MonthlyGmvChart),
    { ssr: false, loading: () => <ChartSkeleton height={220} /> },
);

export const PublisherGrowthChart = dynamic(
    () => import("./publisher-growth-chart").then((m) => m.PublisherGrowthChart),
    { ssr: false, loading: () => <ChartSkeleton height={220} /> },
);

export const RateRealisationChart = dynamic(
    () => import("./rate-realisation-chart").then((m) => m.RateRealisationChart),
    { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);
