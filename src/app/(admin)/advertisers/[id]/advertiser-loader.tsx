"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { campaignService, type CampaignRow } from "@/services/campaigns";
import { advertiserService, type AdvertiserSummary } from "@/services/advertisers";
import { advertiserKycService } from "@/services/advertiser-kyc";
import { isLive } from "@/lib/api-config";
import { invoicesService, type InvoiceRow } from "@/services/invoices";
import { orderService, type OrdersPage } from "@/services/orders";
import { suspensionService, type SuspensionView } from "@/services/suspension";
import type { Advertiser, AdvertiserKycCase } from "@/types";
import { AdvertiserDetail } from "./advertiser-detail";

interface Loaded {
    advertiser: Advertiser | null;
    campaigns: CampaignRow[];
    /** Lot B: the documents issued to this account, newest first. */
    invoices: InvoiceRow[];
    /** Lot A: the sections stopped and the history. Null when the API is off or the read failed. */
    suspension: SuspensionView | null;
    /** The detail card's metrics — lifetime spend. Null when the API is off or the read failed. */
    summary: AdvertiserSummary | null;
    /** E7-2: this account's orders through `?advertiserId=`, newest first. Null when the API is off or the read failed. */
    bookings: OrdersPage | null;
    /** Lot N: the KYC row keyed by the account's user id — the desk's ask and who recorded it. Null when there is none, the KYC desk is off, or the read failed. */
    kycCase: AdvertiserKycCase | null;
}

/** The frame's Recent bookings card is short; the bookings board is one click away. */
const RECENT_BOOKINGS = 5;

/**
 * One advertiser, and the sections that follow it.
 *
 * The account, its campaigns and its invoices all come from the API, the
 * last through the register's `advertiserId` facet — Lot B gave `Invoice` a
 * table, and the tab that used to explain its own emptiness now lists the
 * documents. Bookings follow since E7-2: `GET /orders?advertiserId=` reaches
 * the account through the campaign each order was raised from, so the
 * frame's Recent bookings card and its Bookings tile are the account's own.
 * The tile row's lifetime spend is `GET /advertisers/:id/summary`.
 *
 * Nothing here matches by name any more. The old invoices tab did —
 * `invoice.party === advertiser.name` — and would have put another
 * company's tax invoices on a real advertiser's page the moment a name
 * happened to match. Those fixtures are gone.
 */
export function AdvertiserLoader({ id }: { id: string }) {
    const live = isLive("advertisers");

    const resource = useApiResource<Loaded>(`advertiser:${id}:${live}`, async () => {
        const advertiser = await advertiserService.get(id);
        if (!advertiser) {
            return { advertiser: null, campaigns: [], invoices: [], suspension: null, summary: null, bookings: null, kycCase: null };
        }

        if (live) {
            // Campaigns, invoices, orders and the summary are all this
            // advertiser's, by id. The suspension case is read beside the row
            // because the card draws its history; a failed read on any of the
            // side reads leaves its card saying so rather than failing the page.
            const [page, invoicePage, suspension, summary, bookings, kycCase] = await Promise.all([
                campaignService.list({ advertiserId: advertiser.id }),
                invoicesService.list({ advertiserId: advertiser.id, pageSize: 100 }),
                isLive("suspension")
                    ? suspensionService.history("ADVERTISER", advertiser.id).catch(() => null)
                    : Promise.resolve(null),
                advertiserService.summary(advertiser.id).catch(() => null),
                isLive("orders")
                    ? orderService
                          .page({ advertiserId: advertiser.id, sort: "NEWEST", pageSize: RECENT_BOOKINGS })
                          .catch(() => null)
                    : Promise.resolve(null),
                // Lot N / N3-B: the KYC queue row is keyed by the PROFILE — every advertiser is on it, app account or not; a failed read leaves the card without the desk's stamps, not the page failing.
                isLive("kyc") ? advertiserKycService.findForAdvertiser(advertiser.id).catch(() => null) : Promise.resolve(null),
            ]);
            return { advertiser, campaigns: page.items, invoices: invoicePage.items, suspension, summary, bookings, kycCase };
        }

        // Offline. The campaign and invoice fixtures are gone — their ids were
        // never the backend's — so this account shows none of either rather
        // than someone else's, exactly as the wallet tab already does.
        return { advertiser, campaigns: [], invoices: [], suspension: null, summary: null, bookings: null, kycCase: null };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.advertiser) notFound();
                return (
                    <AdvertiserDetail
                        advertiser={data.advertiser}
                        campaigns={data.campaigns}
                        invoices={data.invoices}
                        suspension={data.suspension}
                        summary={data.summary}
                        bookings={data.bookings}
                        kycCase={data.kycCase}
                        onChanged={resource.reload}
                    />
                );
            }}
        </ResourceBoundary>
    );
}
