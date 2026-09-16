"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { pricingService } from "@/services/pricing";
import { priceModelService, type PriceRule, type SiteOption } from "@/services/price-model";
import type { MediaType } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { RuleBuilder } from "./rule-builder";

interface Loaded {
    rules: PriceRule[];
    mediaTypes: MediaType[];
    sampleSite: SiteOption | null;
}

/**
 * The builder on its own route. The same view sits under the Pricing model
 * hub's "Rules" tab. Inactive rules are listed too: a rule switched off is
 * still something ops wrote and will want to switch back on.
 */
export function RulesLoader() {
    const live = isLive("pricingEngine");

    const resource = useApiResource<Loaded>(`price-model:rules:${live}`, async () => {
        if (!live) return { rules: [], mediaTypes: [], sampleSite: null };
        const [rules, mediaTypes, sites] = await Promise.all([
            priceModelService.rules(true),
            pricingService.mediaTypes(),
            priceModelService.sites(),
        ]);
        return { rules, mediaTypes, sampleSite: sites.find((site) => site.mediaTypeId) ?? null };
    });

    return (
        <EngineShell
            title="Pricing rules"
            subtitle="Adjustments that fire when a quote matches their conditions."
        >
            <ResourceBoundary resource={resource}>
                {(data) => (
                    <RuleBuilder
                        rules={data.rules}
                        mediaTypes={data.mediaTypes}
                        sampleSite={data.sampleSite}
                        onChanged={resource.reload}
                    />
                )}
            </ResourceBoundary>
        </EngineShell>
    );
}
