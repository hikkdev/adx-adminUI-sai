"use client";

import * as React from "react";
import { Check, LineChart as LineChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/adx/empty-state";
import { ExploreChart } from "@/components/charts/lazy";
/* The types come from the chart module itself: `lazy.tsx` re-exports the
   component through `dynamic`, which carries no types with it. */
import type { ExplorePoint, ExploreSeries } from "@/components/charts/explore-chart";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    FAMILY_LABEL,
    GRAINS,
    GRAIN_LABEL,
    PRESET_LABEL,
    WINDOW_PRESETS,
    byFamily,
    deltaOf,
    formatMetric,
    isPointsDelta,
    numberOf,
    type Grain,
    type MetricDef,
    type MetricsSeries,
    type WindowPreset,
} from "@/services/metrics";

/**
 * AN-2: Explore — the registry made usable.
 *
 * Pick metrics, a window and a grain, and read them together. The picker is
 * drawn from `GET /admin/analytics/catalogue`, so a metric added on the
 * backend appears here without this file changing, which is the whole point
 * of declaring metrics once in code.
 *
 * Two things it does that a chart usually does not. A ratio gets its own
 * axis, because occupancy plotted against GMV on a shared axis is a flat
 * line at zero. And a ratio's movement is reported in points rather than
 * per cent, because occupancy going from 20 % to 30 % rose ten points, and
 * "+50 %" is how a board pack ends up wrong.
 */

/** Five lines is the most the eye separates; the picker stops there. */
export const MAX_METRICS = 5;

interface ExploreViewProps {
    catalogue: MetricDef[];
    series: MetricsSeries | null;
    chosen: string[];
    onChosenChange: (keys: string[]) => void;
    preset: WindowPreset;
    onPresetChange: (preset: WindowPreset) => void;
    grain: Grain;
    onGrainChange: (grain: Grain) => void;
    loading: boolean;
    error: string | null;
}

export function ExploreView({
    catalogue,
    series,
    chosen,
    onChosenChange,
    preset,
    onPresetChange,
    grain,
    onGrainChange,
    loading,
    error,
}: ExploreViewProps) {
    const defs = React.useMemo(() => new Map(catalogue.map((metric) => [metric.key, metric])), [catalogue]);
    const picked = chosen.map((key) => defs.get(key)).filter((metric): metric is MetricDef => metric !== undefined);

    const toggle = (key: string) => {
        if (chosen.includes(key)) {
            onChosenChange(chosen.filter((candidate) => candidate !== key));
            return;
        }
        if (chosen.length >= MAX_METRICS) return;
        onChosenChange([...chosen, key]);
    };

    const lines: ExploreSeries[] = picked.map((metric) => ({
        key: metric.key,
        label: metric.name,
        money: metric.kind === "MONEY",
        ratio: metric.kind === "RATIO",
    }));

    const points: ExplorePoint[] = (series?.buckets ?? []).map((bucket) => {
        const point: ExplorePoint = { bucket: bucket.bucket, label: formatDate(bucket.bucket) };
        for (const metric of picked) point[metric.key] = numberOf(bucket.values[metric.key]);
        return point;
    });

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="explore-window">Window</Label>
                    <Select value={preset} onValueChange={(value) => onPresetChange(value as WindowPreset)}>
                        <SelectTrigger id="explore-window" className="h-9 w-[180px]" data-testid="explore-window">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {WINDOW_PRESETS.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {PRESET_LABEL[option]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="explore-grain">Grain</Label>
                    <Select value={grain} onValueChange={(value) => onGrainChange(value as Grain)}>
                        <SelectTrigger id="explore-grain" className="h-9 w-[150px]" data-testid="explore-grain">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {GRAINS.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {GRAIN_LABEL[option]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <p className="ml-auto text-xs text-muted-foreground">
                    {chosen.length} of {MAX_METRICS} metrics
                    {series ? ` · ${formatDate(series.from)} to ${formatDate(series.to)}` : ""}
                </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
                <MetricPicker catalogue={catalogue} chosen={chosen} onToggle={toggle} atLimit={chosen.length >= MAX_METRICS} />

                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        {picked.length === 0 ? (
                            <EmptyState
                                icon={LineChartIcon}
                                title="Pick a metric"
                                description="Choose up to five from the list. Rupees and counts share the left axis; percentages get the right one."
                            />
                        ) : error ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">{error}</p>
                        ) : loading && points.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">Reading the numbers…</p>
                        ) : (
                            <div data-testid="explore-chart">
                                <ExploreChart data={points} series={lines} />
                            </div>
                        )}
                    </Card>

                    {picked.length > 0 && series && (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {picked.map((metric) => (
                                <TotalCard key={metric.key} metric={metric} series={series} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MetricPicker({
    catalogue,
    chosen,
    onToggle,
    atLimit,
}: {
    catalogue: MetricDef[];
    chosen: string[];
    onToggle: (key: string) => void;
    atLimit: boolean;
}) {
    const [query, setQuery] = React.useState("");
    const needle = query.trim().toLowerCase();
    const matching = needle
        ? catalogue.filter((metric) => `${metric.name} ${metric.description}`.toLowerCase().includes(needle))
        : catalogue;
    const groups = byFamily(matching);

    return (
        <Card className="rounded-lg border-border p-3 shadow-none">
            <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a metric"
                aria-label="Find a metric"
                data-testid="explore-search"
                className="mb-2 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="max-h-[28rem] space-y-3 overflow-y-auto" data-testid="explore-picker">
                {groups.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">No metric matches.</p>
                ) : (
                    groups.map((group) => (
                        <div key={group.family}>
                            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {FAMILY_LABEL[group.family]}
                            </p>
                            <div className="space-y-0.5">
                                {group.metrics.map((metric) => {
                                    const on = chosen.includes(metric.key);
                                    return (
                                        <button
                                            key={metric.key}
                                            type="button"
                                            onClick={() => onToggle(metric.key)}
                                            disabled={!on && atLimit}
                                            title={metric.description}
                                            data-testid={`metric-${metric.key}`}
                                            aria-pressed={on}
                                            className={cn(
                                                "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                                                on ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                                !on && atLimit && "cursor-not-allowed opacity-40",
                                            )}
                                        >
                                            <Check className={cn("mt-0.5 size-3.5 shrink-0", on ? "opacity-100" : "opacity-0")} />
                                            <span className="min-w-0 flex-1 truncate">{metric.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
}

function TotalCard({ metric, series }: { metric: MetricDef; series: MetricsSeries }) {
    const now = series.totals[metric.key];
    const before = series.previous.totals[metric.key];
    const points = isPointsDelta(metric);
    const delta = points ? numberOf(now) - numberOf(before) : deltaOf(now, before);
    const tone = delta === null || Math.abs(delta) < 0.005 ? "text-muted-foreground" : delta > 0 ? "text-success" : "text-danger";

    return (
        <Card className="rounded-lg border-border p-4 shadow-none" data-testid={`total-${metric.key}`}>
            <p className="text-xs text-muted-foreground">{metric.name}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{formatMetric(metric, now)}</p>
            <p className={cn("mt-0.5 text-xs tabular-nums", tone)}>
                {delta === null
                    ? "no comparison"
                    : points
                      ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} pts vs previous`
                      : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs previous`}
            </p>
            {metric.kind === "RATIO" && now?.numerator !== undefined && (
                <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    {formatMetric({ ...metric, kind: "COUNT" }, { value: now.numerator })} of{" "}
                    {formatMetric({ ...metric, kind: "COUNT" }, { value: now.denominator ?? 0 })}
                </p>
            )}
            {metric.caveat && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{metric.caveat}</p>}
        </Card>
    );
}
