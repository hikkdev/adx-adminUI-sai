"use client";

import * as React from "react";
import { EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountTile, MoneyTile, SeriesCard, StatTile, WindowPicker, useOverviewWindow } from "@/components/adx/overview";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { todayIST, type Delta } from "@/services/overview";
import { MAX_OVERVIEW_DAYS, windowValid } from "@/services/section-overviews";
import { listingRecordService, occupancyText, type ListingInsights, type Occupancy, type RatingOver } from "@/services/listing-record";

/**
 * The listing's Performance (3 Oct 2026) — the owner: "I don't see any
 * analytical stats for every listing".
 *
 * One read, `GET /listings/:id/insights`, over the window every overview
 * uses (the picker and its place in the URL are the overviews' own): the
 * tiles with their movement against the same number of days before, the
 * day series with the previous window ghosted, and the listing's whole
 * life underneath. What the platform does not record is said, never drawn
 * as a zero.
 *
 * 3 Oct 2026: views of the spot's own page — on the website and in the
 * apps — and the unique visitors behind them, once the read counts them.
 * A backend that does not yet sends no `views`, and the tab keeps its old
 * shape and the "not recorded" line.
 */
export function ListingPerformance({ listingId }: { listingId: string }) {
    const today = todayIST();
    const [window, setWindow] = useOverviewWindow();
    const valid = windowValid(window);
    const resource = useApiResource<ListingInsights>(`listing:${listingId}:insights:${window.from}:${window.to}`, async () => {
        if (!valid) throw new ApiError(400, "VALIDATION_ERROR", `Pick a window of one to ${MAX_OVERVIEW_DAYS} days, the end on or after the start.`);
        return listingRecordService.insights(listingId, window);
    });

    return (
        <div className="space-y-4" data-testid="listing-performance">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">How the spot did over the window, against the same number of days before it.</p>
                <div className="flex shrink-0 items-center gap-2">
                    <WindowPicker window={window} onChange={setWindow} today={today} cityFilter={false} />
                    <Button variant="outline" className="h-9 bg-card" onClick={resource.reload} disabled={resource.loading} aria-label="Refresh">
                        <RefreshCw className="size-4" />
                    </Button>
                </div>
            </div>
            <ResourceBoundary resource={resource}>{(data) => <PerformanceBody data={data} />}</ResourceBoundary>
        </div>
    );
}

/** The occupancy's movement in percentage points; none when either window had nothing to book. */
export function occupancyDelta(current: Occupancy, previous: Occupancy): Delta | null {
    if (current.rate === null || previous.rate === null) return null;
    const points = Math.round((current.rate - previous.rate) * 1000) / 10;
    return { text: `${points > 0 ? "+" : ""}${points} pts`, tone: points > 0 ? "positive" : points < 0 ? "negative" : "neutral" };
}

const ratingText = (rating: RatingOver): string => (rating.average === null ? "No reviews" : `★ ${Number(rating.average).toFixed(1)}`);

export function PerformanceBody({ data }: { data: ListingInsights }) {
    const { window: w, lifetime, series } = data;
    /* Counted: the views and visitors take a row of tiles, and the "not recorded" line about them goes. */
    const views = w.views;
    const visitors = w.uniqueVisitors;
    const counted = views !== undefined && visitors !== undefined;
    const untracked = counted ? data.untracked.filter((entry) => entry.metric !== "spotPageViews") : data.untracked;
    const occupancyHint =
        w.occupancy.current.availableSlotDays === 0
            ? data.onMarketFrom
                ? "no day on the market in this window"
                : "never on the market"
            : `${formatNumber(w.occupancy.current.bookedSlotDays)} of ${formatNumber(w.occupancy.current.availableSlotDays)} slot-days booked`;
    const ratingTile = (
        <StatTile
            label="Rating"
            value={ratingText(w.rating.current)}
            delta={null}
            previous={null}
            hint={`${formatNumber(w.rating.current.count)} review${w.rating.current.count === 1 ? "" : "s"} in the window`}
        />
    );
    return (
        <div className="space-y-4">
            <div className={counted ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-5" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"}>
                <CountTile label="Bookings" figure={w.bookings} hint="orders placed" />
                <MoneyTile label="Booked value" figure={w.bookedValue} hint="the campaign lines behind them" />
                <MoneyTile label="GMV earned" figure={w.gmv} hint="accrued gross, day by day" />
                <StatTile
                    label="Occupancy"
                    value={occupancyText(w.occupancy.current)}
                    delta={occupancyDelta(w.occupancy.current, w.occupancy.previous)}
                    previous={w.occupancy.previous.rate === null ? null : occupancyText(w.occupancy.previous)}
                    hint={occupancyHint}
                />
                {views && visitors ? (
                    <>
                        {ratingTile}
                        <CountTile label="Spot-page views" figure={views} hint="the spot’s page, on the website and in the apps" />
                        <CountTile label="Unique visitors" figure={visitors} hint="each counted once a day" />
                    </>
                ) : null}
                <CountTile label="Saves" figure={w.saves} hint="advertisers’ shortlists" />
                <CountTile label="Enquiries" figure={w.enquiries} hint="forms sent from its codes" />
                <CountTile label="QR scans" figure={w.scans} hint="codes on campaigns here" />
                {counted ? null : ratingTile}
            </div>

            {untracked.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-dashed bg-card px-4 py-3" data-testid="untracked">
                    {untracked.map((entry) => (
                        <li key={entry.metric} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
                            <span>
                                <span className="font-medium text-foreground">{entry.label}:</span> {entry.reason}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
                <SeriesCard id="listing-bookings" title="Bookings" hint="Orders placed each day" series={series.bookings} />
                <SeriesCard id="listing-booked-value" title="Booked value" hint="The campaign lines behind the day’s orders" series={series.bookedValue} money />
                <SeriesCard id="listing-occupied" title="Booked slots" hint={`Slots held by bookings each day, of ${data.slotsTotal}`} series={series.occupiedSlots} />
                <SeriesCard id="listing-gmv" title="GMV earned" hint="The accruals’ gross on the days they accrued" series={series.gmv} money />
                <SeriesCard id="listing-saves" title="Saves" hint="Advertisers who shortlisted the spot" series={series.saves} />
                <SeriesCard id="listing-scans" title="QR scans" hint="Scans of the campaign codes on this spot" series={series.scans} />
                {series.views && series.uniqueVisitors ? (
                    <>
                        <SeriesCard id="listing-views" title="Spot-page views" hint="Views of the spot’s page each day, on the website and in the apps" series={series.views} />
                        <SeriesCard id="listing-visitors" title="Unique visitors" hint="People who opened the spot’s page, each counted once a day" series={series.uniqueVisitors} />
                    </>
                ) : null}
            </div>

            <SectionCard
                title="Lifetime"
                description={data.onMarketFrom ? `Everything since it was filed; occupancy since it went live on ${formatDate(data.onMarketFrom)}.` : "Everything since it was filed. It has never been live."}
            >
                <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
                    <FieldList
                        items={[
                            ["Bookings", formatNumber(lifetime.bookings)],
                            ["Booked value", formatMoney(lifetime.bookedValue)],
                            ["GMV earned", formatMoney(lifetime.gmv)],
                            [
                                "Occupancy",
                                lifetime.occupancy.rate === null
                                    ? "—"
                                    : `${occupancyText(lifetime.occupancy)} · ${formatNumber(lifetime.occupancy.bookedSlotDays)} of ${formatNumber(lifetime.occupancy.availableSlotDays)} slot-days`,
                            ],
                            ["Rating", lifetime.rating.average === null ? "No reviews" : `★ ${Number(lifetime.rating.average).toFixed(1)} from ${formatNumber(lifetime.rating.count)}`],
                        ]}
                    />
                    <FieldList
                        items={[
                            ["Saves", formatNumber(lifetime.saves)],
                            ["Enquiries", formatNumber(lifetime.enquiries)],
                            ["QR scans", formatNumber(lifetime.scans)],
                            ["Link clicks", formatNumber(lifetime.clicks)],
                            ["Landing-page views", formatNumber(lifetime.landingViews)],
                            ...(lifetime.views !== undefined && lifetime.uniqueVisitors !== undefined
                                ? ([
                                      ["Spot-page views", formatNumber(lifetime.views)],
                                      ["Unique visitors", formatNumber(lifetime.uniqueVisitors)],
                                  ] as [string, string][])
                                : []),
                        ]}
                    />
                </div>
            </SectionCard>
        </div>
    );
}
