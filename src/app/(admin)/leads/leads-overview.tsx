"use client";

import Link from "next/link";
import { Filter, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BreakdownTable, CountTile, FunnelCard, MixBar, MoneyTile, SectionOverviewLoader, SeriesCard, StatTile } from "@/components/adx/overview";
import { formatMoney, formatNumber } from "@/lib/format";
import { moneyDelta } from "@/services/overview";
import { SECTION_META, consoleHref, daysDelta, timeToConvertLine, typedSpellingsHover, type LeadsOverview } from "@/services/section-overviews";
import { LeadsNav } from "./leads-nav";

const meta = SECTION_META.leads;

/**
 * LH9: the Leads section's Overview tab over `GET /section-overviews/leads`
 * — aggregates only. The window's movement (new, contacted, converted,
 * activated, lost) against the same number of days before it; the funnel
 * by stage over the window's cohort with the pipeline value per stage, as
 * the funnel desk answers it; the three day series; the conversion by
 * source, agent, city, category and channel with its rate; the time to
 * convert as a mean and a median; the cost per activation — the hunt's
 * recorded rewards plus the priority top-ups over the catches; and the
 * recycle yield.
 */
export function LeadsOverviewView() {
    return (
        <SectionOverviewLoader
            section="leads"
            title="Leads"
            subtitle="The hunt — the window's movement against the same number of days before it."
            actions={
                <>
                    <Button variant="outline" className="h-9 bg-card" asChild>
                        <Link href="/leads/funnel">
                            <Filter className="size-4" />
                            Funnel desk
                        </Link>
                    </Button>
                    <Button variant="outline" className="h-9 bg-card" asChild>
                        <Link href="/leads/board">
                            <LayoutGrid className="size-4" />
                            Board
                        </Link>
                    </Button>
                </>
            }
            nav={<LeadsNav />}
        >
            {(data, window) => <LeadsOverviewBody data={data} link={(href: string | null) => consoleHref("leads", href, window)} />}
        </SectionOverviewLoader>
    );
}

const TEMPERATURE_TONE = { HOT: "danger", WARM: "warning", COLD: "info" } as const;
const LOSS_LABEL: Record<string, string> = {
    PRICE: "Price",
    TIMING: "Timing",
    NOT_INTERESTED: "Not interested",
    WRONG_CONTACT: "Wrong contact",
    COMPETITOR: "Competitor",
    OTHER: "Other",
};

const days = (value: number | null): string => (value === null ? "—" : `${value} ${value === 1 ? "day" : "days"}`);

export function LeadsOverviewBody({ data, link }: { data: LeadsOverview; link: (href: string | null) => string | null }) {
    const { tiles, funnel, series, breakdowns, conversion, recycle, money } = data;
    const cost = conversion.costPerActivation;
    const time = conversion.timeToConvert;
    const rate = (row: { ratePct: string }) => `${row.ratePct}%`;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="Open now" figure={tiles.open} hint="neither converted nor lost" href={meta.directory} />
                <CountTile label="New in window" figure={tiles.newInWindow} hint="leads created" />
                <CountTile label="First contacts" figure={tiles.contacted} hint="stamped once per lead" />
                <CountTile label="Converted" figure={tiles.converted} hint="accounts opened off a lead" />
                <CountTile label="Activated" figure={tiles.activated} hint="the catch — first listing live / first campaign paid" />
                <CountTile label="Lost" figure={tiles.lost} hint="marked lost in the window" />
                <StatTile
                    label="Time to convert"
                    value={timeToConvertLine(time)}
                    delta={daysDelta(time.meanDays, time.previousMeanDays)}
                    previous={time.previousMeanDays === null ? null : `${days(time.previousMeanDays)} · median ${time.previousMedianDays ?? "—"}`}
                    hint="from creation to conversion, over the window's conversions"
                />
                <StatTile
                    label="Cost per activation"
                    value={cost.value === null ? "No activation yet" : formatMoney(cost.value)}
                    delta={cost.value !== null && cost.previous !== null ? moneyDelta(cost.value, cost.previous) : null}
                    previous={cost.previous === null ? null : formatMoney(cost.previous)}
                    hint={`${formatMoney(cost.incentives)} rewards + ${formatMoney(cost.topUps)} top-ups over ${formatNumber(cost.activations)} ${cost.activations === 1 ? "activation" : "activations"}`}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <FunnelCard
                    title="Funnel by stage"
                    hint={`The ${formatNumber(funnel.totals.leads)} leads created in the window, by the stage they hold now — pipeline worth ${formatMoney(conversion.pipelineValue)}.`}
                    steps={funnel.byStage.filter((row) => row.key !== "LOST").map((row) => ({ key: row.key, label: row.label, value: row.count }))}
                    href="/leads/funnel"
                    className="xl:col-span-2"
                />
                <div className="grid gap-4">
                    <MixBar
                        title="Open leads by temperature"
                        hint="As of now — a segment opens the list with that temperature on."
                        items={tiles.byTemperature.items.map((row) => ({
                            key: row.key,
                            label: row.label,
                            count: row.count,
                            href: link(row.href),
                            tone: TEMPERATURE_TONE[row.key as keyof typeof TEMPERATURE_TONE] ?? "neutral",
                        }))}
                    />
                    <MixBar
                        title="Why leads were lost"
                        hint={`${formatNumber(funnel.totals.lost)} lost in the cohort, by reason (D11).`}
                        items={funnel.lossMix.map((row, index) => ({
                            key: row.reason,
                            label: LOSS_LABEL[row.reason] ?? row.reason,
                            count: row.count,
                            href: null,
                            tone: (["danger", "warning", "neutral", "info", "success"] as const)[index % 5],
                        }))}
                        emptyMessage="Nothing lost in this cohort."
                    />
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <SeriesCard id="new-leads" title="New leads" hint="Leads created, by day" series={series.newLeads} />
                <SeriesCard id="conversions" title="Conversions" hint="Accounts opened off a lead, by day" series={series.conversions} />
                <SeriesCard id="activations" title="Activations" hint="First listing live / first campaign paid, by day" series={series.activations} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="rounded-lg border-border p-5 shadow-none" data-testid="leads-pipeline-value">
                    <h2 className="text-sm font-semibold text-foreground">Pipeline value by stage</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">The estimated worth of the cohort's leads at each stage, and how long they have sat there on average.</p>
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                    <th className="py-2 pr-3 font-medium">Stage</th>
                                    <th className="py-2 pr-3 text-right font-medium">Leads</th>
                                    <th className="py-2 pr-3 text-right font-medium">Value</th>
                                    <th className="py-2 text-right font-medium">Avg days</th>
                                </tr>
                            </thead>
                            <tbody>
                                {funnel.byStage.map((row) => (
                                    <tr key={row.key} className="border-b last:border-0" data-testid={`leads-stage-${row.key}`}>
                                        <td className="py-2 pr-3 text-foreground">{row.label}</td>
                                        <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(row.count)}</td>
                                        <td className="py-2 pr-3 text-right tabular-nums">{row.value === null ? "—" : formatMoney(row.value)}</td>
                                        <td className="py-2 text-right tabular-nums text-muted-foreground">{row.avgDaysInStage === null ? "—" : row.avgDaysInStage}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
                <div className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <CountTile label="Recycled" figure={recycle.recycled} hint="losses on price or timing back in the pool after 60 days (D11)" />
                        <StatTile
                            label="Recycle yield"
                            value={`${recycle.yieldPct}%`}
                            delta={null}
                            previous={null}
                            hint={`${formatNumber(recycle.convertedAfterRecycle.value)} of ${formatNumber(recycle.recycled.value)} recycled leads converted since`}
                        />
                        <MoneyTile label="Hunt rewards recorded" figure={money.incentives} hint="LEAD_CONVERTED / ACTIVATED / RETAINED, any status but rejected" href="/finance/incentives" />
                        <MoneyTile label="Priority top-ups" figure={money.topUps} hint="under the zone budgets and the monthly cap (D7)" href="/leads/priority-zones" />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownTable
                    title="Conversion by source"
                    hint="The cohort per source door, how many converted, the rate."
                    labelHeading="Source"
                    page={breakdowns.bySource}
                    initialSort="leads"
                    linkFor={(row) => link(row.href)}
                    columns={[
                        { key: "leads", label: "Leads", align: "right", render: (row) => formatNumber(row.leads), sortValue: (row) => row.leads },
                        { key: "converted", label: "Converted", align: "right", render: (row) => formatNumber(row.converted), sortValue: (row) => row.converted },
                        { key: "activated", label: "Activated", align: "right", render: (row) => formatNumber(row.activated), sortValue: (row) => row.activated },
                        { key: "rate", label: "Rate", align: "right", render: rate, sortValue: (row) => Number(row.ratePct) },
                    ]}
                />
                <BreakdownTable
                    title="Conversion by agent"
                    hint="The cohort per holder, how many converted, the rate."
                    labelHeading="Agent"
                    page={breakdowns.byAgent}
                    initialSort="leads"
                    linkFor={(row) => link(row.href)}
                    columns={[
                        { key: "leads", label: "Leads", align: "right", render: (row) => formatNumber(row.leads), sortValue: (row) => row.leads },
                        { key: "converted", label: "Converted", align: "right", render: (row) => formatNumber(row.converted), sortValue: (row) => row.converted },
                        { key: "rate", label: "Rate", align: "right", render: rate, sortValue: (row) => Number(row.ratePct) },
                    ]}
                />
                <BreakdownTable
                    title="Conversion by city"
                    hint="Leads created in the window per city and how many of them converted — a city narrows this overview."
                    labelHeading="City"
                    page={breakdowns.byCity}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    hoverFor={typedSpellingsHover}
                    columns={[
                        { key: "count", label: "Leads", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count },
                        { key: "converted", label: "Converted", align: "right", render: (row) => formatNumber(row.converted), sortValue: (row) => row.converted },
                        { key: "rate", label: "Rate", align: "right", render: rate, sortValue: (row) => Number(row.ratePct) },
                    ]}
                />
                <BreakdownTable
                    title="Conversion by category"
                    hint="The cohort per business category, how many converted, the rate — a row opens the list on that category."
                    labelHeading="Category"
                    page={breakdowns.byCategory}
                    initialSort="leads"
                    linkFor={(row) => link(row.href)}
                    columns={[
                        { key: "leads", label: "Leads", align: "right", render: (row) => formatNumber(row.leads), sortValue: (row) => row.leads },
                        { key: "converted", label: "Converted", align: "right", render: (row) => formatNumber(row.converted), sortValue: (row) => row.converted },
                        { key: "rate", label: "Rate", align: "right", render: rate, sortValue: (row) => Number(row.ratePct) },
                    ]}
                />
                <BreakdownTable
                    title="Conversion by channel"
                    hint="D14: the channel that produced each first contact, engagement and conversion in the cohort."
                    labelHeading="Channel"
                    page={breakdowns.byChannel}
                    initialSort="converted"
                    linkFor={() => null}
                    columns={[
                        { key: "firstContact", label: "First contacts", align: "right", render: (row) => formatNumber(row.firstContact), sortValue: (row) => row.firstContact },
                        { key: "engaged", label: "Engaged", align: "right", render: (row) => formatNumber(row.engaged), sortValue: (row) => row.engaged },
                        { key: "converted", label: "Converted", align: "right", render: (row) => formatNumber(row.converted), sortValue: (row) => row.converted },
                    ]}
                    className="xl:col-span-2"
                />
            </div>
        </>
    );
}
