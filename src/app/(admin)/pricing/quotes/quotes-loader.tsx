"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { pricingService } from "@/services/pricing";
import {
    priceModelService,
    type PriceDimension,
    type SavedQuote,
} from "@/services/price-model";
import type { MediaType } from "@/types/pricing-engine";
import { QuotesView } from "./quotes-view";

interface Loaded {
    quotes: SavedQuote[];
    mediaTypes: MediaType[];
    dimensions: PriceDimension[];
}

/**
 * The builder needs the catalogue and the dimensions to offer choices; the
 * pricing itself is a round trip made when the operator asks for it, because
 * the server owns the arithmetic and the floors.
 */
export function QuotesLoader() {
    const live = isLive("pricingEngine");

    const resource = useApiResource<Loaded>(`price-model:quotes:${live}`, async () => {
        if (!live) return { quotes: [], mediaTypes: [], dimensions: [] };
        const [quotes, mediaTypes, dimensions] = await Promise.all([
            priceModelService.quotes(),
            pricingService.mediaTypes(),
            priceModelService.dimensions(),
        ]);
        return { quotes, mediaTypes, dimensions };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <QuotesView
                    quotes={data.quotes}
                    mediaTypes={data.mediaTypes}
                    dimensions={data.dimensions}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
