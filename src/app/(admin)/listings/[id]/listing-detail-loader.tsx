"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ReviewsCard } from "@/components/adx/reviews-card";
import { ActivityTimeline } from "@/components/adx/activity-timeline";
import { DetailShell } from "@/components/adx/detail-shell";
import { EmptyState } from "@/components/adx/empty-state";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { PlugZap } from "lucide-react";
import { formatCompactINR, formatDate } from "@/lib/format";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useFeature } from "@/lib/use-feature";
import {
    LISTING_STATUS_TONE,
    MAX_SLOTS,
    listingStatusLabel,
    listingsService,
    type AdminListingDetail,
} from "@/services/listings";
import { orderService } from "@/services/orders";
import { countRunningOrders, suspensionService, type SuspensionView } from "@/services/suspension";
import { SuspensionActions } from "@/components/adx/suspend-dialog";
import { SuspensionCard } from "@/components/adx/suspension-card";
import { ORDER_STATUS_META, type Order } from "@/types";
import { ListingAudienceCard } from "./audience-card";
import { ListingPricingTab } from "./pricing-tab";

/**
 * One listing, live.
 *
 * Two reads, because they are two different questions: the spot itself from
 * `GET /listings/:id`, and what is booked on it from `GET /orders?listingId=`.
 * Both are new — the platform had no single-listing read at all, and no way to
 * ask which orders ran on one spot.
 *
 * Lot G (Q116/136, package CG1): the Site specs card gains a Slots field —
 * a digital screen's loop, 1..24, written through `PATCH /listings/:id`.
 * G11-1: it is editable only when the admin read's own `carriesLoop` says
 * the spot is a screen — the server's rule, answered by the server, no
 * word-list of the console's own; on any other spot it prints "1 · static"
 * and says why, because the server refuses a loop on a wall.
 *
 * Y-C: the Audience card — `GET /listings/:id/audience`, the vendors'
 * blended panel for the spot's catchment with who gave what — sits under
 * the specs on the Overview tab, beside the publisher's own stated footfall.
 */
export function ListingDetailLoader({ id }: { id: string }) {
    const live = isLive("listings");

    const resource = useApiResource<{ listing: AdminListingDetail | null; orders: Order[]; suspension: SuspensionView | null }>(
        `listing:${id}:${live}`,
        async () => {
            const listing = await listingsService.get(id);
            if (!listing) return { listing, orders: [], suspension: null };
            // Two more questions about a spot that exists: what is booked on
            // it, and which sections of it are stopped. The case is read
            // beside the row rather than derived from it because the card
            // draws the history too, and a failed read leaves the card saying
            // so rather than the page failing.
            const [orders, suspension] = await Promise.all([
                orderService.forListing(id),
                isLive("suspension") ? suspensionService.history("LISTING", id).catch(() => null) : Promise.resolve(null),
            ]);
            return { listing, orders, suspension };
        },
    );

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="This listing reads the API"
                description="Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {({ listing, orders, suspension }) =>
                listing ? (
                    <Detail listing={listing} orders={orders} suspension={suspension} onChanged={resource.reload} />
                ) : (
                    <EmptyState
                        icon={PlugZap}
                        title="No such listing"
                        description="It may have been removed, or the link may be stale."
                    />
                )
            }
        </ResourceBoundary>
    );
}

function Detail({
    listing,
    orders,
    suspension,
    onChanged,
}: {
    listing: AdminListingDetail;
    orders: Order[];
    suspension: SuspensionView | null;
    /** Re-read after a suspension changes the spot's status or its case. */
    onChanged: () => void;
}) {
    const subtitle = [listing.publisherName ?? "Unclaimed", listing.address]
        .filter(Boolean)
        .join(" · ");
    const [switching, setSwitching] = React.useState(false);
    /* CG5: the switch is a surface of `marketplace.instant-booking`. Off for
       the operator, the row is not drawn at all — the same rule the apps
       follow — rather than drawn and refused by the API on the first tap. */
    const instantBookingFeature = useFeature("marketplace.instant-booking").enabled === true;

    /* Lot D (Q105): the publisher's opt-in, switched from the console. On is
       refused by the API without the flag or a meeting place; the toast says so. */
    const setInstant = async (next: boolean) => {
        setSwitching(true);
        try {
            await listingsService.setInstantBooking(listing.id, next);
            toast.success(next ? "Instant booking on" : "Instant booking off", {
                description: next
                    ? "A booking here is accepted without the publisher's tap."
                    : "Bookings wait for the publisher's tap again.",
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not change instant booking");
        } finally {
            setSwitching(false);
        }
    };
    /* Lot G (Q116/136): the slot count, saved on blur or Enter. The server is
       the authority on whether the spot carries a loop; a refusal is shown as
       it was sent. */
    const [slotsDraft, setSlotsDraft] = React.useState(String(listing.slotsTotal ?? 1));
    const [savingSlots, setSavingSlots] = React.useState(false);
    const digital = listing.carriesLoop;
    const saveSlots = async () => {
        const next = Number(slotsDraft);
        if (!Number.isInteger(next) || next < 1 || next > MAX_SLOTS) {
            toast.error(`Slots is a whole number from 1 to ${MAX_SLOTS}`);
            setSlotsDraft(String(listing.slotsTotal ?? 1));
            return;
        }
        if (next === (listing.slotsTotal ?? 1)) return;
        setSavingSlots(true);
        try {
            await listingsService.setSlotsTotal(listing.id, next);
            toast.success(next === 1 ? "One slot" : `${next} slots`, {
                description: next === 1 ? "The spot carries one advertiser at a time." : `The loop carries ${next} advertisers at once, each at the rate per day.`,
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not change the slot count");
            setSlotsDraft(String(listing.slotsTotal ?? 1));
        } finally {
            setSavingSlots(false);
        }
    };

    /* The case read is the fresher of the two; the row's own columns stand in
       while it could not be read, so the buttons still know what is in force. */
    const scopes = suspension?.scopes ?? listing.suspensionScopes ?? [];
    const suspensionActions = (
        <SuspensionActions
            partyType="LISTING"
            partyId={listing.id}
            partyName={listing.title}
            current={scopes}
            runningOrders={countRunningOrders(orders)}
            onDone={onChanged}
        />
    );

    return (
        <DetailShell
            backHref="/listings"
            backLabel="Listings"
            title={listing.title}
            subtitle={subtitle}
            actions={
                <>
                    {/* Suspend, and Reinstate once anything is in force. There
                        is no retire route on the API, so there is no Retire
                        button: INACTIVE is a state the platform reaches on its
                        own, not one ops can set from here. */}
                    {suspensionActions}
                    {/* The decision lives on the review desk, which has the
                        documents and the rate-card floor in front of it. This
                        page links there rather than offering a second, thinner
                        Approve button. */}
                    {listing.status === "PENDING_REVIEW" ? (
                        <Button asChild>
                            <Link href={`/listings/review/${listing.id}`}>Open review case</Link>
                        </Button>
                    ) : null}
                    {listing.publisherId ? (
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href={`/publishers/${listing.publisherId}`}>View publisher</Link>
                        </Button>
                    ) : null}
                </>
            }
            kpis={[
                {
                    id: "rate",
                    label: "Rate / day",
                    value: listing.ratePerDay ? formatCompactINR(Number(listing.ratePerDay)) : "—",
                    hint: listing.ratePerDay ? undefined : "Nobody has priced this spot",
                },
                { id: "type", label: "Category", value: listing.subType ?? listing.category },
                {
                    id: "status",
                    label: "Status",
                    value: listingStatusLabel(listing.status),
                    hint: scopes.length
                        ? `Suspended: ${scopes.length} section${scopes.length === 1 ? "" : "s"} stopped`
                        : listing.submittedAt
                          ? `Submitted ${listing.submittedAt.slice(0, 10)}`
                          : "Never submitted",
                },
                { id: "bookings", label: "Orders on this spot", value: String(orders.length) },
            ]}
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    content: (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Site specs</h3>
                                <FieldList
                                    className="mt-4"
                                    items={[
                                        ["Identifier", listing.displayId ?? "Not issued"],
                                        ["Dimensions", listing.size ?? "Not measured"],
                                        ["Illumination", listing.illumination ?? "—"],
                                        ["Facing", listing.facing ?? "—"],
                                        ["Placement", listing.placement ?? "—"],
                                        ["City", listing.city ?? "—"],
                                        ["Address", listing.address],
                                        [
                                            "Daily footfall",
                                            listing.estimatedDailyFootfall
                                                ? listing.estimatedDailyFootfall.toLocaleString("en-IN")
                                                : "Not stated",
                                        ],
                                        ["Onboarded by", listing.agentDisplayId ?? "Self-serve"],
                                        ...(listing.slotsTotal !== null
                                            ? ([
                                                  [
                                                      "Slots",
                                                      digital ? (
                                                          <span key="slots" className="inline-flex items-center gap-2">
                                                              <Input
                                                                  type="number"
                                                                  min={1}
                                                                  max={MAX_SLOTS}
                                                                  step={1}
                                                                  value={slotsDraft}
                                                                  disabled={savingSlots}
                                                                  onChange={(event) => setSlotsDraft(event.target.value)}
                                                                  onBlur={() => void saveSlots()}
                                                                  onKeyDown={(event) => {
                                                                      if (event.key === "Enter") event.currentTarget.blur();
                                                                  }}
                                                                  aria-label="Slots"
                                                                  className="h-7 w-20 bg-card text-right"
                                                              />
                                                              <span className="text-xs text-muted-foreground">
                                                                  {savingSlots ? "Saving…" : `advertisers at once, 1 to ${MAX_SLOTS}`}
                                                              </span>
                                                          </span>
                                                      ) : (
                                                          <span key="slots" className="inline-flex items-center gap-2">
                                                              <span>{listing.slotsTotal} · static</span>
                                                              <span className="text-xs text-muted-foreground">
                                                                  a loop needs a screen{listing.mediaType ? ` — filed as ${listing.mediaType.name}` : ""}
                                                              </span>
                                                          </span>
                                                      ),
                                                  ],
                                              ] as [string, React.ReactNode][])
                                            : []),
                                        ...(instantBookingFeature && listing.instantBooking !== null
                                            ? ([
                                                  [
                                                      "Instant booking",
                                                      <span key="instant" className="inline-flex items-center gap-2">
                                                          <span className="text-xs text-muted-foreground">
                                                              {listing.instantBooking ? "On" : "Off"}
                                                          </span>
                                                          <Switch
                                                              checked={listing.instantBooking}
                                                              disabled={switching}
                                                              onCheckedChange={setInstant}
                                                              aria-label="Instant booking"
                                                          />
                                                      </span>,
                                                  ],
                                              ] as [string, React.ReactNode][])
                                            : []),
                                    ]}
                                />
                                {listing.rejectionReason ? (
                                    <p className="mt-4 rounded-md bg-danger/10 p-3 text-xs text-danger">
                                        Sent back: {listing.rejectionReason}
                                    </p>
                                ) : null}
                            </Card>
                            <SuspensionCard view={suspension} className="lg:col-span-2" />
                            <ListingAudienceCard listingId={listing.id} className="lg:col-span-2" />
                            <ReviewsCard
                                subjectType="LISTING"
                                subjectId={listing.id}
                                ratingAvg={listing.ratingAvg}
                                reviewCount={listing.reviewCount}
                                onChanged={onChanged}
                            />
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Photographs</h3>
                                {listing.photoUrls.length === 0 ? (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        No photographs uploaded yet.
                                    </p>
                                ) : (
                                    <div className="mt-4 grid grid-cols-3 gap-2">
                                        {listing.photoUrls.slice(0, 6).map((url) => (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                key={url}
                                                src={url}
                                                alt=""
                                                className="aspect-[4/3] w-full rounded-md object-cover"
                                            />
                                        ))}
                                    </div>
                                )}
                            </Card>
                        </div>
                    ),
                },
                {
                    value: "orders",
                    label: "Orders",
                    content: (
                        <SimpleTable<Order>
                            rows={orders}
                            rowKey={(order) => order.id}
                            emptyMessage="Nothing has been booked on this spot yet."
                            columns={[
                                {
                                    key: "campaign",
                                    label: "Campaign",
                                    render: (order) => (
                                        <span className="font-medium text-foreground">
                                            {order.campaignName ?? order.id}
                                        </span>
                                    ),
                                },
                                {
                                    key: "flight",
                                    label: "Flight",
                                    render: (order) =>
                                        order.startDate && order.endDate
                                            ? `${formatDate(order.startDate)} to ${formatDate(order.endDate)}`
                                            : "Not scheduled",
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (order) => <StatusBadge status={ORDER_STATUS_META[order.status]} />,
                                },
                            ]}
                        />
                    ),
                },
                {
                    /* Lot E (Q125): the indicator, the gate, the engine's
                       proposals and the offer, with Apply / Unapply on each
                       factor. A binding apply reprices the spot, so the
                       page's rate tile re-reads after one. */
                    value: "pricing",
                    label: "Pricing",
                    content: <ListingPricingTab listingId={listing.id} ratePerDay={listing.ratePerDay} onRepriced={onChanged} />,
                },
                {
                    value: "activity",
                    label: "Activity",
                    content: <ActivityTimeline targets={[{ type: "Listing", id: listing.id }]} noun="this listing" />,
                },
            ]}
        />
    );
}
