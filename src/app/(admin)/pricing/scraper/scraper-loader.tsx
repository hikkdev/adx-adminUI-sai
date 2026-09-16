"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type { ScraperSource } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { ScraperView } from "./scraper-view";

export function ScraperLoader() {
    const resource = useApiResource<ScraperSource[]>("pricing:scraper-sources", () =>
        pricingService.scraperSources()
    );

    return (
        <EngineShell
            title="Event sources"
            subtitle="Where the surge calendar comes from. The scraper runs headless; this is the part ops can change."
        >
            <ResourceBoundary resource={resource}>
                {(sources) => <ScraperView sources={sources} onChanged={resource.reload} />}
            </ResourceBoundary>
        </EngineShell>
    );
}
