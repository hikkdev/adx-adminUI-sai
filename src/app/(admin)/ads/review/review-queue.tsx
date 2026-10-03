"use client";

import * as React from "react";
import { CheckCircle2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { buyerLabel, promotionsReadApi, promotionsService, runLabel, type AdBookingRow, type AdSlot, type PromotionPage } from "@/services/promotions";
import { AdsFrame } from "../ads-frame";
import { ArtworkPreview, ReasonDialog, TargetLink, citiesLabel, slotSize } from "../ad-parts";

interface Loaded {
    page: PromotionPage<AdBookingRow>;
    slots: AdSlot[];
}

/**
 * The review queue: paid ads whose artwork ADX has not looked at yet,
 * oldest first. Each card draws the artwork in its slot's shape with the
 * buyer, the dates, the cities and the link it opens. Approve schedules it;
 * Reject (with a reason the buyer reads) refunds the buyer in full.
 */
export function ReviewQueue() {
    const live = promotionsReadApi();
    const { can } = useAuth();
    const mayDecide = can("content.approve");
    const resource = useApiResource<Loaded | null>(`promotions:review:${live}`, async () => {
        if (!live) return null;
        const [page, slots] = await Promise.all([promotionsService.ads({ status: "PENDING_REVIEW", pageSize: 50 }), promotionsService.slots().catch(() => [] as AdSlot[])]);
        return { page, slots };
    });
    const [rejecting, setRejecting] = React.useState<AdBookingRow | null>(null);
    const [busy, setBusy] = React.useState<string | null>(null);

    async function approve(row: AdBookingRow) {
        setBusy(row.id);
        try {
            await promotionsService.approveAd(row.id);
            toast.success(`${row.displayId ?? row.title} approved`, { description: "It runs from its first day, rotating with the slot’s other ads." });
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(null);
        }
    }

    async function reject(row: AdBookingRow, reason: string) {
        setBusy(row.id);
        try {
            await promotionsService.rejectAd(row.id, reason);
            toast.success(`${row.displayId ?? row.title} rejected`, { description: `${formatMoney(row.total)} goes back to the buyer’s wallet.` });
            setRejecting(null);
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <AdsFrame subtitle="Display ads bought in ADX’s ad slots and listings their owners pay to show first. Every one is labelled “Ad” or “Sponsored” where it shows.">
            <ResourceBoundary resource={resource}>
                {(data) => {
                    if (!data) return null;
                    const rows = [...data.page.items].sort((a, b) => Date.parse(a.paidAt ?? a.createdAt) - Date.parse(b.paidAt ?? b.createdAt));
                    const slots = new Map(data.slots.map((slot) => [slot.key, slot]));
                    if (rows.length === 0) {
                        return (
                            <Card className="rounded-lg border-border shadow-none">
                                <EmptyState icon={Inbox} title="Nothing to review" description="Paid ads land here for their artwork to be checked before they run. The queue is clear." />
                            </Card>
                        );
                    }
                    return (
                        <div className="space-y-3" data-testid="ads-review-queue">
                            <p className="text-sm text-muted-foreground">
                                {data.page.total} {data.page.total === 1 ? "ad waits" : "ads wait"} for review, oldest payment first.
                                {!mayDecide && " Approving and rejecting needs content.approve."}
                            </p>
                            {rows.map((row) => {
                                const slot = row.slot?.key ? slots.get(row.slot.key) : undefined;
                                return (
                                    <Card key={row.id} className="rounded-lg border-border p-4 shadow-none" data-testid={`review-${row.id}`}>
                                        <div className="flex flex-col gap-4 md:flex-row">
                                            <ArtworkPreview media={row.media} size={slotSize(slot, row.media)} headline={row.headline} ctaLabel={row.ctaLabel} />
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div>
                                                    <p className="font-mono text-xs text-muted-foreground">{row.displayId ?? row.id}</p>
                                                    <h3 className="text-base font-semibold text-foreground">{row.title}</h3>
                                                </div>
                                                <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[110px_1fr]">
                                                    <dt className="text-muted-foreground">Buyer</dt>
                                                    <dd className="text-foreground">{buyerLabel(row)}</dd>
                                                    <dt className="text-muted-foreground">Slot</dt>
                                                    <dd className="text-foreground">
                                                        {slot?.label ?? row.slot?.label ?? "—"}
                                                        {slot?.specDetail ? <span className="text-muted-foreground"> · {slot.specDetail.width}×{slot.specDetail.height}</span> : null}
                                                    </dd>
                                                    <dt className="text-muted-foreground">Runs</dt>
                                                    <dd className="text-foreground">{runLabel(row)}</dd>
                                                    <dt className="text-muted-foreground">Cities</dt>
                                                    <dd className="text-foreground">{citiesLabel(row)}</dd>
                                                    <dt className="text-muted-foreground">Opens</dt>
                                                    <dd className="min-w-0">
                                                        <TargetLink url={row.targetUrl} />
                                                    </dd>
                                                    <dt className="text-muted-foreground">Paid</dt>
                                                    <dd className="text-foreground">
                                                        {formatMoney(row.total)} <span className="text-xs text-muted-foreground">incl. GST{row.paidAt ? ` · ${formatDateTime(row.paidAt)}` : ""}</span>
                                                    </dd>
                                                </dl>
                                                {mayDecide && (
                                                    <div className="flex gap-2 pt-1">
                                                        <Button size="sm" onClick={() => void approve(row)} disabled={busy !== null || !row.media} title={!row.media ? "No artwork to approve" : undefined} data-testid={`approve-${row.id}`}>
                                                            <CheckCircle2 className="mr-1 size-4" />
                                                            Approve
                                                        </Button>
                                                        <Button size="sm" variant="outline" className="bg-card text-danger hover:text-danger" onClick={() => setRejecting(row)} disabled={busy !== null} data-testid={`reject-${row.id}`}>
                                                            Reject and refund
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    );
                }}
            </ResourceBoundary>
            <ReasonDialog
                open={rejecting !== null}
                title={`Reject ${rejecting?.displayId ?? "this ad"}?`}
                description={rejecting ? `${formatMoney(rejecting.total)} goes back to the buyer’s wallet in full. They can fix the artwork and book again.` : ""}
                confirmLabel="Reject and refund"
                busy={busy !== null}
                onOpenChange={(open) => !open && setRejecting(null)}
                onConfirm={(reason) => rejecting && void reject(rejecting, reason)}
            />
        </AdsFrame>
    );
}
