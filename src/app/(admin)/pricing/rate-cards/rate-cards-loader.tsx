"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { rateCardService, type RateCard } from "@/services/rate-cards";
import { EngineShell } from "../engine-shell";
import { RateCardsTable } from "./rate-cards-table";

/**
 * The register on its own route. The same table sits under the Pricing model
 * hub's "Rate cards" tab; this is where a bookmark or a back link lands.
 */
export function RateCardsLoader() {
    const live = isLive("pricingEngine");
    const resource = useApiResource<RateCard[]>(`rate-cards:list:${live}`, async () =>
        // `EngineShell` renders the not-connected notice instead of the table,
        // so asking the server would only produce an error behind it.
        live ? rateCardService.list() : []
    );

    return (
        <EngineShell
            title="Rate cards"
            subtitle="What ADX has agreed a kind of spot is worth. An active card gates publishing."
        >
            <ResourceBoundary resource={resource}>
                {(cards) => <RateCardsTable cards={cards} onChanged={resource.reload} />}
            </ResourceBoundary>
        </EngineShell>
    );
}
