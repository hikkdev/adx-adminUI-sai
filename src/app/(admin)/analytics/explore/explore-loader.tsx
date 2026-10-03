"use client";

import * as React from "react";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import {
    defaultGrain,
    metricsService,
    windowOf,
    type Grain,
    type MetricDef,
    type MetricsSeries,
    type WindowPreset,
} from "@/services/metrics";
import { AnalyticsNav } from "../analytics-nav";
import { ExploreView } from "./explore-view";

/**
 * AN-2: two reads, kept apart on purpose.
 *
 * The catalogue is read once and cached by its own key — it changes when the
 * backend ships a metric, not when the operator moves a window. The series is
 * re-read whenever the question changes, and its key carries the question, so
 * going back to a window already seen is instant.
 */

/** What Explore opens on: the money line and what it is earned against. */
const DEFAULT_METRICS = ["gmvRecognised", "occupancyPct"];

export function ExploreLoader() {
    const live = isLive("analytics");
    const [preset, setPreset] = React.useState<WindowPreset>("30D");
    const [chosen, setChosen] = React.useState<string[]>(DEFAULT_METRICS);
    /* Null until the operator picks one: the grain follows the window's length
       until they say otherwise, and then it stops moving under them. */
    const [grainOverride, setGrainOverride] = React.useState<Grain | null>(null);

    const window = React.useMemo(() => windowOf(preset), [preset]);
    const grain = grainOverride ?? defaultGrain(window.from, window.to);

    const catalogue = useApiResource<MetricDef[]>(`analytics:catalogue:${live}`, () =>
        live ? metricsService.catalogue() : Promise.resolve([]),
    );

    const key = `analytics:series:${window.from}:${window.to}:${grain}:${[...chosen].sort().join("+")}:${live}`;
    const series = useApiResource<MetricsSeries | null>(key, () =>
        live && chosen.length > 0
            ? metricsService.series({ from: window.from, to: window.to, grain, metrics: chosen })
            : Promise.resolve(null),
    );

    return (
        <div className="space-y-5">
            <AnalyticsNav />
            <PageHeader
                title="Explore"
                subtitle="Any metric the platform defines, by day, week or month, against the window before it."
            />
            <ResourceBoundary resource={catalogue}>
                {(metrics) => (
                    <ExploreView
                        catalogue={metrics}
                        series={series.data ?? null}
                        chosen={chosen}
                        onChosenChange={setChosen}
                        preset={preset}
                        onPresetChange={(next) => {
                            setPreset(next);
                            /* A new window proposes its own grain again. */
                            setGrainOverride(null);
                        }}
                        grain={grain}
                        onGrainChange={setGrainOverride}
                        loading={series.loading}
                        error={series.error}
                    />
                )}
            </ResourceBoundary>
        </div>
    );
}
