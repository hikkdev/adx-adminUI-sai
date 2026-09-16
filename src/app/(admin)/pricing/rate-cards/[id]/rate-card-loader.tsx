"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { pricingService } from "@/services/pricing";
import { priceModelService, type PriceModelSettings } from "@/services/price-model";
import { rateCardService, type RateCard } from "@/services/rate-cards";
import type { MediaType } from "@/types/pricing-engine";
import { EngineShell } from "../../engine-shell";
import { RateCardBuilder } from "./rate-card-builder";

interface Loaded {
    card: RateCard | null;
    mediaTypes: MediaType[];
    settings: PriceModelSettings | null;
}

/**
 * The grid is media types down the side and grades across the top, so it needs
 * the media-type vocabulary as well as the card; the settings rail reads the
 * model's minimum booking. All from the API; there is no seeded version.
 */
export function RateCardLoader({ id }: { id: string }) {
    const live = isLive("pricingEngine");

    const resource = useApiResource<Loaded>(`rate-card:${id}:${live}`, async () => {
        if (!live) return { card: null, mediaTypes: [], settings: null };
        const [card, mediaTypes, settings] = await Promise.all([
            rateCardService.get(id),
            pricingService.mediaTypes(),
            priceModelService.settings(),
        ]);
        return { card, mediaTypes, settings };
    });

    return (
        <EngineShell
            title="Rate card"
            subtitle="Base rates per media type and locality grade, versioned and signed off."
        >
            <ResourceBoundary resource={resource}>
                {(data) => {
                    if (!data.card || !data.settings) notFound();
                    return (
                        <RateCardBuilder
                            card={data.card}
                            mediaTypes={data.mediaTypes}
                            settings={data.settings}
                            onChanged={resource.reload}
                        />
                    );
                }}
            </ResourceBoundary>
        </EngineShell>
    );
}
