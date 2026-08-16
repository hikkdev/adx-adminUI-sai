import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailShell } from "@/components/adx/detail-shell";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatCompactINR, formatDate, formatINR } from "@/lib/format";
import { api } from "@/services";
import { BOOKING_STATUS_META, LISTING_STATUS_META, type Booking } from "@/types";

export const metadata: Metadata = { title: "Listing" };

export default async function ListingDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const listing = await api.listings.get(id);
    if (!listing) notFound();

    const bookings = (await api.bookings.list()).filter(
        (booking) => booking.listing === listing.title
    );

    return (
        <DetailShell
            backHref="/listings"
            backLabel="Listings"
            title={listing.title}
            subtitle={`${listing.publisher} · ${listing.location}`}
            actions={
                listing.status === "pending_review" ? (
                    <>
                        <Button variant="outline" className="bg-card text-danger hover:text-danger">
                            Reject
                        </Button>
                        <Button>Approve &amp; publish</Button>
                    </>
                ) : (
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href={`/publishers/${listing.publisherId}`}>View publisher</Link>
                    </Button>
                )
            }
            kpis={[
                {
                    id: "rate",
                    label: "Monthly rate",
                    value: formatCompactINR(listing.monthlyRate),
                },
                { id: "type", label: "Category", value: listing.type },
                {
                    id: "status",
                    label: "Status",
                    value: LISTING_STATUS_META[listing.status].label,
                    hint: `Submitted ${listing.submittedAt}`,
                },
                {
                    id: "bookings",
                    label: "Upcoming bookings",
                    value: String(bookings.length),
                },
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
                                        ["Dimensions", listing.sizeFt],
                                        ["Illumination", listing.litType ?? "-"],
                                        ["Facing", listing.facing ?? "-"],
                                        ["City", listing.city],
                                        ["Location", listing.location],
                                        ["Photos", `${listing.photos} uploaded`],
                                    ]}
                                />
                            </Card>
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Media</h3>
                                <div className="mt-4 grid grid-cols-3 gap-2">
                                    {Array.from({ length: Math.min(listing.photos, 6) }).map((_, index) => (
                                        <div
                                            key={index}
                                            className="flex aspect-[4/3] items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground"
                                        >
                                            IMG {index + 1}
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-3 text-xs text-muted-foreground">
                                    Full-resolution media is served from the asset store in production.
                                </p>
                            </Card>
                        </div>
                    ),
                },
                {
                    value: "bookings",
                    label: "Bookings",
                    content: (
                        <SimpleTable<Booking>
                            rows={bookings}
                            rowKey={(booking) => booking.id}
                            emptyMessage="No bookings for this site yet."
                            columns={[
                                {
                                    key: "advertiser",
                                    label: "Advertiser",
                                    render: (booking) => (
                                        <span className="font-medium text-foreground">
                                            {booking.advertiser}
                                        </span>
                                    ),
                                },
                                {
                                    key: "campaign",
                                    label: "Campaign",
                                    render: (booking) => (
                                        <span className="text-muted-foreground">{booking.campaign}</span>
                                    ),
                                },
                                {
                                    key: "flight",
                                    label: "Flight",
                                    render: (booking) =>
                                        `${formatDate(booking.startDate)} to ${formatDate(booking.endDate)}`,
                                },
                                {
                                    key: "value",
                                    label: "Value",
                                    render: (booking) => (
                                        <span className="font-medium">{formatINR(booking.value)}</span>
                                    ),
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (booking) => (
                                        <StatusBadge status={BOOKING_STATUS_META[booking.status]} />
                                    ),
                                },
                            ]}
                        />
                    ),
                },
            ]}
        />
    );
}
