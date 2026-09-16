"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type {
    Material,
    MediaType,
    MediaTypeMatchLogRow,
    SizeClass,
    VenueType,
} from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { VocabularyView } from "./media-types-view";

export function MediaTypesLoader() {
    const resource = useApiResource<{
        mediaTypes: MediaType[];
        sizeClasses: SizeClass[];
        materials: Material[];
        venues: VenueType[];
        matchLog: MediaTypeMatchLogRow[];
    }>("pricing:vocabulary", async () => {
        // Retired entries are fetched too: a screen for maintaining a list has
        // to show what was retired, or restoring one is impossible.
        const [mediaTypes, sizeClasses, materials, venues, matchLog] = await Promise.all([
            pricingService.mediaTypes(),
            pricingService.sizeClassesAll(),
            pricingService.materialsAll(),
            pricingService.venueTypes(true),
            pricingService.matchLog(100),
        ]);
        return { mediaTypes, sizeClasses, materials, venues, matchLog };
    });

    return (
        <EngineShell
            title="Media types, sizes & materials"
            subtitle="The three lists a comparable is matched on. A listing missing any of them enters no pool at all."
        >
            <ResourceBoundary resource={resource}>
                {(data) => <VocabularyView {...data} onChanged={resource.reload} />}
            </ResourceBoundary>
        </EngineShell>
    );
}
