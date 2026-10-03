"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ReviewsCard } from "@/components/adx/reviews-card";
import { ActivityTimeline } from "@/components/adx/activity-timeline";
import { DetailShell } from "@/components/adx/detail-shell";
import { EmptyState } from "@/components/adx/empty-state";
import { SimpleTable } from "@/components/adx/simple-table";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { formatDate, formatMoney } from "@/lib/format";
import { apiConfig, isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useFeature } from "@/lib/use-feature";
import { todayIST } from "@/services/overview";
import {
    LISTING_STATUS_TONE,
    MAX_SLOTS,
    listingCategoryLabel,
    listingStatusLabel,
    listingsService,
    type AdminListingDetail,
} from "@/services/listings";
import { ATTEMPT_ORIGIN_LABEL, fieldsIn, plainLabel } from "@/services/listing-record";
import { orderService } from "@/services/orders";
import { countRunningOrders, suspensionService, type SuspensionView } from "@/services/suspension";
import { SuspensionActions } from "@/components/adx/suspend-dialog";
import { SuspensionCard } from "@/components/adx/suspension-card";
import { CustomFieldsCard } from "@/components/adx/custom-fields-card";
import { ORDER_STATUS_META, type Order } from "@/types";
import { ListingAudienceCard } from "./audience-card";
import { ListingVehicleCard } from "./vehicle-card";
import { ListingPricingTab } from "./pricing-tab";
import { CoverStrip, PhotoGallery, PhotoLightbox } from "./listing-gallery";
import { ChecksTab, PriceHistory } from "./listing-history";
import { ListingPerformance } from "./listing-performance";
import { AboutCard, AllRecordedData, AvailabilityCard, FieldsCard, LocationCard, OtherAnswersCard, RightsCard, TwoColumn, byLine, contextOf } from "./listing-sections";

/**
 * One listing, live — redesigned 3 Oct 2026 after the owner: "UI looks
 * really weird, I don't see any analytical stats for every listing,
 * there's no description data, there's no data on footfall and other
 * information that we are seeking from every listing", and "I need to see
 * everything what we store on a listing."
 *
 * Three reads: the whole record from `GET /listings/:id` (ADX's read —
 * every column and every row hanging off the spot), what is booked on it
 * from `GET /orders?listingId=`, and the suspension case. The Performance
 * tab reads `GET /listings/:id/insights` on its own, over its window.
 *
 * The shared detail shell: the actions top right, the status, the LST-
 * reference, the publisher, the city, the category and the rate in the
 * heading, the cover strip under it, the tabs pinned as the page scrolls.
 * The big number tiles are gone — rate, category and status sit in the
 * heading, the order count in Performance.
 *
 * Lot G (Q116/136) / G11-1: the Slots row is editable only when the read's
 * own `carriesLoop` says the spot is a screen. VH-1: a vehicle spot keeps
 * its RC card. Y-C: the vendors' measured footfall and audience sit beside
 * the publisher's stated figures.
 */

/**
 * VH-1: which spots have a vehicle to verify.
 *
 * A spot that already carries a registration always qualifies — somebody
 * typed one, so the question is live. Otherwise it is decided by what the
 * spot was filed as: transit media moves, a wall does not, and offering to
 * look up the RC of a hoarding would be noise on every other listing.
 */
const VEHICLE_WORDS = /\b(auto|rickshaw|taxi|cab|bus|van|truck|transit|vehicle|fleet|mobile)\b/i;
function isVehicleSpot(listing: AdminListingDetail): boolean {
    // A registration typed, or (3 Oct 2026) the kind of vehicle answered — either way the question is live.
    if (listing.vehicleNumber || listing.record.columns["vehicleType"]) return true;
    const filed = [listing.category, listing.subType, listing.mediaType?.name, listing.mediaType?.formatGroup];
    return filed.some((word) => typeof word === "string" && VEHICLE_WORDS.test(word));
}

/** The public spot page on the website — `/spaces/<LST-…>` — for a live spot. */
export function marketplaceUrl(listing: Pick<AdminListingDetail, "status" | "displayId" | "id">): string | null {
    if (listing.status !== "ACTIVE") return null;
    return `${apiConfig.siteUrl}/spaces/${encodeURIComponent(listing.displayId ?? listing.id)}`;
}

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

/** A group of cards under a quiet heading — "Site and visibility", "Commercial". */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3" aria-label={title}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
            {children}
        </section>
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
    const { record } = listing;
    const context = contextOf(listing);
    const [lightbox, setLightbox] = React.useState<number | null>(null);
    const [switching, setSwitching] = React.useState(false);
    /* CG5: the switch is a surface of `marketplace.instant-booking`. Off for
       the operator, the row reads as words — the same rule the apps follow —
       rather than a switch the API refuses on the first tap. */
    const instantBookingFeature = useFeature("marketplace.instant-booking").enabled === true;

    /* Lot D (Q105): the publisher's opt-in, switched from the console. On is
       refused by the API without the flag or a meeting place; the toast says so. */
    const setInstant = async (next: boolean) => {
        setSwitching(true);
        try {
            await listingsService.setInstantBooking(listing.id, next);
            toast.success(next ? "Instant booking on" : "Instant booking off", {
                description: next ? "A booking here is accepted without the publisher's tap." : "Bookings wait for the publisher's tap again.",
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
    const marketplace = marketplaceUrl(listing);
    const category = [listingCategoryLabel(listing.category), listing.subType].filter(Boolean).join(" · ");

    const slotsNode = digital ? (
        <span className="inline-flex items-center gap-2">
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
            <span className="text-xs text-muted-foreground">{savingSlots ? "Saving…" : `of ${MAX_SLOTS}`}</span>
        </span>
    ) : (
        `${listing.slotsTotal ?? 1} — one advertiser at a time`
    );

    const instantNode =
        instantBookingFeature && listing.instantBooking !== null ? (
            <span className="inline-flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{listing.instantBooking ? "On" : "Off"}</span>
                <Switch checked={listing.instantBooking} disabled={switching} onCheckedChange={setInstant} aria-label="Instant booking" />
            </span>
        ) : listing.instantBooking ? (
            "On"
        ) : (
            "Off"
        );

    const attempt = record.attempt;

    const overview = (
        <div className="space-y-6">
            <PhotoGallery photos={record.photos} title={listing.title} onOpen={setLightbox} />

            <Group title="Site and visibility">
                <TwoColumn>
                    <AboutCard record={record} context={context} />
                    <FieldsCard title="Site" description="Size, light, and where the face looks." fields={fieldsIn("site")} record={record} context={context} />
                    <FieldsCard
                        title="Footfall and audience"
                        description="As the publisher states them; the panels’ measured figures are under the map."
                        fields={fieldsIn("audience")}
                        record={record}
                        context={context}
                    />
                    <LocationCard record={record} context={context} title={listing.title} />
                    <FieldsCard
                        title="Slots and formats"
                        fields={fieldsIn("slots").filter((field) => field.key !== "slotsTotal")}
                        record={record}
                        context={context}
                        leadRows={[
                            ["Slots", slotsNode],
                            ["Screen with a loop", digital ? "Yes — each slot is one advertiser, at the rate per day" : "No — a static face"],
                            ["Filed as", listing.mediaType ? [listing.mediaType.name, listing.mediaType.formatGroup].filter(Boolean).join(" · ") : "Not stated"],
                        ]}
                    />
                    {isVehicleSpot(listing) ? <FieldsCard title="Vehicle" fields={fieldsIn("vehicle")} record={record} context={context} /> : null}
                </TwoColumn>
                {/* Y-C: what the panels measured in the spot's catchment — GeoIQ, Azira — with who gave which figure. */}
                <ListingAudienceCard listingId={listing.id} />
                {isVehicleSpot(listing) ? <ListingVehicleCard listing={listing} onChanged={onChanged} className="rounded-lg border-border shadow-none" /> : null}
            </Group>

            <Group title="Commercial">
                <TwoColumn>
                    <FieldsCard title="Rates" fields={fieldsIn("rates")} record={record} context={context} />
                    <FieldsCard
                        title="Booking terms"
                        fields={fieldsIn("booking").filter((field) => field.key !== "instantBooking")}
                        record={record}
                        context={context}
                        extraRows={[["Instant booking", instantNode]]}
                    />
                    <FieldsCard title="Rate card" fields={fieldsIn("rateCard")} record={record} context={context} />
                    <AvailabilityCard record={record} context={context} today={todayIST()} />
                    <RightsCard record={record} context={context} />
                    <FieldsCard title="Installation" fields={fieldsIn("installation")} record={record} context={context} />
                </TwoColumn>
            </Group>

            <Group title="Trust and record">
                <TwoColumn>
                    <FieldsCard
                        title="Trust and compliance"
                        fields={fieldsIn("trust")}
                        record={record}
                        context={context}
                        extraRows={[["Site verifications", `${record.counts.verifications} on record — see Checks`]]}
                    />
                    <FieldsCard
                        title="People and provenance"
                        fields={fieldsIn("people")}
                        record={record}
                        context={context}
                        extraRows={[
                            ["Publisher’s form", record.publisherType ? plainLabel(record.publisherType.toLowerCase()) : "Not stated"],
                            ["Partner publisher", record.isPartnerPublisher === null ? "Not stated" : record.isPartnerPublisher ? "Yes" : "No"],
                            ["Agent’s name", record.agentName ?? (listing.agentDisplayId ? "Not stated" : "No agent — self-serve")],
                            ["How it was filed", attempt ? ATTEMPT_ORIGIN_LABEL[attempt.origin] ?? plainLabel(attempt.origin.toLowerCase()) : "Not stated"],
                            ["Batch filed by", attempt ? byLine(attempt.createdAt, attempt.createdBy) : "Not stated"],
                            ["Batch file", attempt?.sourceFilename ?? "Not stated"],
                        ]}
                    />
                </TwoColumn>
                <SuspensionCard view={suspension} />
                {/* 3 Oct 2026: the listing form's answers that have no column — kept, never dropped; draws nothing when there are none. */}
                <OtherAnswersCard record={record} />
                {/* CF-1 (27 Sep 2026): the extra questions Settings › Custom fields asks of a listing; draws nothing when there are none. */}
                <CustomFieldsCard entity="LISTING" entityId={listing.id} />
                <ReviewsCard subjectType="LISTING" subjectId={listing.id} ratingAvg={listing.ratingAvg} reviewCount={listing.reviewCount} onChanged={onChanged} />
                <AllRecordedData record={record} context={context} />
            </Group>
        </div>
    );

    return (
        <>
            <DetailShell
                backHref="/listings/directory"
                backLabel="Listings"
                title={listing.title}
                titleAdornment={
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-normal">
                        <StatusBadge status={{ label: listingStatusLabel(listing.status), tone: LISTING_STATUS_TONE[listing.status] }} />
                        {listing.status !== "SUSPENDED" && <SuspendedChip scopes={scopes} />}
                    </span>
                }
                subtitle={listing.displayId ?? "No listing ID issued yet"}
                byline={
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" data-testid="listing-byline">
                        {listing.publisherId ? (
                            <Link href={`/publishers/${listing.publisherId}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                                {listing.publisherName ?? "The publisher"}
                            </Link>
                        ) : (
                            <span>Unclaimed</span>
                        )}
                        <span aria-hidden>·</span>
                        <span>{listing.city ?? "No city"}</span>
                        <span aria-hidden>·</span>
                        <span>{category || "No category"}</span>
                        <span aria-hidden>·</span>
                        <span className="font-medium text-foreground">{listing.ratePerDay ? `${formatMoney(listing.ratePerDay)} / day` : "Not priced"}</span>
                    </p>
                }
                notice={
                    <div className="space-y-3">
                        <CoverStrip photos={record.photos} title={listing.title} onOpen={setLightbox} />
                        {listing.rejectionReason ? <p className="rounded-md bg-danger/10 p-3 text-sm text-danger">Sent back: {listing.rejectionReason}</p> : null}
                    </div>
                }
                actions={
                    <>
                        {/* Suspend, and Reinstate once anything is in force. There
                            is no retire route on the API, so there is no Retire
                            button: INACTIVE is a state the platform reaches on its
                            own, not one ops can set from here. */}
                        <SuspensionActions
                            partyType="LISTING"
                            partyId={listing.id}
                            partyName={listing.title}
                            current={scopes}
                            runningOrders={countRunningOrders(orders)}
                            onDone={onChanged}
                        />
                        {/* The decision lives on the review desk, which has the
                            documents and the rate-card floor in front of it. */}
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
                        {marketplace ? (
                            <Button variant="outline" className="bg-card" asChild>
                                <a href={marketplace} target="_blank" rel="noreferrer">
                                    <ExternalLink className="mr-1.5 size-4" />
                                    Open on the marketplace
                                </a>
                            </Button>
                        ) : null}
                    </>
                }
                tabs={[
                    { value: "overview", label: "Overview", content: overview },
                    {
                        value: "performance",
                        label: "Performance",
                        content: (
                            <React.Suspense fallback={null}>
                                <ListingPerformance listingId={listing.id} />
                            </React.Suspense>
                        ),
                    },
                    { value: "checks", label: "Checks", content: <ChecksTab record={record} /> },
                    {
                        value: "orders",
                        label: `Orders (${orders.length})`,
                        content: (
                            <SimpleTable<Order>
                                rows={orders}
                                rowKey={(order) => order.id}
                                emptyMessage="Nothing has been booked on this spot yet."
                                columns={[
                                    {
                                        key: "campaign",
                                        label: "Campaign",
                                        render: (order) => <span className="font-medium text-foreground">{order.campaignName ?? order.id}</span>,
                                    },
                                    {
                                        key: "flight",
                                        label: "Flight",
                                        render: (order) => (order.startDate && order.endDate ? `${formatDate(order.startDate)} to ${formatDate(order.endDate)}` : "Not scheduled"),
                                    },
                                    { key: "status", label: "Status", render: (order) => <StatusBadge status={ORDER_STATUS_META[order.status]} /> },
                                ]}
                            />
                        ),
                    },
                    {
                        /* Lot E (Q125): the indicator, the gate, the engine's
                           proposals and the offer, with Apply / Unapply on each
                           factor; then (3 Oct 2026) the approvals, the locks and
                           who decided each factor. */
                        value: "pricing",
                        label: "Pricing",
                        content: (
                            <div className="space-y-4">
                                <ListingPricingTab listingId={listing.id} ratePerDay={listing.ratePerDay} onRepriced={onChanged} />
                                <PriceHistory record={record} />
                            </div>
                        ),
                    },
                    {
                        value: "activity",
                        label: "Activity",
                        content: <ActivityTimeline targets={[{ type: "Listing", id: listing.id }]} noun="this listing" />,
                    },
                ]}
            />
            <PhotoLightbox photos={record.photos} index={lightbox} title={listing.title} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
        </>
    );
}
