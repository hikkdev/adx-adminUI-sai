import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DetailShell } from "@/components/adx/detail-shell";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatCompactINR, formatDate, formatINR } from "@/lib/format";
import { api } from "@/services";
import { BOOKING_STATUS_META, CAMPAIGN_STATUS_META, type Booking } from "@/types";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const campaign = await api.campaigns.get(id);
    if (!campaign) notFound();

    const bookings = (await api.bookings.list()).filter(
        (booking) => booking.campaign === campaign.name
    );

    const utilisation = campaign.budget
        ? Math.round((campaign.spent / campaign.budget) * 100)
        : 0;

    return (
        <DetailShell
            backHref="/campaigns"
            backLabel="Campaigns"
            title={campaign.name}
            subtitle={`${campaign.advertiser} · ${campaign.objective}`}
            actions={
                campaign.status === "awaiting_approval" ? (
                    <>
                        <Button variant="outline" className="bg-card text-danger hover:text-danger">
                            Reject
                        </Button>
                        <Button>Approve campaign</Button>
                    </>
                ) : (
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href={`/advertisers/${campaign.advertiserId}`}>View advertiser</Link>
                    </Button>
                )
            }
            kpis={[
                { id: "budget", label: "Budget", value: formatCompactINR(campaign.budget) },
                {
                    id: "spent",
                    label: "Spent",
                    value: formatCompactINR(campaign.spent),
                    hint: `${utilisation}% utilised`,
                },
                { id: "listings", label: "Listings", value: String(campaign.listings) },
                {
                    id: "status",
                    label: "Status",
                    value: CAMPAIGN_STATUS_META[campaign.status].label,
                    hint: `Ends ${formatDate(campaign.endDate)}`,
                },
            ]}
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    content: (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">
                                    Campaign details
                                </h3>
                                <FieldList
                                    className="mt-4"
                                    items={[
                                        ["Advertiser", campaign.advertiser],
                                        ["Objective", campaign.objective],
                                        ["Cities", campaign.cities.join(", ")],
                                        [
                                            "Flight",
                                            `${formatDate(campaign.startDate)} to ${formatDate(campaign.endDate)}`,
                                        ],
                                        ["Submitted", formatDate(campaign.submittedAt)],
                                    ]}
                                />
                            </Card>
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">
                                    Budget utilisation
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {formatINR(campaign.spent)} of {formatINR(campaign.budget)} spent
                                </p>
                                <Progress value={utilisation} className="mt-4 h-2" />
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {utilisation}% utilised across {campaign.listings} listings
                                </p>
                            </Card>
                        </div>
                    ),
                },
                {
                    value: "sites",
                    label: "Booked sites",
                    content: (
                        <SimpleTable<Booking>
                            rows={bookings}
                            rowKey={(booking) => booking.id}
                            emptyMessage="No sites booked for this campaign yet."
                            columns={[
                                {
                                    key: "site",
                                    label: "Site",
                                    render: (booking) => (
                                        <span className="font-medium text-foreground">{booking.listing}</span>
                                    ),
                                },
                                {
                                    key: "city",
                                    label: "City",
                                    render: (booking) => (
                                        <span className="text-muted-foreground">{booking.city}</span>
                                    ),
                                },
                                {
                                    key: "publisher",
                                    label: "Publisher",
                                    render: (booking) => (
                                        <span className="text-muted-foreground">{booking.publisher}</span>
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
