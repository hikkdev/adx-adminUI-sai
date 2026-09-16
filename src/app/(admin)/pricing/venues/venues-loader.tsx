"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type { MediaType, VenueType } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { VenuesView } from "./venues-view";

export function VenuesLoader() {
    const resource = useApiResource<{ venues: VenueType[]; mediaTypes: MediaType[] }>(
        "pricing:venues",
        async () => {
            // Retired venues too: a screen for maintaining a list has to show
            // what was retired, or restoring one is impossible.
            const [venues, mediaTypes] = await Promise.all([
                pricingService.venueTypes(true),
                pricingService.mediaTypes(),
            ]);
            return { venues, mediaTypes };
        }
    );

    return (
        <EngineShell
            title="Venues"
            subtitle="The coarsest division in the comparable match key. A gym mirror decal is compared against gym mirror decals, never against a hospital's."
        >
            <ResourceBoundary resource={resource}>
                {(data) => <VenuesView {...data} onChanged={resource.reload} />}
            </ResourceBoundary>
        </EngineShell>
    );
}
