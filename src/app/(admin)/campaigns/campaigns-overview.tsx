"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownTable, CountTile, MixBar, MoneyTile, SectionOverviewLoader, SeriesCard, StatTile, TopList } from "@/components/adx/overview";
import { formatMoney, formatNumber } from "@/lib/format";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_TONE, campaignStatusLabel, waitingOnLabel, type CampaignStatus } from "@/services/campaigns";
import { SECTION_META, consoleHref, typedSpellingsHover, type CampaignsOverview } from "@/services/section-overviews";
import { CampaignsNav } from "./campaigns-nav";

const meta = SECTION_META.campaigns;

/**
 * The Campaigns section's Overview tab — 2 Oct 2026, the owner: "Campaigns
 * section feels too weak here." Built the way the Listings overview is,
 * over `GET /section-overviews/campaigns`: every card is a field of that
 * one read, the window and the city in the URL.
 */
export function CampaignsOverviewView() {
    return (
        <SectionOverviewLoader
            section="campaigns"
            title="Campaigns"
            subtitle="Every campaign on ADX — what is running, what is waiting, and what the window booked against the same number of days before it."
            actions={
                <Button className="h-9" asChild>
                    <Link href="/campaigns/new">
                        <Plus className="size-4" />
                        New campaign
                    </Link>
                </Button>
            }
            nav={<CampaignsNav />}
        >
            {(data, window) => <CampaignsOverviewBody data={data} link={(href: string | null) => consoleHref("campaigns", href, window)} />}
        </SectionOverviewLoader>
    );
}

const isStatus = (key: string): key is CampaignStatus => (CAMPAIGN_STATUSES as readonly string[]).includes(key);

/** "in the next 7 days" — a work list's horizon in words. */
const nextDays = (days: number): string => `in the next ${days} ${days === 1 ? "day" : "days"}`;

export function CampaignsOverviewBody({ data, link }: { data: CampaignsOverview; link: (href: string | null) => string | null }) {
    const { tiles, money, series, work, breakdowns } = data;
    const waiting = work.waitingToLaunch;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="Live" figure={tiles.live} hint="running now" href={`${meta.directory}?status=LIVE`} />
                <CountTile label="Scheduled" figure={tiles.scheduled} hint="paid, starting later" href={`${meta.directory}?status=SCHEDULED`} />
                <CountTile label="Awaiting payment" figure={tiles.awaitingPayment} hint="sent to the advertiser to pay" href={`${meta.directory}?status=PENDING_PAYMENT`} />
                <CountTile label="Waiting to launch" figure={tiles.waitingToLaunch} hint="paid, but something holds it back" href={link(waiting.href) ?? "/campaigns/launch-queue"} />
                <CountTile label="Paid" figure={tiles.paid} hint="campaigns paid for in the window" />
                <CountTile label="Completed" figure={tiles.completed} hint="finished in the window" href={`${meta.directory}?status=COMPLETED`} />
                <CountTile label="Cancelled" figure={tiles.cancelled} hint="cancelled in the window" href={`${meta.directory}?status=CANCELLED`} />
                <MoneyTile label="Booked value" figure={money.bookedValue} hint="what the campaigns paid in the window come to" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="QR scans" figure={tiles.scans} hint="every campaign code, in the window" />
                <CountTile label="Landing page views" figure={tiles.landingViews} hint="in the window" href="/campaigns/landing-pages" />
                <CountTile label="CTA clicks" figure={tiles.ctaClicks} hint="on the landing pages, in the window" />
                <CountTile label="Enquiries" figure={tiles.enquiries} hint="landing-page forms sent in the window" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <StatTile
                    label="Launching soon"
                    value={formatNumber(work.launchingSoon.count)}
                    delta={null}
                    previous={null}
                    hint={`scheduled, starting ${nextDays(work.launchingSoon.horizonDays)}`}
                    href={link(work.launchingSoon.href)}
                />
                <StatTile
                    label="Ending soon"
                    value={formatNumber(work.endingSoon.count)}
                    delta={null}
                    previous={null}
                    hint={`live, ending ${nextDays(work.endingSoon.horizonDays)}`}
                    href={link(work.endingSoon.href)}
                />
            </div>

            <MixBar
                title="Waiting to launch, by reason"
                hint="What holds back the campaigns already paid for — each reason opens the launch queue cut to it. A campaign waiting on two counts under both."
                emptyMessage="Nothing paid is waiting."
                items={waiting.byReason.items.map((row) => ({
                    key: row.key,
                    label: waitingOnLabel(row.key),
                    count: row.count,
                    href: link(row.href),
                    tone: "warning",
                }))}
            />

            <MixBar
                title="By status"
                hint="Every campaign, by where it stands now — each status opens the list with that status chosen."
                items={breakdowns.byStatus.items.map((row) => ({
                    key: row.key,
                    label: isStatus(row.key) ? campaignStatusLabel(row.key) : row.label,
                    count: row.count,
                    href: link(row.href),
                    tone: isStatus(row.key) ? CAMPAIGN_STATUS_TONE[row.key] : "neutral",
                }))}
            />

            <div className="grid gap-4 xl:grid-cols-2">
                <SeriesCard id="campaigns-booked" title="Booked value" hint="What the campaigns paid for came to, by day" series={series.bookedValue} money />
                <SeriesCard id="campaign-scans" title="QR scans" hint="Scans of every campaign code, by day" series={series.scans} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownTable
                    title="By city"
                    hint="Campaigns aimed at each city, the live ones, and what was booked in the window — a city narrows this overview."
                    labelHeading="City"
                    page={breakdowns.byCity}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    hoverFor={typedSpellingsHover}
                    columns={[
                        { key: "count", label: "Campaigns", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count },
                        { key: "live", label: "Live", align: "right", render: (row) => formatNumber(row.live), sortValue: (row) => row.live },
                        { key: "booked", label: "Booked", align: "right", render: (row) => formatMoney(row.bookedValue), sortValue: (row) => Number(row.bookedValue) },
                    ]}
                />
                <BreakdownTable
                    title="By goal"
                    hint="What the advertisers asked their campaigns to do, and how many of each are live — a goal opens the list."
                    labelHeading="Goal"
                    page={breakdowns.byGoal}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[
                        { key: "count", label: "Campaigns", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count },
                        { key: "live", label: "Live", align: "right", render: (row) => formatNumber(row.live), sortValue: (row) => row.live },
                    ]}
                />
            </div>

            <TopList
                title="Top advertisers by booked value"
                hint="The ten advertisers whose campaigns paid in the window come to the most."
                items={breakdowns.byAdvertiser.items.map((row) => ({
                    key: row.key,
                    label: row.label,
                    displayId: row.displayId,
                    href: link(row.href),
                    primary: formatMoney(row.amount),
                    secondary: `${formatNumber(row.count)} ${row.count === 1 ? "campaign" : "campaigns"}`,
                }))}
                emptyMessage="No campaign was paid for in this window."
            />
        </>
    );
}
