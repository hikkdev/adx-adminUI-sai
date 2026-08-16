"use client";

import * as React from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { DailyGmvChart } from "@/components/charts/daily-gmv-chart";
import { formatCompactINR } from "@/lib/format";
import type { CategorySlice, DayPoint, KpiStat, TopPublisherRow } from "@/types";

interface AnalyticsViewProps {
    kpis: KpiStat[];
    dailyGmv: (DayPoint & { previous: number })[];
    gmvByCategory: CategorySlice[];
    topPublishers: TopPublisherRow[];
}

const segments = ["All", "Publishers", "Advertisers", "Agents"] as const;
const ranges = ["Last 7 days", "Last 30 days", "Last quarter", "Year to date"] as const;

export function AnalyticsView({
    kpis,
    dailyGmv,
    gmvByCategory,
    topPublishers,
}: AnalyticsViewProps) {
    const [segment, setSegment] = React.useState<(typeof segments)[number]>("All");
    const [range, setRange] = React.useState<(typeof ranges)[number]>("Last 30 days");

    const maxCategory = Math.max(...gmvByCategory.map((slice) => slice.value));

    return (
        <div className="space-y-5">
            <PageHeader
                title="GMV and growth"
                actions={
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-9 bg-card">
                                    <Calendar className="mr-1.5 size-4" />
                                    {range}
                                    <ChevronDown className="ml-1.5 size-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {ranges.map((option) => (
                                    <DropdownMenuItem key={option} onSelect={() => setRange(option)}>
                                        {option}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="outline"
                            className="h-9 bg-card"
                            onClick={() => toast.success("Report exported as CSV")}
                        >
                            Export CSV
                        </Button>
                    </>
                }
            />

            <div className="inline-flex rounded-lg border bg-card p-0.5">
                {segments.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => setSegment(option)}
                        className={cn(
                            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                            segment === option
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {option}
                    </button>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((stat) => (
                    <KpiCard key={stat.id} stat={stat} />
                ))}
            </div>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-foreground">Daily GMV (₹)</h2>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className="h-0.5 w-4 rounded-full bg-primary" />
                            This period
                        </span>
                        <span className="flex items-center gap-1.5">
                            <svg width="16" height="2" aria-hidden className="text-muted-foreground/60">
                                <line
                                    x1="0"
                                    y1="1"
                                    x2="16"
                                    y2="1"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeDasharray="3 3"
                                />
                            </svg>
                            Previous
                        </span>
                    </div>
                </div>
                <div className="mt-4">
                    <DailyGmvChart data={dailyGmv} />
                </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h2 className="text-base font-semibold text-foreground">GMV by category</h2>
                    <ul className="mt-5 space-y-4">
                        {gmvByCategory.map((slice) => (
                            <li key={slice.category}>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-foreground">{slice.category}</span>
                                    <span className="text-muted-foreground">
                                        {formatCompactINR(slice.value)}
                                    </span>
                                </div>
                                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary"
                                        style={{ width: `${(slice.value / maxCategory) * 100}%` }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h2 className="text-base font-semibold text-foreground">Top publishers</h2>
                    <ul className="mt-4 divide-y">
                        {topPublishers.map((row, index) => (
                            <li key={row.publisher} className="flex items-center gap-3 py-3">
                                <span className="w-5 text-sm font-semibold text-muted-foreground">
                                    {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {row.publisher}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{row.city}</p>
                                </div>
                                <span
                                    className={cn(
                                        "text-xs font-medium",
                                        row.share >= 0 ? "text-success" : "text-danger"
                                    )}
                                >
                                    {row.share >= 0 ? "▲" : "▼"} {Math.abs(row.share)}%
                                </span>
                                <span className="w-16 text-right text-sm font-semibold text-foreground">
                                    {formatCompactINR(row.gmv)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Card>
            </div>
        </div>
    );
}
