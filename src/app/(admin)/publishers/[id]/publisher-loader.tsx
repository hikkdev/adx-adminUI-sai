"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { kycService } from "@/services/kyc";
import { publisherService, type PublisherSummary } from "@/services/publishers";
import { financeService, type Withdrawal } from "@/services/finance";
import type { AdminListing } from "@/services/listings";
import { supplyService } from "@/services/supply";
import { suspensionService, type SuspensionView } from "@/services/suspension";
import type { KycCase, Publisher } from "@/types";
import { PublisherDetail } from "./publisher-detail";
import { readPublisherSubscriptionFacts, type PublisherSubscriptionFacts } from "./subscription-card";

interface Loaded {
    publisher: Publisher | null;
    sites: AdminListing[];
    kycCase?: KycCase;
    /** The queue's rows for this publisher; null when finance is off or the read failed. */
    withdrawals: Withdrawal[] | null;
    /** Lot A: the sections stopped and the history. Null when the API is off or the read failed. */
    suspension: SuspensionView | null;
    /** Lot J-C: the plan the bookings carry, what is queued, and the last orders. Null when finance is off; each read degrades on its own. */
    subscription: PublisherSubscriptionFacts | null;
    /** P-C: `GET /publishers/:id/summary` — the tile row's money, the agent's name and the feed. Null when supply is off or the read failed. */
    summary: PublisherSummary | null;
}

/**
 * A client loader rather than an async server component.
 *
 * The console's API client keeps its token in localStorage, so anything reading
 * real data has to do it from the browser. This page used to be a server
 * component resolving five fixture sources — which was fine until the supply
 * screens went live and started linking into it with real ids. Every one of
 * those links answered 404: the domain read correctly and was still unusable,
 * because following a row through is the entire point of a queue.
 *
 * The publisher and its sites come from the API when supply is live. The
 * Payouts tab reads the finance queue by `?publisherId=` (E6) — the profile
 * behind the wallet, so a namesake is never on the list. Activity reads
 * `/audit/targets/Publisher/:id` inside the detail page itself; the tile
 * row's money, the agent's name and the merged feed are
 * `GET /publishers/:id/summary` (P-C), the mirror of the advertiser card.
 */
export function PublisherLoader({ id }: { id: string }) {
    const live = isLive("supply");

    const resource = useApiResource<Loaded>(`publisher:${id}:${live}`, async () => {
        const [publisher, sites, suspension, summary] = await Promise.all([
            supplyService.publisher(id),
            supplyService.publisherListings(id),
            // The case beside the row rather than derived from it: the card
            // draws the history too, and a failed read leaves the card saying
            // so rather than the page failing.
            isLive("suspension") ? suspensionService.history("PUBLISHER", id).catch(() => null) : Promise.resolve(null),
            // P-C: the detail card — the money tiles, who onboarded them and
            // the feed. A failed read leaves the tiles saying so, not zero.
            live ? publisherService.summary(id).catch(() => null) : Promise.resolve(null),
        ]);
        if (!publisher) return { publisher: null, sites: [], withdrawals: null, suspension: null, subscription: null, summary: null };

        // The queue for this publisher's wallet. A failed read leaves the
        // tab saying so rather than the page failing.
        const withdrawals = isLive("finance")
            ? await financeService.withdrawals({ publisherId: publisher.id }).catch(() => null)
            : null;

        // Lot J-C: the subscription card's reads, keyed on the profile id
        // the revenue module names. Each read that fails leaves its own
        // section of the card saying so (Lot J leftover b) — the orders
        // read answering FEATURE_OFF is the app's purchase being dark, not
        // the subscriptions being unreadable.
        const subscription = isLive("finance") ? await readPublisherSubscriptionFacts(publisher.id) : null;

        // The KYC case is the desk's own read; a publisher with no record yet
        // answers 404, which is simply no card. Offline there is none either:
        // the `kyc_*` seeds are gone with the desk's flip.
        const kycCase = live && isLive("kyc") ? await kycService.get(publisher.id).catch(() => null) : null;
        return { publisher, sites, kycCase: kycCase ?? undefined, withdrawals, suspension, subscription, summary };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.publisher) notFound();
                return (
                    <PublisherDetail
                        publisher={data.publisher}
                        sites={data.sites}
                        kycCase={data.kycCase}
                        withdrawals={data.withdrawals}
                        suspension={data.suspension}
                        subscription={data.subscription}
                        summary={data.summary}
                        onChanged={resource.reload}
                    />
                );
            }}
        </ResourceBoundary>
    );
}
