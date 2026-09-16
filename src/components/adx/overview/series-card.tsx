"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { OverviewSeriesChart } from "@/components/charts/lazy";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Delta } from "@/services/overview";
import { figureDelta, foldMoneySeries, foldSeries, moneyFigureDelta, type MoneySeries, type Series } from "@/services/section-overviews";

const deltaTone = { positive: "text-success", negative: "text-danger", neutral: "text-muted-foreground" } as const;

function PeriodLegend() {
    return (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-primary" />
                This window
            </span>
            <span className="flex items-center gap-1.5">
                <svg width="16" height="2" aria-hidden className="text-muted-foreground/70">
                    <line x1="0" y1="1" x2="16" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
                </svg>
                Previous
            </span>
        </div>
    );
}

export interface SeriesCardProps {
    /** Unique on the page — the chart's gradient id. */
    id: string;
    title: string;
    hint?: string;
    series: Series | MoneySeries;
    money?: boolean;
    className?: string;
}

const isMoney = (series: Series | MoneySeries, money: boolean | undefined): series is MoneySeries => money === true;

/**
 * One day series of an overview: the window's total with its movement
 * against the previous window at the top right, and the curve below with
 * the previous window's days ghosted beside it — the analytics page's
 * card, over the series shape every section answers.
 */
export function SeriesCard({ id, title, hint, series, money, className }: SeriesCardProps) {
    let total: string;
    let delta: Delta | null;
    let previous: string | null;
    let data;
    if (isMoney(series, money)) {
        total = formatMoney(series.total.value);
        delta = moneyFigureDelta(series.total);
        previous = series.total.previous === null ? null : formatMoney(series.total.previous);
        data = foldMoneySeries(series, formatMoney);
    } else {
        total = formatNumber(series.total.value);
        delta = figureDelta(series.total);
        previous = series.total.previous === null ? null : formatNumber(series.total.previous);
        data = foldSeries(series);
    }
    return (
        <Card className={cn("rounded-lg border-border p-5 shadow-none", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
                </div>
                <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums text-foreground">{total}</p>
                    {delta ? (
                        <p className={cn("text-xs font-medium tabular-nums", deltaTone[delta.tone])} title={previous !== null ? `${previous} in the previous window` : undefined}>
                            {delta.text} vs previous
                        </p>
                    ) : null}
                </div>
            </div>
            <div className="mt-1 flex justify-end">
                <PeriodLegend />
            </div>
            <div className="mt-3">
                <OverviewSeriesChart id={id} data={data} money={money} />
            </div>
        </Card>
    );
}
