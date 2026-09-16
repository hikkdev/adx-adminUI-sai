"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { advertiserService } from "@/services/advertisers";
import { pricingService } from "@/services/pricing";
import {
    priceModelService,
    type PriceDimension,
    type PriceModelSettings,
    type SiteOption,
} from "@/services/price-model";
import type { Advertiser } from "@/types";
import type { MediaType } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { SimulatorView } from "./simulator-view";

interface Loaded {
    sites: SiteOption[];
    advertisers: Advertiser[];
    dimensions: PriceDimension[];
    settings: PriceModelSettings | null;
    mediaTypes: MediaType[];
}

/**
 * The simulator needs the things its inputs choose from — sites, advertisers,
 * dimensions — and the model's settings for what a discount means. The trace
 * itself is a round trip made as the inputs change, because the server owns the
 * arithmetic and the floors.
 */
export function SimulatorLoader() {
    const live = isLive("pricingEngine");

    const resource = useApiResource<Loaded>(`price-model:simulator:${live}`, async () => {
        if (!live) return { sites: [], advertisers: [], dimensions: [], settings: null, mediaTypes: [] };
        const [sites, advertisers, dimensions, settings, mediaTypes] = await Promise.all([
            priceModelService.sites(),
            advertiserService.list(),
            priceModelService.dimensions(),
            priceModelService.settings(),
            pricingService.mediaTypes(),
        ]);
        return {
            // Only a site with a media type can be priced from a card.
            sites: sites.filter((site) => site.mediaTypeId),
            advertisers,
            dimensions,
            settings,
            mediaTypes,
        };
    });

    return (
        <EngineShell
            title="Price simulator"
            subtitle="One real site, traced from the rate card to net to publisher."
        >
            <ResourceBoundary resource={resource}>
                {(data) =>
                    data.settings ? (
                        <SimulatorView
                            sites={data.sites}
                            advertisers={data.advertisers}
                            dimensions={data.dimensions}
                            settings={data.settings}
                            mediaTypes={data.mediaTypes}
                        />
                    ) : null
                }
            </ResourceBoundary>
        </EngineShell>
    );
}
