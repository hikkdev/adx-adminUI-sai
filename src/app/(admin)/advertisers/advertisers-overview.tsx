"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownTable, CountTile, FunnelCard, MixBar, MoneyTile, SectionOverviewLoader, SeriesCard, TopList } from "@/components/adx/overview";
import { formatMoney, formatNumber } from "@/lib/format";
import { SECTION_META, consoleHref, kycMixItems, typedSpellingsHover, type AdvertisersOverview } from "@/services/section-overviews";
import { AdvertisersNav } from "./advertisers-nav";

const meta = SECTION_META.advertisers;

/**
 * The Advertisers section's Overview tab — package O-C over
 * `GET /section-overviews/advertisers`: the tiles, the two money figures
 * (the wallet balance held is a state, the top-ups a window), the demand
 * funnel as `advertisers` answers it, the three day series (spend is
 * what advertisers committed by the day they pressed pay), the four
 * breakdowns and the top ten by spend.
 */
export function AdvertisersOverviewView() {
    return (
        <SectionOverviewLoader
            section="advertisers"
            title="Advertisers"
            subtitle="Brands and businesses buying media — the window's movement against the same number of days before it."
            actions={
                <Button variant="outline" className="h-9 bg-card" asChild>
                    <Link href={meta.directory}>
                        <Plus className="size-4" />
                        Add advertiser
                    </Link>
                </Button>
            }
            nav={<AdvertisersNav />}
        >
            {(data, window) => <AdvertisersOverviewBody data={data} link={(href: string | null) => consoleHref("advertisers", href, window)} />}
        </SectionOverviewLoader>
    );
}

export function AdvertisersOverviewBody({ data, link }: { data: AdvertisersOverview; link: (href: string | null) => string | null }) {
    const { tiles, money, funnel, series, breakdowns, top } = data;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="Advertisers" figure={tiles.total} hint="as at the window's close" href={meta.directory} />
                <CountTile label="New in window" figure={tiles.newInWindow} hint="signed up" />
                <CountTile label="Active" figure={tiles.active} hint="a campaign ran on a day of the window" href="/campaigns" />
                <CountTile label="First campaigns" figure={series.firstCampaigns.total} hint="advertisers whose first campaign was paid in the window" />
                <MoneyTile label="Spend" figure={series.spend.total} hint="campaigns and packages paid" />
                <MoneyTile label="Wallet top-ups" figure={money.topUps} hint="received into advertiser wallets" />
                <MoneyTile label="Wallet balance held" figure={money.walletBalanceHeld} hint="across advertiser wallets, as of now" href="/finance" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <MixBar
                    title="KYC by state"
                    hint="Every advertiser, by where their verification stands now — each state opens the queue with that chip on."
                    items={kycMixItems(tiles.kyc, meta.kycQueue)}
                />
                <FunnelCard
                    title="Demand funnel"
                    hint="The platform's state now, not the window's."
                    href="/advertisers/activation"
                    steps={[
                        { key: "accounts", label: "Account created", value: funnel.accountsCreated },
                        { key: "profile", label: "Profile complete", value: funnel.profileComplete },
                        { key: "kyc", label: "KYC verified", value: funnel.kycVerified },
                        { key: "platform", label: "Platform agreement", value: funnel.platformAgreementAccepted },
                        { key: "funded", label: "Funded", value: funnel.funded },
                    ]}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <SeriesCard id="new-advertisers" title="New advertisers" hint="Sign-ups by day" series={series.newAdvertisers} />
                <SeriesCard id="first-campaigns" title="First campaigns" hint="Advertisers whose first paid campaign was paid that day" series={series.firstCampaigns} />
                <SeriesCard id="spend" title="Spend" hint="Campaigns plus package sales, by the day they were paid" series={series.spend} money />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownTable
                    title="By city"
                    hint="Advertisers, and what they paid in the window — a city narrows this overview."
                    labelHeading="City"
                    page={breakdowns.byCity}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    hoverFor={typedSpellingsHover}
                    columns={[
                        { key: "count", label: "Advertisers", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count },
                        { key: "spend", label: "Spend", align: "right", render: (row) => formatMoney(row.spend), sortValue: (row) => Number(row.spend) },
                    ]}
                />
                <BreakdownTable
                    title="By industry"
                    hint="Advertisers per industry, as of now."
                    labelHeading="Industry"
                    page={breakdowns.byIndustry}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Advertisers", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By package tier"
                    hint="Package sales active now, per tier."
                    labelHeading="Tier"
                    page={breakdowns.byPackageTier}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Active sales", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By agent"
                    hint="Advertisers each agent brought in — the agent's page."
                    labelHeading="Agent"
                    page={breakdowns.byAgent}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Advertisers", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
            </div>

            <TopList
                title="Top advertisers by spend"
                hint="Campaigns plus package sales paid in the window, the ten largest."
                items={top.bySpend.items.map((row) => ({ key: row.key, label: row.label, displayId: row.displayId, href: link(row.href), primary: formatMoney(row.amount) }))}
                emptyMessage="No advertiser paid for anything in this window."
            />
        </>
    );
}
