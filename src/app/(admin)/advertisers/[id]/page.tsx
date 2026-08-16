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
import {
    ADVERTISER_STATUS_META,
    CAMPAIGN_STATUS_META,
    INVOICE_STATUS_META,
    type Campaign,
    type Invoice,
} from "@/types";

export const metadata: Metadata = { title: "Advertiser" };

export default async function AdvertiserDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const advertiser = await api.advertisers.get(id);
    if (!advertiser) notFound();

    const [campaigns, invoices, bookings] = await Promise.all([
        api.campaigns.list(),
        api.finance.invoices(),
        api.bookings.list(),
    ]);

    const advertiserCampaigns = campaigns.filter(
        (campaign) => campaign.advertiserId === advertiser.id
    );
    const advertiserInvoices = invoices.filter((invoice) => invoice.party === advertiser.name);
    const advertiserBookings = bookings.filter(
        (booking) => booking.advertiser === advertiser.name
    );

    return (
        <DetailShell
            backHref="/advertisers"
            backLabel="Advertisers"
            title={advertiser.name}
            subtitle={`${advertiser.industry} · ${advertiser.contact} · Joined ${formatDate(advertiser.joinedAt)}`}
            actions={
                <Button variant="outline" className="bg-card" asChild>
                    <Link href="/campaigns">View campaign queue</Link>
                </Button>
            }
            kpis={[
                {
                    id: "spend",
                    label: "Total spend",
                    value: formatCompactINR(advertiser.totalSpend),
                    hint: "lifetime",
                },
                {
                    id: "campaigns",
                    label: "Active campaigns",
                    value: String(advertiser.activeCampaigns),
                },
                {
                    id: "bookings",
                    label: "Bookings",
                    value: String(advertiserBookings.length),
                    hint: "current + past",
                },
                {
                    id: "status",
                    label: "Account status",
                    value: ADVERTISER_STATUS_META[advertiser.status].label,
                    hint: `Last activity ${advertiser.lastActive}`,
                },
            ]}
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    content: (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Contact</h3>
                                <FieldList
                                    className="mt-4"
                                    items={[
                                        ["Primary contact", advertiser.contact],
                                        ["Email", advertiser.email],
                                        ["Industry", advertiser.industry],
                                        ["GSTIN", advertiser.gstin],
                                        ["Joined", formatDate(advertiser.joinedAt)],
                                    ]}
                                />
                            </Card>
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">
                                    Recent bookings
                                </h3>
                                {advertiserBookings.length ? (
                                    <ul className="mt-4 space-y-3">
                                        {advertiserBookings.slice(0, 4).map((booking) => (
                                            <li
                                                key={booking.id}
                                                className="flex items-center justify-between gap-4 text-sm"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-foreground">
                                                        {booking.listing}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {booking.id} · {formatDate(booking.startDate)} -{" "}
                                                        {formatDate(booking.endDate)}
                                                    </p>
                                                </div>
                                                <span className="font-medium">{formatINR(booking.value)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        No bookings yet for this advertiser.
                                    </p>
                                )}
                            </Card>
                        </div>
                    ),
                },
                {
                    value: "campaigns",
                    label: "Campaigns",
                    content: (
                        <SimpleTable<Campaign>
                            rows={advertiserCampaigns}
                            rowKey={(campaign) => campaign.id}
                            emptyMessage="No campaigns submitted yet."
                            columns={[
                                {
                                    key: "name",
                                    label: "Campaign",
                                    render: (campaign) => (
                                        <Link
                                            href={`/campaigns/${campaign.id}`}
                                            className="font-medium text-foreground underline-offset-4 hover:underline"
                                        >
                                            {campaign.name}
                                        </Link>
                                    ),
                                },
                                {
                                    key: "budget",
                                    label: "Budget",
                                    render: (campaign) => formatINR(campaign.budget),
                                },
                                {
                                    key: "listings",
                                    label: "Listings",
                                    render: (campaign) => campaign.listings,
                                },
                                {
                                    key: "flight",
                                    label: "Flight",
                                    render: (campaign) =>
                                        `${formatDate(campaign.startDate)} to ${formatDate(campaign.endDate)}`,
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (campaign) => (
                                        <StatusBadge status={CAMPAIGN_STATUS_META[campaign.status]} />
                                    ),
                                },
                            ]}
                        />
                    ),
                },
                {
                    value: "invoices",
                    label: "Invoices",
                    content: (
                        <SimpleTable<Invoice>
                            rows={advertiserInvoices}
                            rowKey={(invoice) => invoice.id}
                            emptyMessage="No invoices issued yet."
                            columns={[
                                {
                                    key: "number",
                                    label: "Invoice",
                                    render: (invoice) => (
                                        <span className="font-medium text-foreground">{invoice.number}</span>
                                    ),
                                },
                                {
                                    key: "taxable",
                                    label: "Taxable",
                                    render: (invoice) => formatINR(invoice.amount),
                                },
                                {
                                    key: "gst",
                                    label: "GST 18%",
                                    render: (invoice) => formatINR(invoice.gst),
                                },
                                {
                                    key: "total",
                                    label: "Total",
                                    render: (invoice) => (
                                        <span className="font-medium">
                                            {formatINR(invoice.amount + invoice.gst)}
                                        </span>
                                    ),
                                },
                                {
                                    key: "due",
                                    label: "Due",
                                    render: (invoice) => formatDate(invoice.dueAt),
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (invoice) => (
                                        <StatusBadge status={INVOICE_STATUS_META[invoice.status]} />
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
