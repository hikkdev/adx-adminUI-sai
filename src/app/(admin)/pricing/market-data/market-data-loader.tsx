"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type { Material, MediaType, SizeClass } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { MarketDataView } from "./market-data-view";

export function MarketDataLoader() {
    const resource = useApiResource<{
        mediaTypes: MediaType[];
        sizeClasses: SizeClass[];
        materials: Material[];
    }>("pricing:market-data", async () => {
        const [mediaTypes, sizeClasses, materials] = await Promise.all([
            pricingService.mediaTypes(),
            pricingService.sizeClasses(),
            pricingService.materials(),
        ]);
        return { mediaTypes, sizeClasses, materials };
    });

    return (
        <EngineShell
            title="Market data"
            subtitle="The research team's output. At launch it is nearly every comparable the engine has."
        >
            <ResourceBoundary resource={resource}>
                {(data) => <MarketDataView {...data} />}
            </ResourceBoundary>
        </EngineShell>
    );
}
