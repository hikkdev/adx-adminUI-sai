"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownTable, CountTile, MixBar, MoneyTile, SectionOverviewLoader, SeriesCard, StatTile, TopList } from "@/components/adx/overview";
import { formatMoney, formatNumber } from "@/lib/format";
import { LISTING_LIFECYCLE, LISTING_STATUS_TONE, listingCategoryLabel, listingStatusLabel, type ListingLifecycle } from "@/services/listings";
import { SECTION_META, consoleHref, typedSpellingsHover, type ListingsOverview } from "@/services/section-overviews";
import { ListingsNav } from "./listings-nav";

const meta = SECTION_META.listings;

/**
 * The Listings section's Overview tab — 2 Oct 2026, the owner: "I want
 * topbar in this order: Overview, Listings, Review, …". Built the way the
 * Publishers overview is, over `GET /section-overviews/listings`: every card
 * is a field of that one read.
 */
export function ListingsOverviewView() {
    return (
        <SectionOverviewLoader
            section="listings"
            title="Listings"
            subtitle="Every spot on ADX, whatever state it is in — the window's movement against the same number of days before it."
            actions={
                <Button className="h-9" asChild>
                    <Link href="/listings/new">
                        <Plus className="size-4" />
                        Add listing
                    </Link>
                </Button>
            }
            nav={<ListingsNav />}
        >
            {(data, window) => <ListingsOverviewBody data={data} link={(href: string | null) => consoleHref("listings", href, window)} />}
        </SectionOverviewLoader>
    );
}

/** What sits under a queue's count: how much has already run out, and how far ahead it looks. */
function queueHint(lapsed: number, horizonDays: number): string {
    return lapsed > 0 ? `${formatNumber(lapsed)} already lapsed · next ${horizonDays} days` : `due in the next ${horizonDays} days`;
}

const isLifecycle = (key: string): key is ListingLifecycle => (LISTING_LIFECYCLE as readonly string[]).includes(key);

export function ListingsOverviewBody({ data, link }: { data: ListingsOverview; link: (href: string | null) => string | null }) {
    const { tiles, money, series, work, breakdowns } = data;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="Listings" figure={tiles.total} hint="as at the window's close" href={meta.directory} />
                <CountTile label="Live" figure={tiles.live} hint="on the marketplace now" href={`${meta.directory}?status=ACTIVE`} />
                <CountTile label="Awaiting review" figure={tiles.awaitingReview} hint="on the review desk now" href="/listings/review" />
                <CountTile label="Suspended" figure={tiles.suspended} hint="any section in force, as of now" href={`${meta.directory}?status=SUSPENDED`} />
                <CountTile label="New in window" figure={tiles.newInWindow} hint="created" />
                <CountTile label="Went live" figure={tiles.published} hint="published" />
                <CountTile label="Bookings" figure={tiles.bookings} hint="spots on campaigns paid" href="/orders" />
                <MoneyTile label="GMV" figure={money.gmv} hint="accrual gross" />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <StatTile
                    label="Renewals due"
                    value={formatNumber(work.renewals.due)}
                    delta={null}
                    previous={null}
                    hint={queueHint(work.renewals.lapsed, work.renewals.horizonDays)}
                    href="/listings/renewals"
                />
                <StatTile label="Open claims" value={formatNumber(work.claimsOpen)} delta={null} previous={null} hint="waiting on a decision" href="/listings/claims" />
                <StatTile
                    label="Spot re-checks"
                    value={formatNumber(work.verification.due)}
                    delta={null}
                    previous={null}
                    hint={queueHint(work.verification.lapsed, work.verification.horizonDays)}
                    href="/listings/verification"
                />
            </div>

            <MixBar
                title="By status"
                hint="Every listing, by where it stands now — each status opens the list with that status chosen."
                items={breakdowns.byStatus.items.map((row) => ({
                    key: row.key,
                    label: isLifecycle(row.key) ? listingStatusLabel(row.key) : row.label,
                    count: row.count,
                    href: link(row.href),
                    tone: isLifecycle(row.key) ? LISTING_STATUS_TONE[row.key] : "neutral",
                }))}
            />

            <div className="grid gap-4 xl:grid-cols-2">
                <SeriesCard id="new-listings" title="New listings" hint="Listings created by day" series={series.newListings} />
                <SeriesCard id="listings-published" title="Went live" hint="Listings published onto the marketplace by day" series={series.published} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownTable
                    title="By city"
                    hint="Listings, the live ones, and the accrual gross on them in the window — a city narrows this overview."
                    labelHeading="City"
                    page={breakdowns.byCity}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    hoverFor={typedSpellingsHover}
                    columns={[
                        { key: "count", label: "Listings", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count },
                        { key: "live", label: "Live", align: "right", render: (row) => formatNumber(row.live), sortValue: (row) => row.live },
                        { key: "gmv", label: "GMV", align: "right", render: (row) => formatMoney(row.gmv), sortValue: (row) => Number(row.gmv) },
                    ]}
                />
                <BreakdownTable
                    title="By category"
                    hint="Listings in each category, the live ones, and their accrual gross in the window — a category opens the list."
                    labelHeading="Category"
                    page={{ ...breakdowns.byCategory, items: breakdowns.byCategory.items.map((row) => ({ ...row, label: listingCategoryLabel(row.key) })) }}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[
                        { key: "count", label: "Listings", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count },
                        { key: "live", label: "Live", align: "right", render: (row) => formatNumber(row.live), sortValue: (row) => row.live },
                        { key: "gmv", label: "GMV", align: "right", render: (row) => formatMoney(row.gmv), sortValue: (row) => Number(row.gmv) },
                    ]}
                />
            </div>

            <TopList
                title="Top publishers by listings"
                hint="The ten publishers holding the most listings, and how many of them are live."
                items={breakdowns.byPublisher.items.map((row) => ({
                    key: row.key,
                    label: row.label,
                    displayId: row.displayId,
                    href: link(row.href),
                    primary: formatNumber(row.count),
                    secondary: `${formatNumber(row.live)} live`,
                }))}
                emptyMessage="No publisher holds a listing yet."
            />
        </>
    );
}
