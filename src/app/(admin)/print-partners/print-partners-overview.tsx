"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownTable, CountTile, MixBar, SectionOverviewLoader, SeriesCard, StatTile, TopList } from "@/components/adx/overview";
import { formatMoney, formatNumber, formatPct } from "@/lib/format";
import { SECTION_META, consoleHref, kycMixItems, typedSpellingsHover, type PrintPartnersOverview } from "@/services/section-overviews";
import { PrintPartnersNav } from "./print-partners-nav";

const meta = SECTION_META["print-partners"];

/**
 * The print partner desk's Overview tab — package O-C over
 * `GET /section-overviews/print-partners`: the tiles, the average
 * turnaround (request to collection, in days), the awards won (quotes
 * submitted in the window and how many were accepted), the three day
 * series (requests sent, quotes received, jobs completed — a job is
 * complete when the prints were collected), the by-city and by-capability
 * breakdowns, and the top ten by jobs with the approved cost as earnings.
 */
export function PrintPartnersOverviewView() {
    return (
        <SectionOverviewLoader
            section="print-partners"
            title="Print partners"
            subtitle="The shops ADX pays to print a booking — the window's movement against the same number of days before it."
            actions={
                <Button variant="outline" className="h-9 bg-card" asChild>
                    <Link href={meta.directory}>
                        <Plus className="size-4" />
                        Add partner
                    </Link>
                </Button>
            }
            nav={<PrintPartnersNav />}
        >
            {(data, window) => <PrintPartnersOverviewBody data={data} link={(href: string | null) => consoleHref("print-partners", href, window)} />}
        </SectionOverviewLoader>
    );
}

const days = (value: number | null): string => (value === null ? "—" : `${value.toFixed(2)} d`);

export function PrintPartnersOverviewBody({ data, link }: { data: PrintPartnersOverview; link: (href: string | null) => string | null }) {
    const { tiles, series, breakdowns, top, averageTurnaroundDays, awardsWon } = data;
    const turnaroundDelta =
        averageTurnaroundDays.delta === null
            ? null
            : {
                  text: `${averageTurnaroundDays.delta > 0 ? "+" : ""}${averageTurnaroundDays.delta.toFixed(2)} d`,
                  /* A shorter turnaround is the good direction. */
                  tone: averageTurnaroundDays.delta < 0 ? ("positive" as const) : averageTurnaroundDays.delta > 0 ? ("negative" as const) : ("neutral" as const),
              };
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="Partners" figure={tiles.total} hint="as at the window's close" href={meta.directory} />
                <CountTile label="New in window" figure={tiles.newInWindow} hint="added to the roster" />
                <CountTile label="Active" figure={tiles.active} />
                <CountTile label="Taking quote requests" figure={tiles.acceptingQuoteRequests} hint="active and opted in, as of now" />
                <CountTile label="Quote requests sent" figure={series.quoteRequestsSent.total} href="/print-partners/quote-requests" />
                <CountTile label="Quotes received" figure={series.quotesReceived.total} />
                <CountTile label="Jobs completed" figure={series.jobsCompleted.total} hint="prints collected" />
                <StatTile
                    label="Average turnaround"
                    value={days(averageTurnaroundDays.value)}
                    delta={turnaroundDelta}
                    previous={averageTurnaroundDays.previous === null ? null : days(averageTurnaroundDays.previous)}
                    hint={averageTurnaroundDays.value === null ? "no job collected in the window" : "request to collection"}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <MixBar
                    title="KYC by state"
                    hint="Every partner, by where their verification stands now — each state opens the queue with that chip on."
                    items={kycMixItems(tiles.kyc, meta.kycQueue)}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                    <CountTile label="Quotes submitted" figure={awardsWon.quotes} hint="in the window" />
                    <CountTile label="Awarded" figure={awardsWon.awarded} hint="accepted by ops" />
                    <StatTile label="Award share" value={formatPct(awardsWon.sharePct)} delta={null} previous={null} hint="awarded over submitted, this window" />
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <SeriesCard id="quote-requests" title="Quote requests sent" hint="Requests raised by day" series={series.quoteRequestsSent} />
                <SeriesCard id="quotes" title="Quotes received" hint="Quotes submitted by partners, by day" series={series.quotesReceived} />
                <SeriesCard id="print-jobs" title="Jobs completed" hint="Prints collected, by day" series={series.jobsCompleted} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownTable
                    title="By city"
                    hint="Partners per city, as of now — a city narrows this overview."
                    labelHeading="City"
                    page={breakdowns.byCity}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    hoverFor={typedSpellingsHover}
                    columns={[{ key: "count", label: "Partners", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By capability"
                    hint="Partners per capability — a shop with three counts in three."
                    labelHeading="Capability"
                    page={breakdowns.byCapability}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Partners", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
            </div>

            <TopList
                title="Top partners by jobs"
                hint="Jobs collected in the window, with the approved cost on them."
                items={top.byJobs.items.map((row) => ({
                    key: row.key,
                    label: row.label,
                    displayId: row.displayId,
                    href: link(row.href),
                    primary: `${formatNumber(row.jobs)} ${row.jobs === 1 ? "job" : "jobs"}`,
                    secondary: formatMoney(row.earnings),
                }))}
                emptyMessage="No partner collected a job in this window."
            />
        </>
    );
}
