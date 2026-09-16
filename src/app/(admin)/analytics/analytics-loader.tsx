"use client";

import * as React from "react";
import { Calendar, ChevronDown, Download, Loader2, PlugZap, RefreshCw } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CityCombobox } from "@/components/adx/city-combobox";
import { PageHeader } from "@/components/adx/page-header";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { EMPTY_CITY_FACET, cityFacetValue, type CityFacet } from "@/lib/city-facet";
import { CITY_STAGES } from "@/services/geo";
import {
    LISTING_CATEGORIES,
    LISTING_CATEGORY_LABEL,
    MAX_ANALYTICS_DAYS,
    RANGE_PRESETS,
    RANGE_PRESET_LABEL,
    SEGMENTS,
    SEGMENT_LABEL,
    dayLongLabel,
    daysBetween,
    overviewReadsApi,
    overviewService,
    rangeFor,
    shiftDay,
    todayIST,
    type AnalyticsSeries,
    type AnalyticsTiles,
    type BreakdownDimension,
    type BreakdownPage,
    type BreakdownSort,
    type ListingCategory,
    type RangePreset,
    type Segment,
    type SeriesQuery,
} from "@/services/overview";
import {
    AnalyticsTilesRow,
    BreakdownCard,
    CategoryBarsCard,
    DailyGmvCard,
    SeriesCards,
    TopPublishersCard,
} from "./analytics-view";

/** The picker's value for every category. */
const ALL = "__all__";

/** The breakdown table's page; the ranking card shows the first five. */
const BREAKDOWN_PAGE_SIZE = 20;
const TOP_PUBLISHERS = 5;

/**
 * DR 10's Analytics (`5102:25931`) — "GMV and growth" — over Lot G's
 * analytics set (Q115): `GET /admin/overview/series` for the daily curve
 * with the previous period dotted beside it and the four series cards,
 * `/breakdown` for the category bars, the top-publisher ranking and the
 * sortable by-city / by-publisher / by-advertiser / by-agent table,
 * `/tiles` for the four tiles, and `/export.csv` for the button at the
 * top right, through the blob helper.
 *
 * The frame's page is kept: the title, the range picker and Export CSV
 * at the top right, the All / Publishers / Advertisers / Agents segments,
 * the four tiles, the big chart, then the two cards below. Beside the
 * segments sit the two filters the series read takes — category and city.
 *
 * The range picker's "Last 7 / 30 / 90 days" end today in India; Custom is
 * two inclusive days at most 366 apart, the server's own ceiling. The
 * granularity is a day throughout, which is what the frame draws.
 */
export function AnalyticsLoader() {
    const live = overviewReadsApi();
    const today = todayIST();
    const [preset, setPreset] = React.useState<RangePreset>("30D");
    const [custom, setCustom] = React.useState<{ from: string; to: string }>(() => rangeFor("30D", today));
    const [segment, setSegment] = React.useState<Segment>("ALL");
    const [category, setCategory] = React.useState<ListingCategory | "">("");
    /* Lot X-B: the city filter is the shared combobox — a pick sends the catalogue slug, free text goes as typed. */
    const [city, setCity] = React.useState<CityFacet>(EMPTY_CITY_FACET);
    const settledCity = useDebounced(cityFacetValue(city), 350);

    const range = preset === "CUSTOM" ? custom : rangeFor(preset, today);
    const spanDays = daysBetween(range.from, range.to);
    const rangeValid = spanDays >= 1 && spanDays <= MAX_ANALYTICS_DAYS;
    const rangeLabel = preset === "CUSTOM" ? `${dayLongLabel(range.from)} – ${dayLongLabel(range.to)}` : RANGE_PRESET_LABEL[preset];
    const tileRangeLabel = preset === "CUSTOM" ? `${spanDays}D` : preset;

    const seriesQuery: SeriesQuery = {
        from: range.from,
        to: range.to,
        granularity: "day",
        segment,
        ...(category ? { category } : {}),
        ...(settledCity ? { city: settledCity } : {}),
    };

    /* Refused before the request goes out, as the server would refuse it —
       an `ApiError`, so the boundary prints the reason rather than "could
       not reach the server". */
    const refuse = () => {
        if (!live) throw new ApiError(0, "OFFLINE", "The console is not connected to the ADX backend.");
        if (!rangeValid) {
            throw new ApiError(400, "VALIDATION_ERROR", `Pick a window of one to ${MAX_ANALYTICS_DAYS} days, the end on or after the start.`);
        }
    };

    const series = useApiResource<AnalyticsSeries>(
        `analytics:series:${range.from}:${range.to}:${segment}:${category}:${settledCity}:${live}`,
        async () => {
            refuse();
            return overviewService.analyticsSeries(seriesQuery);
        }
    );

    const tiles = useApiResource<AnalyticsTiles>(`analytics:tiles:${range.from}:${range.to}:${live}`, async () => {
        refuse();
        return overviewService.analyticsTiles(range.from, range.to);
    });

    const categories = useApiResource<BreakdownPage>(`analytics:breakdown:category:${range.from}:${range.to}:${live}`, async () => {
        refuse();
        return overviewService.breakdown({ from: range.from, to: range.to, by: "category", sort: "GMV_DESC" });
    });

    const topPublishers = useApiResource<BreakdownPage>(`analytics:breakdown:top-publishers:${range.from}:${range.to}:${live}`, async () => {
        refuse();
        return overviewService.breakdown({ from: range.from, to: range.to, by: "publisher", sort: "GMV_DESC", pageSize: TOP_PUBLISHERS });
    });

    /* The breakdown table: its dimension, search, sort and page all go to
       the API and sit in the key, so a change refetches rather than
       re-sorting the one page the console holds. */
    const [by, setBy] = React.useState<BreakdownDimension>("city");
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim(), 350);
    const [sort, setSort] = React.useState<BreakdownSort>("GMV_DESC");
    const [page, setPage] = React.useState(1);

    const breakdown = useApiResource<BreakdownPage>(
        `analytics:breakdown:${by}:${range.from}:${range.to}:${settledQ}:${sort}:${page}:${live}`,
        async () => {
            refuse();
            return overviewService.breakdown({
                from: range.from,
                to: range.to,
                by,
                ...(settledQ ? { q: settledQ } : {}),
                sort,
                page,
                pageSize: BREAKDOWN_PAGE_SIZE,
            });
        }
    );

    /* A new dimension, search or sort starts from the first page. */
    const changeBy = (next: BreakdownDimension) => {
        setBy(next);
        setQ("");
        setSort("GMV_DESC");
        setPage(1);
    };
    const changeQ = (next: string) => {
        setQ(next);
        setPage(1);
    };
    const changeSort = (next: BreakdownSort) => {
        setSort(next);
        setPage(1);
    };

    const breakdownRef = React.useRef<HTMLDivElement>(null);
    const seeAllPublishers = () => {
        changeBy("publisher");
        breakdownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const [exporting, setExporting] = React.useState(false);
    const exportCsv = async () => {
        setExporting(true);
        try {
            const result = await overviewService.exportCsv(seriesQuery);
            toast.success("Export ready", { description: `${result.filename} · ${(result.bytes / 1024).toFixed(1)} KB` });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not export the series");
        } finally {
            setExporting(false);
        }
    };

    const reloadAll = () => {
        series.reload();
        tiles.reload();
        categories.reload();
        topPublishers.reload();
        breakdown.reload();
    };
    const loading = series.loading || tiles.loading || categories.loading || topPublishers.loading || breakdown.loading;

    return (
        <div className="space-y-5">
            <PageHeader
                title="GMV and growth"
                subtitle="By Indian day, with the same number of days before it for comparison. GMV is what left advertiser wallets for media; the take rate is ADX's revenue over it."
                actions={
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-9 bg-card">
                                    <Calendar className="mr-1.5 size-4" />
                                    {rangeLabel}
                                    <ChevronDown className="ml-1.5 size-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {RANGE_PRESETS.map((option) => (
                                    <DropdownMenuItem
                                        key={option}
                                        onSelect={() => {
                                            if (option === "CUSTOM" && preset !== "CUSTOM") setCustom(range);
                                            setPreset(option);
                                            setPage(1);
                                        }}
                                    >
                                        {RANGE_PRESET_LABEL[option]}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {live && (
                            <>
                                <Button variant="outline" className="h-9 bg-card" onClick={exportCsv} disabled={exporting || !rangeValid}>
                                    {exporting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
                                    Export CSV
                                </Button>
                                <Button variant="outline" className="h-9 bg-card" onClick={reloadAll} disabled={loading} aria-label="Refresh">
                                    <RefreshCw className="size-4" />
                                </Button>
                            </>
                        )}
                    </>
                }
            />

            {live ? (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="inline-flex rounded-lg border bg-card p-0.5">
                            {SEGMENTS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setSegment(option)}
                                    aria-pressed={segment === option}
                                    className={cn(
                                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                        segment === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {SEGMENT_LABEL[option]}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {preset === "CUSTOM" && (
                                <div className="flex items-center gap-2 rounded-md border bg-card px-2">
                                    <Label htmlFor="analytics-from" className="text-xs font-normal text-muted-foreground">
                                        From
                                    </Label>
                                    <Input
                                        id="analytics-from"
                                        type="date"
                                        value={custom.from}
                                        max={today}
                                        onChange={(event) => {
                                            if (event.target.value) setCustom((current) => ({ ...current, from: event.target.value }));
                                            setPage(1);
                                        }}
                                        className="h-8 w-[150px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                                    />
                                    <Label htmlFor="analytics-to" className="text-xs font-normal text-muted-foreground">
                                        To
                                    </Label>
                                    <Input
                                        id="analytics-to"
                                        type="date"
                                        value={custom.to}
                                        min={custom.from}
                                        max={shiftDay(custom.from, MAX_ANALYTICS_DAYS - 1)}
                                        onChange={(event) => {
                                            if (event.target.value) setCustom((current) => ({ ...current, to: event.target.value }));
                                            setPage(1);
                                        }}
                                        className="h-8 w-[150px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                                    />
                                </div>
                            )}
                            <Select value={category || ALL} onValueChange={(value) => setCategory(value === ALL ? "" : (value as ListingCategory))}>
                                <SelectTrigger className="h-9 w-40 bg-card" aria-label="Category">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All categories</SelectItem>
                                    {LISTING_CATEGORIES.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {LISTING_CATEGORY_LABEL[option]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <CityCombobox
                                id="analytics-city"
                                value={city.text}
                                onChange={(text, picked) => setCity({ text, slug: picked?.slug ?? null })}
                                placeholder="City"
                                aria-label="City"
                                stages={CITY_STAGES}
                                className="w-44"
                            />
                        </div>
                    </div>

                    {!rangeValid && (
                        <Card className="rounded-lg border-danger/40 bg-danger-soft p-4 text-sm text-foreground shadow-none">
                            Pick a window of one to {MAX_ANALYTICS_DAYS} days, the end on or after the start.
                        </Card>
                    )}

                    <AnalyticsTilesRow tiles={tiles} rangeLabel={tileRangeLabel} />

                    <DailyGmvCard series={series} granularityLabel="Daily" />

                    <div className="grid gap-4 xl:grid-cols-2">
                        <CategoryBarsCard categories={categories} />
                        <TopPublishersCard publishers={topPublishers} onSeeAll={seeAllPublishers} />
                    </div>

                    <SeriesCards series={series} />

                    <div ref={breakdownRef}>
                        <BreakdownCard
                            breakdown={breakdown}
                            controls={{
                                by,
                                onByChange: changeBy,
                                q,
                                onQChange: changeQ,
                                sort,
                                onSortChange: changeSort,
                                page,
                                onPageChange: setPage,
                                pageSize: BREAKDOWN_PAGE_SIZE,
                            }}
                        />
                    </div>
                </>
            ) : (
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                        <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">
                        Not connected to the ADX backend
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        Every point on this page is a sum over the ledger. There is no seeded
                        stand-in, because a fixture day would look exactly like a real one. Set{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">
                            NEXT_PUBLIC_USE_API=true
                        </code>{" "}
                        and point the console at the API.
                    </p>
                </Card>
            )}
        </div>
    );
}
