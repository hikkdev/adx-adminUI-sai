"use client";

import Link from "next/link";
import { Hourglass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CreativeReviewRow } from "@/services/moderation";

export type WaitingFilter = "ALL" | "STALE";

/** Three days without an answer is when somebody should ring the advertiser. */
export const STALE_AFTER_DAYS = 3;

/** Whole days since the design went to the advertiser. */
export function daysWaiting(row: Pick<CreativeReviewRow, "submittedAt" | "createdAt">, now: Date): number {
    const since = new Date(row.submittedAt ?? row.createdAt).getTime();
    return Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
}

/**
 * CR-1: ADX designs delivered and waiting on the advertiser.
 *
 * A design lands AWAITING_ADVERTISER when ops upload it and stays there until
 * the advertiser accepts or sends it back from their app. Nothing here is
 * ops' to decide; it is a chase list — who has been sitting on a design and
 * for how long — because a flight that starts with nothing accepted prints
 * nothing.
 */
export function AwaitingView({
    rows,
    readAt,
    filter,
    onFilterChange,
}: {
    rows: CreativeReviewRow[];
    readAt: Date;
    filter: WaitingFilter;
    onFilterChange: (filter: WaitingFilter) => void;
}) {
    const stale = rows.filter((row) => daysWaiting(row, readAt) >= STALE_AFTER_DAYS);
    const shown = filter === "STALE" ? stale : rows;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Awaiting advertiser"
                subtitle={
                    rows.length === 0
                        ? "No delivered design is waiting on an advertiser."
                        : `${rows.length} design${rows.length === 1 ? "" : "s"} with the advertiser${stale.length ? `, ${stale.length} for ${STALE_AFTER_DAYS} days or more` : ""}.`
                }
            />

            <FilterChips<WaitingFilter>
                value={filter}
                onChange={onFilterChange}
                chips={[
                    { value: "ALL", label: "All", count: rows.length },
                    { value: "STALE", label: `${STALE_AFTER_DAYS}+ days`, count: stale.length },
                ]}
            />

            {shown.length === 0 ? (
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={Hourglass}
                        title={filter === "ALL" ? "Nobody is waiting" : "Nothing this old"}
                        description="A design delivered from the Design requests tab appears here until the advertiser accepts it or asks for changes."
                    />
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {shown.map((row) => {
                        const days = daysWaiting(row, readAt);
                        const isStale = days >= STALE_AFTER_DAYS;
                        return (
                            <Card key={row.id} className="rounded-lg border-border p-5 shadow-none" data-testid={`waiting-${row.id}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Link href={`/creatives/${row.id}`} className="font-semibold text-foreground hover:underline">
                                            {row.campaign.name}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {row.campaign.reference} · {row.campaign.advertiser.companyName ?? row.campaign.advertiser.name}
                                        </p>
                                    </div>
                                    <span
                                        className={cn("shrink-0 text-xs font-medium tabular-nums", isStale ? "text-danger" : "text-muted-foreground")}
                                        data-testid="waiting-days"
                                    >
                                        {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}
                                    </span>
                                </div>
                                <p className="mt-3 text-sm text-muted-foreground">
                                    Delivered {formatDate(row.submittedAt ?? row.createdAt)}
                                    {row.spot ? ` for ${row.spot.listing.title}` : " for the whole campaign"}.
                                </p>
                                <div className="mt-3 flex items-center gap-3 text-xs">
                                    <Link href={`/campaigns/${row.campaignId}`} className="text-primary underline-offset-4 hover:underline">
                                        Campaign
                                    </Link>
                                    <Link href={`/advertisers/${row.campaign.advertiserId}`} className="text-primary underline-offset-4 hover:underline">
                                        Advertiser
                                    </Link>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
