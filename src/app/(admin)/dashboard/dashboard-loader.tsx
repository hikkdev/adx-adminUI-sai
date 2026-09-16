"use client";

import * as React from "react";
import Link from "next/link";
import { Calendar, ChevronDown, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { AddPublisherCard } from "@/components/dashboard/add-publisher-card";
import { AssignOrderCard } from "@/components/dashboard/assign-order-card";
import { InsightsStrip } from "@/components/dashboard/insights-strip";
import { PayoutRunsCard } from "@/components/dashboard/payout-runs-card";
import { DashboardGmvChart, PublisherGrowthChart } from "@/components/charts/lazy";
import { isLive } from "@/lib/api-config";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApiResource, type ApiResource } from "@/lib/use-api-resource";
import { campaignService, type CampaignRow } from "@/services/campaigns";
import {
    currentMonthIST,
    foldMonthSeries,
    monthLabel,
    monthsEndingAt,
    overviewReadsApi,
    overviewService,
    overviewTiles,
    shiftMonth,
    type MonthOverview,
    type MonthSeriesPoint,
} from "@/services/overview";
/** How far back the month picker goes. A year of months, the current one first. */
const PICKER_MONTHS = 12;

/** The charts' window: twelve Indian calendar months ending at the picked one. */
const CHART_MONTHS = 12;

/**
 * DR 10's Dashboard (`5102:23003`), the numbers read from `GET /admin/overview`.
 *
 * The frame's grid is kept — the tile row, then the three-card rows — and the
 * tiles are the overview's figures for the Indian calendar month the picker
 * names, with the month before it fetched alongside for the delta line the
 * frame draws under each. The "Monthly GMV" bars and the "Publisher growth"
 * curve are E6's series read, `?from&to`, twelve months ending at the picked
 * one, with the month's bookings count as the line beside the bars. The
 * smart-insight strip above the tiles is Lot G's `GET /admin/overview/insights`
 * (Q112, package CG1): one chip per rule with something to say, coloured
 * by severity, opening the route the rule names, and hidden while the list
 * is empty.
 */
export function DashboardLoader() {
    const live = overviewReadsApi();
    const thisMonth = currentMonthIST();
    const [month, setMonth] = React.useState(thisMonth);
    const months = monthsEndingAt(thisMonth, PICKER_MONTHS).reverse();
    const chartMonths = monthsEndingAt(month, CHART_MONTHS);

    const overview = useApiResource<{ current: MonthOverview; previous: MonthOverview | null }>(
        `dashboard:overview:${month}:${live}`,
        async () => {
            if (!live) throw new Error("The console is not connected to the ADX backend.");
            const [current, previous] = await Promise.all([
                overviewService.month(month),
                // The delta line is decoration; a month that will not load
                // takes the delta with it, not the tile.
                overviewService.month(shiftMonth(month, -1)).catch(() => null),
            ]);
            return { current, previous };
        }
    );

    const series = useApiResource<MonthSeriesPoint[]>(
        `dashboard:series:${chartMonths[0]}:${month}:${live}`,
        async () => {
            if (!live) throw new Error("The console is not connected to the ADX backend.");
            const answer = await overviewService.series(chartMonths[0], month);
            return foldMonthSeries(chartMonths, answer.months);
        }
    );

    return (
        <div className="space-y-6">
            {live && <InsightsStrip />}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    {month === thisMonth ? "This month in India" : `${monthLabel(month)} in India`} —
                    bookings, GMV and the take rate are the ledger&apos;s figures for the calendar
                    month.
                </p>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="h-9 bg-card">
                            <Calendar className="mr-1.5 size-4" />
                            {monthLabel(month)}
                            <ChevronDown className="ml-1.5 size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {months.map((option) => (
                            <DropdownMenuItem key={option} onSelect={() => setMonth(option)}>
                                {monthLabel(option)}
                                {option === thisMonth ? " · now" : ""}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {live ? (
                <ResourceBoundary resource={overview}>
                    {({ current, previous }) => (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {overviewTiles(current, previous).map((stat) => (
                                <KpiCard key={stat.id} stat={stat} />
                            ))}
                        </div>
                    )}
                </ResourceBoundary>
            ) : (
                <OverviewOffline />
            )}

            {live && (
                <div className="grid gap-4 xl:grid-cols-2">
                    <ChartCard
                        title="Monthly GMV"
                        subtitle={`Recognised GMV by month, ${monthLabel(chartMonths[0])} to ${monthLabel(month)}; the line is how many bookings were paid for.`}
                        resource={series}
                    >
                        {(points) => <DashboardGmvChart data={points} />}
                    </ChartCard>
                    <ChartCard
                        title="Publisher growth"
                        subtitle={
                            overview.data
                                ? `${formatNumber(overview.data.current.newPublishers)} new ${overview.data.current.newPublishers === 1 ? "publisher" : "publishers"} joined in ${monthLabel(month)}`
                                : "New publishers by month"
                        }
                        resource={series}
                    >
                        {(points) => <PublisherGrowthChart data={points} />}
                    </ChartCard>
                </div>
            )}

            <RecentBookingsCard
                overview={overview.data?.current ?? null}
                monthName={monthLabel(month)}
            />

            <div className="grid gap-4 xl:grid-cols-12">
                <div className="xl:col-span-5">
                    <PayoutRunsCard />
                </div>
                <div className="xl:col-span-4">
                    <AddPublisherCard />
                </div>
                <div className="xl:col-span-3">
                    <AssignOrderCard />
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Recent bookings                                                     */
/* ------------------------------------------------------------------ */

/** A booking is a campaign an advertiser has paid for. Drafts and unpaid ones are not bookings yet. */
const BOOKED: CampaignRow["status"][] = ["SCHEDULED", "LIVE", "PAUSED", "COMPLETED"];

/**
 * The frame's "Recent bookings" list, read from `/campaigns` — the newest paid
 * campaigns, with the advertiser's brand, the campaign name and what the
 * chosen spots came to. The frame's "Bookings this month: 265 · Average
 * value: ₹68K" line is the overview's own `bookingsCount` and
 * `averageBookingValue` (E6) — counted and divided on the server, never
 * from the four rows below.
 */
function RecentBookingsCard({
    overview,
    monthName,
}: {
    overview: MonthOverview | null;
    monthName: string;
}) {
    const live = isLive("campaigns");
    const resource = useApiResource<CampaignRow[]>(`dashboard:recent-bookings:${live}`, async () => {
        if (!live) return [];
        const page = await campaignService.list({ status: BOOKED, sort: "NEWEST", pageSize: 4 });
        return page.items.slice(0, 4);
    });

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h2 className="text-base font-semibold text-foreground">Recent bookings</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
                {overview ? (
                    <>
                        Bookings in {monthName}:{" "}
                        <span className="font-medium text-foreground">{formatNumber(overview.bookingsCount)}</span>
                        {" · "}Average value:{" "}
                        <span className="font-medium text-foreground">{formatMoney(overview.averageBookingValue)}</span>
                        {" · "}Authorised:{" "}
                        <span className="font-medium text-foreground">{formatMoney(overview.bookingsAuthorised)}</span>
                    </>
                ) : (
                    "The newest paid campaigns"
                )}
            </p>
            {!live ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    Campaigns are read from the API. Nothing to show while it is off.
                </p>
            ) : resource.error ? (
                <p className="mt-4 text-sm text-muted-foreground">{resource.error}</p>
            ) : resource.data && resource.data.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    No campaign has been paid for yet.{" "}
                    <Link href="/campaigns" className="underline underline-offset-4">
                        Open the worklist
                    </Link>
                    .
                </p>
            ) : (
                <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {(resource.data ?? []).map((campaign) => (
                        <li key={campaign.id} className="flex items-center gap-3">
                            <InitialsAvatar name={campaign.brandName ?? campaign.name} size="md" />
                            <div className="min-w-0 flex-1">
                                <Link
                                    href={`/campaigns/${campaign.id}`}
                                    className="block truncate text-sm font-medium text-foreground hover:underline"
                                >
                                    {campaign.brandName ?? campaign.name}
                                </Link>
                                <p className="truncate text-xs text-muted-foreground">
                                    Campaign: {campaign.name}
                                </p>
                            </div>
                            <p className="text-sm font-semibold text-foreground">
                                {formatMoney(campaign.committed)}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* The two charts                                                      */
/* ------------------------------------------------------------------ */

/**
 * One of the frame's two chart cards over the series read. Both share the
 * resource, so a failed read says so once per card rather than emptying the
 * row, and a month the series left out is a gap on the axis, not a zero.
 */
function ChartCard({
    title,
    subtitle,
    resource,
    children,
}: {
    title: string;
    subtitle: string;
    resource: ApiResource<MonthSeriesPoint[]>;
    children: (points: MonthSeriesPoint[]) => React.ReactNode;
}) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-4">
                {resource.error ? (
                    <p className="text-sm text-muted-foreground">{resource.error}</p>
                ) : resource.data && resource.data.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None of the twelve months could be read.</p>
                ) : resource.data ? (
                    children(resource.data)
                ) : (
                    <div className="h-[240px] animate-pulse rounded-md bg-muted/60" aria-hidden />
                )}
            </div>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Offline                                                             */
/* ------------------------------------------------------------------ */

function OverviewOffline() {
    return (
        <Card className="rounded-lg border-border p-8 text-center shadow-none">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">
                Not connected to the ADX backend
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                The month&apos;s bookings, GMV and take rate are sums over the ledger. There is no
                seeded stand-in, because a fixture figure would look exactly like a live one. Set{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code>{" "}
                and point the console at the API.
            </p>
        </Card>
    );
}
