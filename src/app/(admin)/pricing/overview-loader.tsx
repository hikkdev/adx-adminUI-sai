"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type {
    MediaType,
    MediaTypeMatchLogRow,
    PricingSettings,
    SurgeEventWindow,
    VocabularyProposal,
} from "@/types/pricing-engine";
import { EngineShell } from "./engine-shell";
import { PricingOverview } from "./overview-view";

export function OverviewLoader() {
    const resource = useApiResource<{
        mediaTypes: MediaType[];
        matchLog: MediaTypeMatchLogRow[];
        surge: SurgeEventWindow[];
        proposals: VocabularyProposal[];
        settings: PricingSettings;
    }>("pricing:overview", async () => {
        const [mediaTypes, matchLog, surge, proposals, settings] = await Promise.all([
            pricingService.mediaTypes(),
            pricingService.matchLog(100),
            pricingService.surgeWindows(true),
            pricingService.proposals(false),
            pricingService.settings(),
        ]);
        return { mediaTypes, matchLog, surge, proposals, settings };
    });

    return (
        <EngineShell
            title="Pricing"
            subtitle="A price-range suggester, not a quoter. Publishers set their own prices; this says whether the number looks right for where they are."
        >
            <ResourceBoundary resource={resource}>
                {(data) => <PricingOverview {...data} />}
            </ResourceBoundary>
        </EngineShell>
    );
}
