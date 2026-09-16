"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DetailShell } from "@/components/adx/detail-shell";
import { EmptyState } from "@/components/adx/empty-state";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatCompactINR, formatDateTime, formatINR } from "@/lib/format";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { FeatureGate } from "@/lib/use-feature";
import { agreementService, type AgreementAcceptance } from "@/services/agreements";
import { orderService } from "@/services/orders";
import { refundsService } from "@/services/refunds";
import {
    campaignService,
    campaignStatusLabel,
    flightLabel,
    shapeCampaign,
    spendShare,
    type CampaignAnalytics,
    type CampaignDetail,
    type CampaignRefundSummary,
    type CampaignReview,
    type ContentCategory,
    type TrackingCode,
} from "@/services/campaigns";
import { ORDER_STATUS_META, type Order } from "@/types";
import { COMMISSION_SOURCE_LABEL, type CommissionSource } from "@/types/revenue";
import { AuthorizeDialog } from "../authorize-dialog";
import { CreativesCard, EngineCard, InsertionOrderCard, InteractionsCard, RefundRow, TrackingCard } from "./campaign-cards";

/** A fraction on the wire, a percentage on screen: "0.1500" → "15%". */
const formatCommissionPct = (fraction: string) =>
    `${(Number(fraction) * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** The source enum as a label, or the enum itself for one this map has not heard of. */
const commissionSourceLabel = (source: string) =>
    COMMISSION_SOURCE_LABEL[source as CommissionSource] ?? source;

interface Loaded {
    campaign: CampaignDetail | null;
    orders: Order[];
    /** The bill and the gates, or null when the read failed — the page says so. */
    review: CampaignReview | null;
    codes: TrackingCode[];
    analytics: CampaignAnalytics | null;
    categories: ContentCategory[];
    /** The insertion-order acceptance anchored on this campaign, from the register. */
    acceptance: AgreementAcceptance | null;
    /** The refund the cancel recorded: the detail's own field, or — when the detail has none — the refund desk's row for this campaign. */
    refund: CampaignRefundSummary | null;
}

/**
 * One campaign, live.
 *
 * Six reads beside the aggregate, each best-effort so a failed satellite
 * leaves its card saying so rather than failing the page: the review (the
 * bill, the missing answers, the insertion-order standing), the tracking
 * codes, the analytics (the interactions block), the content categories
 * (to name the one the campaign chose) and the acceptance register (who
 * clicked the insertion order, and when).
 *
 * Authorising goes through the on-behalf dialog — the reference typed back
 * and, above the threshold, a second admin (Lot C, Q88). "Send to advertiser
 * to pay" is `POST /campaigns/:id/submit-for-payment`.
 */
export function CampaignLoader({ id }: { id: string }) {
    const live = isLive("campaigns");
    const [cancelOpen, setCancelOpen] = React.useState(false);
    const [authorizeOpen, setAuthorizeOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    const resource = useApiResource<Loaded>(`campaign:${id}:${live}`, async () => {
        const campaign = await campaignService.get(id);
        if (!campaign) return { campaign, orders: [], review: null, codes: [], analytics: null, categories: [], acceptance: null, refund: null };
        const quiet = <T,>(promise: Promise<T>, fallback: T): Promise<T> => promise.catch(() => fallback);
        const [orders, review, codes, analytics, categories, acceptances, refund] = await Promise.all([
            orderService.list(),
            quiet<CampaignReview | null>(campaignService.review(id), null),
            quiet<TrackingCode[]>(campaignService.trackingCodes(id), []),
            quiet<CampaignAnalytics | null>(campaignService.analytics(id), null),
            quiet<ContentCategory[]>(campaignService.contentCategories(), []),
            // E7-3: the register filters by the campaign anchor; the one row is the acceptance.
            quiet(agreementService.acceptances({ kind: "INSERTION_ORDER", campaignId: campaign.id, limit: 1 }), {
                rows: [] as AgreementAcceptance[],
                nextCursor: null,
            }),
            // The detail carries `refund` since E6; a read from before it is asked of the refund desk by campaign.
            campaign.refund !== undefined
                ? Promise.resolve(campaign.refund ?? null)
                : quiet(
                      refundsService.campaignRefunds({ campaignId: campaign.id, pageSize: 1 }).then((page) => {
                          const row = page.items?.[0];
                          return row ? { id: row.id, amount: row.amount, status: row.status, reason: row.reason, releasedAt: row.releasedAt } : null;
                      }),
                      null,
                  ),
        ]);
        return {
            campaign,
            orders: orders.filter((order) => order.campaignName === campaign.name),
            review,
            codes,
            analytics,
            categories,
            acceptance: acceptances.rows[0] ?? null,
            refund,
        };
    });

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="Campaigns read the API"
                description="Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {({ campaign, orders, review, codes, analytics, categories, acceptance, refund }) => {
                if (!campaign) {
                    return (
                        <EmptyState
                            icon={PlugZap}
                            title="No such campaign"
                            description="It may have been discarded, or the link may be stale."
                        />
                    );
                }

                const row = shapeCampaign(campaign);
                const share = spendShare(row);
                const markets = campaign.targetMarkets?.length ? campaign.targetMarkets : campaign.targetMarket ? [campaign.targetMarket] : [];
                const category = categories.find((item) => item.id === campaign.contentCategoryId) ?? null;
                // The insertion order is the advertiser's own click, not a gap in the
                // brief; the send is refused only for what ops can still fill in. With
                // the review unread, the API gets to say.
                const briefComplete = review === null || (review.missing ?? []).every((item) => item.field === "AGREEMENT_REQUIRED");
                const canSend = (row.status === "DRAFT" || row.status === "PENDING_PAYMENT") && briefComplete;
                const canAuthorise = row.status === "DRAFT" || row.status === "PENDING_PAYMENT";

                const submitForPayment = async () => {
                    setBusy(true);
                    try {
                        await campaignService.submitForPayment(campaign.id);
                        toast.success(
                            row.status === "PENDING_PAYMENT" ? `${campaign.name} re-sent to the advertiser` : `${campaign.name} sent to the advertiser to pay`,
                            { description: "The spots are held for 24 hours and the advertiser has been told." },
                        );
                        resource.reload();
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not send it");
                    } finally {
                        setBusy(false);
                    }
                };

                return (
                    <>
                        <DetailShell
                            backHref="/campaigns"
                            backLabel="Campaigns"
                            title={campaign.name}
                            subtitle={[row.brandName, row.area].filter(Boolean).join(" · ")}
                            actions={
                                <>
                                    {canAuthorise ? (
                                        <Button
                                            variant="outline"
                                            className="bg-card"
                                            disabled={busy || !canSend}
                                            title={canSend ? undefined : "The brief has to be complete before it can be sent"}
                                            onClick={submitForPayment}
                                        >
                                            {row.status === "PENDING_PAYMENT" ? "Re-send to advertiser to pay" : "Send to advertiser to pay"}
                                        </Button>
                                    ) : null}
                                    {canAuthorise ? (
                                        <Button disabled={busy} onClick={() => setAuthorizeOpen(true)}>
                                            Authorise now
                                        </Button>
                                    ) : null}
                                    {row.status === "LIVE" || row.status === "SCHEDULED" ? (
                                        <Button
                                            variant="outline"
                                            className="bg-card text-danger hover:text-danger"
                                            onClick={() => setCancelOpen(true)}
                                        >
                                            Cancel campaign
                                        </Button>
                                    ) : null}
                                    <Button variant="outline" className="bg-card" asChild>
                                        <Link href={`/advertisers/${campaign.advertiserId}`}>View advertiser</Link>
                                    </Button>
                                </>
                            }
                            kpis={[
                                {
                                    id: "budget",
                                    label: "Budget",
                                    value: row.budget ? formatCompactINR(Number(row.budget)) : "—",
                                    hint: row.budget ? undefined : "Not set on this draft",
                                },
                                {
                                    id: "committed",
                                    label: "Committed",
                                    value: row.committed ? formatCompactINR(Number(row.committed)) : "—",
                                    // What the chosen spots come to. Nothing meters
                                    // delivery, so this is not "spent".
                                    hint: share !== null ? `${share}% of budget` : undefined,
                                },
                                { id: "spots", label: "Spots", value: String(row.spotCount) },
                                {
                                    id: "status",
                                    label: "Status",
                                    value: campaignStatusLabel(row.status),
                                    hint: flightLabel(row),
                                },
                            ]}
                            tabs={[
                                {
                                    value: "overview",
                                    label: "Overview",
                                    content: (
                                        <div className="grid gap-4 lg:grid-cols-2">
                                            {/* CG5: the multi-market card is a surface of
                                                `campaigns.multi-market`; off, a second market is
                                                refused 409 and the card has nothing to warn about. */}
                                            {campaign.multiMarketWarning && (
                                                <FeatureGate feature="campaigns.multi-market">
                                                    <Card className="flex items-start gap-3 rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none lg:col-span-2">
                                                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                                                        <div className="text-sm">
                                                            <p className="font-medium text-foreground">Several markets, one creative</p>
                                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                                This campaign targets {markets.length} markets. There is no per-market artwork; the same
                                                                creative runs everywhere, and the venue check runs against every booked spot.
                                                            </p>
                                                        </div>
                                                    </Card>
                                                </FeatureGate>
                                            )}
                                            {review?.clashes?.length ? (
                                                <Card className="flex items-start gap-3 rounded-lg border-danger/40 bg-danger-soft p-4 shadow-none lg:col-span-2">
                                                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                                                    <div className="text-sm">
                                                        <p className="font-medium text-foreground">
                                                            {review.clashes.length} spot{review.clashes.length === 1 ? "" : "s"} taken by another campaign
                                                        </p>
                                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                                            {review.clashes.map((clash) => clash.title).join(", ")} — authorisation will refuse until they are swapped.
                                                        </p>
                                                    </div>
                                                </Card>
                                            ) : null}
                                            <Card className="rounded-lg border-border p-5 shadow-none">
                                                <h3 className="text-base font-semibold text-foreground">The brief</h3>
                                                <FieldList
                                                    className="mt-4"
                                                    items={[
                                                        ["Reference", <span key="ref" className="font-mono text-xs">{row.reference}</span>],
                                                        ["Brand", row.brandName ?? "—"],
                                                        ["Goal", row.goal ?? "—"],
                                                        ["Area", row.area ?? "—"],
                                                        [
                                                            "Markets",
                                                            markets.length === 0 ? (
                                                                "—"
                                                            ) : (
                                                                <span key="markets" className="inline-flex flex-wrap justify-end gap-1">
                                                                    {markets.map((market) => (
                                                                        <StatusBadge key={market} status={{ label: market, tone: "neutral" }} />
                                                                    ))}
                                                                </span>
                                                            ),
                                                        ],
                                                        [
                                                            "Content category",
                                                            category ? (
                                                                <span key="cat" className="inline-flex items-center gap-1.5">
                                                                    {category.name}
                                                                    {category.isSensitive && <StatusBadge status={{ label: "Sensitive", tone: "warning" }} />}
                                                                </span>
                                                            ) : campaign.contentCategoryId ? (
                                                                campaign.contentCategoryId
                                                            ) : (
                                                                <span key="nocat" className="text-warning">Not chosen — the venue check cannot run</span>
                                                            ),
                                                        ],
                                                        ["Flight", flightLabel(row)],
                                                        ["Wizard step", `${campaign.step} of 17`],
                                                        [
                                                            "Sent to pay",
                                                            campaign.submittedForPaymentAt ? formatDateTime(campaign.submittedForPaymentAt) : "Not yet",
                                                        ],
                                                    ]}
                                                />
                                                {review && (review.missing ?? []).length > 0 && (
                                                    <div className="mt-4 rounded-md bg-muted/60 p-3 text-xs">
                                                        <p className="font-medium text-foreground">Still outstanding</p>
                                                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                                                            {review.missing!.map((item) => (
                                                                <li key={`${item.step}:${item.field}`}>{item.label}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </Card>
                                            <CreativesCard campaign={campaign} onChanged={resource.reload} />
                                            <InsertionOrderCard review={review} acceptance={acceptance} />
                                            <RefundRow refund={refund} />
                                        </div>
                                    ),
                                },
                                {
                                    value: "tracking",
                                    label: "Tracking",
                                    content: (
                                        <div className="grid gap-4 lg:grid-cols-2">
                                            <TrackingCard campaign={campaign} codes={codes} onChanged={resource.reload} />
                                            <InteractionsCard analytics={analytics} />
                                            {/* QR-1: the engine's log of the same scans, beside ADX's — only when GenQR hosts codes. */}
                                            <EngineCard analytics={analytics} />
                                        </div>
                                    ),
                                },
                                {
                                    value: "spots",
                                    label: "Spots",
                                    content: (
                                        <SimpleTable
                                            rows={campaign.spots ?? []}
                                            rowKey={(spot) => spot.id}
                                            emptyMessage="No spots chosen yet."
                                            columns={[
                                                {
                                                    key: "listing",
                                                    label: "Listing",
                                                    render: (spot) => (
                                                        <Link
                                                            href={`/listings/${spot.listingId}`}
                                                            className="font-medium text-foreground underline-offset-4 hover:underline"
                                                        >
                                                            {spot.listing?.title ?? spot.listingId}
                                                        </Link>
                                                    ),
                                                },
                                                {
                                                    key: "status",
                                                    label: "Status",
                                                    render: (spot) => spot.status,
                                                },
                                                {
                                                    key: "value",
                                                    label: "Line total",
                                                    render: (spot) =>
                                                        spot.lineTotal ? formatINR(Number(spot.lineTotal)) : "—",
                                                },
                                                {
                                                    key: "commission",
                                                    label: "ADX takes",
                                                    // Stamped at authorisation and never
                                                    // re-derived; a spot from before the
                                                    // stamp existed shows nothing rather
                                                    // than a rate the console guessed.
                                                    render: (spot) =>
                                                        spot.commissionPct ? (
                                                            <span className="whitespace-nowrap">
                                                                {formatCommissionPct(spot.commissionPct)}
                                                                {spot.commissionSource && (
                                                                    <span className="ml-1.5 text-xs text-muted-foreground">
                                                                        {commissionSourceLabel(spot.commissionSource)}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        ) : (
                                                            "—"
                                                        ),
                                                },
                                            ]}
                                        />
                                    ),
                                },
                                {
                                    value: "orders",
                                    label: "Fulfilment",
                                    content: (
                                        <SimpleTable<Order>
                                            rows={orders}
                                            rowKey={(order) => order.id}
                                            emptyMessage="No fulfilment orders raised for this campaign yet."
                                            columns={[
                                                {
                                                    key: "listing",
                                                    label: "Spot",
                                                    render: (order) => order.listing,
                                                },
                                                {
                                                    key: "status",
                                                    label: "Status",
                                                    render: (order) => (
                                                        <StatusBadge status={ORDER_STATUS_META[order.status]} />
                                                    ),
                                                },
                                            ]}
                                        />
                                    ),
                                },
                            ]}
                        />
                        <AuthorizeDialog
                            campaign={
                                authorizeOpen
                                    ? { id: campaign.id, name: campaign.name, reference: campaign.reference, total: review?.total ?? row.committed }
                                    : null
                            }
                            onOpenChange={(open) => !open && setAuthorizeOpen(false)}
                            onDone={() => {
                                setAuthorizeOpen(false);
                                resource.reload();
                            }}
                        />
                        <ConfirmDialog
                            open={cancelOpen}
                            onOpenChange={setCancelOpen}
                            title="Cancel this campaign?"
                            description="The booked spots are released and the advertiser is told. Money already committed is refunded through the wallet, which finance releases separately."
                            confirmLabel="Cancel campaign"
                            destructive
                            onConfirm={async () => {
                                setCancelOpen(false);
                                try {
                                    await campaignService.cancel(
                                        campaign.id,
                                        "Cancelled by ADX from the console",
                                    );
                                    toast.success(`${campaign.name} cancelled`);
                                    resource.reload();
                                } catch (error) {
                                    toast.error(
                                        error instanceof Error
                                            ? error.message
                                            : "Could not cancel it",
                                    );
                                }
                            }}
                        >
                            <p className="text-xs text-muted-foreground">
                                The unused days are recorded as a pending campaign refund. Finance releases or
                                refuses it at the{" "}
                                <Link href="/finance/refunds" className="underline underline-offset-4">
                                    refund desk
                                </Link>
                                .
                            </p>
                        </ConfirmDialog>
                    </>
                );
            }}
        </ResourceBoundary>
    );
}
