"use client";

import * as React from "react";
import { AlertTriangle, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExploreChart } from "@/components/charts/lazy";
import type { ExplorePoint, ExploreSeries } from "@/components/charts/explore-chart";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatNumber } from "@/lib/format";
import { designQuoteOf, waitingOnLabel, type CampaignDetail, type CampaignPerformance, type WaitingFacts } from "@/services/campaigns";
import { LANDING_PAGE_STATUS_META, landingTitle, previewUrl, type LandingPageDetail } from "@/services/landing-pages";
import { LandingPreview } from "../landing-pages/landing-preview";
import { UnpublishDialog } from "../landing-pages/landing-pages-view";
import { WaitingOnFix } from "../waiting-on-fix";

/* ------------------------------------------------------------------ */
/* Performance                                                         */
/* ------------------------------------------------------------------ */

const PERFORMANCE_SERIES: ExploreSeries[] = [
    { key: "scans", label: "QR scans", money: false, ratio: false },
    { key: "views", label: "Landing views", money: false, ratio: false },
    { key: "ctaClicks", label: "CTA clicks", money: false, ratio: false },
    { key: "enquiries", label: "Enquiries", money: false, ratio: false },
];

/** "12 Oct" — the chart's x label. */
const dayLabel = (day: string): string => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${day.slice(0, 10)}T00:00:00`));

/** The daily series as the chart takes it. */
export function performancePoints(performance: CampaignPerformance): ExplorePoint[] {
    return (performance.series ?? []).map((day) => ({
        bucket: day.day,
        label: dayLabel(day.day),
        scans: day.scans,
        views: day.views,
        ctaClicks: day.ctaClicks,
        enquiries: day.enquiries,
    }));
}

/**
 * Performance — 2 Oct 2026. Over `GET /campaigns/:id/performance`: the
 * lifetime counts (QR scans, landing views, CTA clicks, enquiries) and one
 * line each by day over the flight, on the console's Explore chart.
 */
export function PerformanceCard({ performance }: { performance: CampaignPerformance | null }) {
    const lifetime = performance?.lifetime;
    const stats: [string, number | undefined][] = [
        ["QR scans", lifetime?.scans],
        ["Landing views", lifetime?.views],
        ["CTA clicks", lifetime?.ctaClicks],
        ["Enquiries", lifetime?.enquiries],
    ];
    const points = performance ? performancePoints(performance) : [];
    return (
        <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-2" data-testid="performance-card">
            <h3 className="text-base font-semibold text-foreground">Performance</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Everything the campaign&apos;s codes and landing page counted, since it started, and by day over the flight.</p>
            {performance === null ? (
                <p className="mt-4 text-sm text-muted-foreground">The performance read did not answer; try again later.</p>
            ) : (
                <>
                    <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {stats.map(([label, value]) => (
                            <div key={label}>
                                <dt className="text-xs text-muted-foreground">{label}</dt>
                                <dd className="text-metric mt-1 text-foreground">{value === undefined ? "—" : formatNumber(value)}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="mt-4">
                        {points.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nothing counted by day yet — the chart fills in once the flight starts.</p>
                        ) : (
                            <ExploreChart data={points} series={PERFORMANCE_SERIES} height={240} />
                        )}
                    </div>
                </>
            )}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Landing page                                                        */
/* ------------------------------------------------------------------ */

/**
 * The campaign's landing page — 2 Oct 2026. Its status, the public address
 * (a new tab), whether AI drafted it, when it went live, its own numbers,
 * a small preview (the live page, or the blocks of a draft), and
 * Unpublish… with a reason while it is live.
 */
export function LandingPageCard({
    campaign,
    landing,
    numbers,
    onChanged,
}: {
    campaign: Pick<CampaignDetail, "id" | "landingPage">;
    /** The page with its blocks; null when the campaign has none or the read failed. */
    landing: LandingPageDetail | null;
    /** The page's own numbers — the performance read's lifetime counts. */
    numbers: { views: number; ctaClicks: number; enquiries: number } | null;
    onChanged: () => void;
}) {
    const [unpublishing, setUnpublishing] = React.useState(false);
    const summary = campaign.landingPage ?? null;
    const slug = landing?.slug ?? summary?.slug ?? null;
    const status = landing?.status ?? summary?.status ?? null;
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="landing-card">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">Landing page</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Where the campaign&apos;s QR code sends people when the advertiser gives no address of their own.</p>
                </div>
                {status && slug ? (
                    <div className="flex shrink-0 items-center gap-2">
                        {status === "PUBLISHED" && (
                            <Button variant="outline" size="sm" className="h-8 bg-card text-danger hover:text-danger" onClick={() => setUnpublishing(true)}>
                                Unpublish…
                            </Button>
                        )}
                    </div>
                ) : null}
            </div>
            {!slug || !status ? (
                <p className="mt-4 text-sm text-muted-foreground">No landing page. The advertiser drafts one with AI from the brief in their app, then publishes it.</p>
            ) : (
                <>
                    <FieldList
                        className="mt-4"
                        items={[
                            ["Status", <StatusBadge key="status" status={LANDING_PAGE_STATUS_META[status]} />],
                            [
                                "Address",
                                status === "PUBLISHED" ? (
                                    <a key="address" href={previewUrl(slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary underline-offset-4 hover:underline">
                                        /p/{slug}
                                        <ExternalLink className="size-3" aria-hidden />
                                    </a>
                                ) : (
                                    <span key="address" className="font-mono text-xs text-muted-foreground">
                                        /p/{slug} — not live
                                    </span>
                                ),
                            ],
                            [
                                "Drafted by",
                                landing?.generatedByAi ? (
                                    <span key="ai" className="inline-flex items-center gap-1">
                                        <Sparkles className="size-3.5" aria-hidden />
                                        AI, from the brief
                                    </span>
                                ) : landing ? (
                                    "The advertiser"
                                ) : (
                                    "—"
                                ),
                            ],
                            ["Published", (landing?.publishedAt ?? summary?.publishedAt) ? formatDateTime((landing?.publishedAt ?? summary?.publishedAt) as string) : "Not live"],
                            ["Views · CTA clicks · Enquiries", numbers ? [numbers.views, numbers.ctaClicks, numbers.enquiries].map(formatNumber).join(" · ") : "—"],
                        ]}
                    />
                    <div className="mt-4">
                        <LandingPreview
                            slug={slug}
                            status={status}
                            blocks={landing?.blocks ?? null}
                            theme={landing?.theme ?? null}
                            title={landing ? landingTitle(landing) : `/p/${slug}`}
                            height={320}
                        />
                    </div>
                </>
            )}
            <UnpublishDialog
                row={unpublishing ? { campaignId: campaign.id } : null}
                onOpenChange={(open) => !open && setUnpublishing(false)}
                onDone={onChanged}
            />
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Waiting on                                                          */
/* ------------------------------------------------------------------ */

/** What the campaign waits on: the server's `waitingOn`, else QR-16's `launchBlockedBy` on a paid campaign. */
export function campaignWaitingOn(campaign: Pick<CampaignDetail, "waitingOn" | "launchBlockedBy" | "status">): string[] {
    if (campaign.waitingOn) return campaign.waitingOn;
    const paid = campaign.status === "SCHEDULED" || campaign.status === "LIVE" || campaign.status === "PAUSED";
    return paid ? (campaign.launchBlockedBy ?? []) : [];
}

/**
 * The facts a fix needs: the server's `waitingFacts` on ADX's read, else
 * worked out from the detail itself — the advertiser profile, the artwork
 * awaiting approval, the standing design quote.
 */
export function factsOf(campaign: CampaignDetail): WaitingFacts {
    if (campaign.waitingFacts) return campaign.waitingFacts;
    const awaiting = (campaign.creatives ?? []).filter((creative) => creative.status === "UPLOADED" || creative.status === "IN_REVIEW");
    const quote = designQuoteOf(campaign);
    return {
        KYC: { advertiserId: campaign.placedBy?.business?.id ?? campaign.advertiserId, kycStatus: "UNKNOWN" },
        ARTWORK: { creatives: awaiting.map((creative) => ({ id: creative.id, status: creative.status })) },
        DESIGN_QUOTE: { state: quote?.status === "QUOTED" ? "QUOTED" : "NOT_QUOTED", amount: quote?.amount ?? null, quotedAt: quote?.quotedAt ?? null },
    };
}

/**
 * The Waiting on banner — 2 Oct 2026. Drawn only while something holds the
 * campaign back, each reason with the same one-click fix as the launch
 * queue's row.
 */
export function WaitingOnBanner({ campaign, onChanged }: { campaign: CampaignDetail; onChanged: () => void }) {
    const reasons = campaignWaitingOn(campaign);
    if (reasons.length === 0) return null;
    const target = {
        campaign: { id: campaign.id, name: campaign.name, reference: campaign.reference, status: campaign.status },
        advertiser: campaign.placedBy ?? null,
        facts: factsOf(campaign),
    };
    return (
        <Card className="flex flex-col gap-3 rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none sm:flex-row sm:items-center sm:justify-between" data-testid="waiting-on-banner">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <div className="text-sm">
                    <p className="font-medium text-foreground">Waiting on {reasons.map(waitingOnLabel).join(" · ")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">It cannot go live until {reasons.length === 1 ? "this is" : "these are"} settled.</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {reasons.map((reason) => (
                    <WaitingOnFix key={reason} reason={reason} target={target} onDone={onChanged} />
                ))}
            </div>
        </Card>
    );
}
