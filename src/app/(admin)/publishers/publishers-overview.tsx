"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownTable, CountTile, FunnelCard, MixBar, MoneyTile, SectionOverviewLoader, SeriesCard, TopList } from "@/components/adx/overview";
import { formatMoney, formatNumber } from "@/lib/format";
import { LISTING_CATEGORY_LABEL, type ListingCategory } from "@/services/overview";
import { SECTION_META, consoleHref, kycMixItems, typedSpellingsHover, type PublishersOverview } from "@/services/section-overviews";
import { PublishersNav } from "./publishers-nav";

const meta = SECTION_META.publishers;

/**
 * The Publishers section's Overview tab — package O-C over
 * `GET /section-overviews/publishers`. Every card is a field of that one
 * read, and nothing else: the six tiles, the two money figures, the
 * supply funnel as `supply` answers it (the state now, not the window's),
 * the three day series, the four breakdowns and the top ten by earnings.
 */
export function PublishersOverviewView() {
    return (
        <SectionOverviewLoader
            section="publishers"
            title="Publishers"
            subtitle="Media owners on the marketplace, however they arrived — the window's movement against the same number of days before it."
            actions={
                <Button variant="outline" className="h-9 bg-card" asChild>
                    <Link href={meta.directory}>
                        <Plus className="size-4" />
                        Onboard a publisher
                    </Link>
                </Button>
            }
            nav={<PublishersNav />}
        >
            {(data, window) => <PublishersOverviewBody data={data} link={(href: string | null) => consoleHref("publishers", href, window)} />}
        </SectionOverviewLoader>
    );
}

export function PublishersOverviewBody({ data, link }: { data: PublishersOverview; link: (href: string | null) => string | null }) {
    const { tiles, money, funnel, series, breakdowns, top } = data;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="Publishers" figure={tiles.total} hint="as at the window's close" href={meta.directory} />
                <CountTile label="New in window" figure={tiles.newInWindow} hint="signed up" />
                <CountTile label="With a live listing" figure={tiles.active} />
                <CountTile label="Suspended" figure={tiles.suspended} />
                <CountTile label="Closed" figure={tiles.closed} hint="login closed, as of now" href="/users/closures" />
                <CountTile label="First bookings" figure={series.firstBookings.total} hint="publishers whose first delivered day fell in the window" />
                <MoneyTile label="Earnings accrued" figure={money.earningsPaid} hint="accrual net" />
                <MoneyTile label="Payouts released" figure={money.payoutsReleased} hint="withdrawals paid" href="/finance/payouts" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <MixBar
                    title="KYC by state"
                    hint="Every publisher, by where their verification stands now — each state opens the queue with that chip on."
                    items={kycMixItems(tiles.kyc, meta.kycQueue)}
                />
                <FunnelCard
                    title="Supply funnel"
                    hint={`The platform's state now, not the window's — ${formatNumber(funnel.listingsLive)} listings live.`}
                    href="/publishers/activation"
                    steps={[
                        { key: "accounts", label: "Account created", value: funnel.accountsCreated },
                        { key: "kyc", label: "KYC verified", value: funnel.kycVerified },
                        { key: "platform", label: "Platform agreement", value: funnel.platformAgreementAccepted },
                        { key: "inventory", label: "Inventory listed", value: funnel.withInventory },
                        { key: "listing", label: "Listing agreement", value: funnel.listingAgreementAccepted },
                    ]}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <SeriesCard id="new-publishers" title="New publishers" hint="Sign-ups by day" series={series.newPublishers} />
                <SeriesCard id="first-listings" title="First listings published" hint="Publishers whose first listing went live that day" series={series.firstListingsPublished} />
                <SeriesCard id="first-bookings" title="First bookings" hint="Publishers whose first delivered booking day fell that day" series={series.firstBookings} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownTable
                    title="By city"
                    hint="Publishers, their live listings, and the accrual gross in the window — a city narrows this overview."
                    labelHeading="City"
                    page={breakdowns.byCity}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    hoverFor={typedSpellingsHover}
                    columns={[
                        { key: "count", label: "Publishers", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count },
                        { key: "listings", label: "Live listings", align: "right", render: (row) => formatNumber(row.listings), sortValue: (row) => row.listings },
                        { key: "gmv", label: "GMV", align: "right", render: (row) => formatMoney(row.gmv), sortValue: (row) => Number(row.gmv) },
                    ]}
                />
                <BreakdownTable
                    title="By category"
                    hint="Publishers with a listing in the category, and its live listings."
                    labelHeading="Category"
                    page={{ ...breakdowns.byCategory, items: breakdowns.byCategory.items.map((row) => ({ ...row, label: LISTING_CATEGORY_LABEL[row.key as ListingCategory] ?? row.label })) }}
                    initialSort="publishers"
                    linkFor={(row) => link(row.href)}
                    columns={[
                        { key: "publishers", label: "Publishers", align: "right", render: (row) => formatNumber(row.publishers), sortValue: (row) => row.publishers },
                        { key: "listings", label: "Live listings", align: "right", render: (row) => formatNumber(row.listings), sortValue: (row) => row.listings },
                    ]}
                />
                <BreakdownTable
                    title="By subscription tier"
                    hint="Subscriptions running now, per tier."
                    labelHeading="Tier"
                    page={breakdowns.bySubscriptionTier}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Running", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By agent"
                    hint="Publishers each agent brought in — the agent's page."
                    labelHeading="Agent"
                    page={breakdowns.byAgent}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Publishers", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
            </div>

            <TopList
                title="Top publishers by earnings"
                hint="Accrual net over the window's days, the ten largest."
                items={top.byEarnings.items.map((row) => ({ key: row.key, label: row.label, displayId: row.displayId, href: link(row.href), primary: formatMoney(row.amount) }))}
                emptyMessage="No publisher earned anything in this window."
            />
        </>
    );
}
