"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { pricingService } from "@/services/pricing";
import {
    priceModelService,
    type PriceDimension,
    type PriceModelSettings,
    type PriceRule,
    type PricingCategoryRule,
    type SiteOption,
} from "@/services/price-model";
import { rateCardService, type RateCard } from "@/services/rate-cards";
import type { MediaType, SurgeEventWindow } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { PricingModelView } from "./pricing-model-view";

interface Loaded {
    settings: PriceModelSettings | null;
    dimensions: PriceDimension[];
    cards: RateCard[];
    categoryRules: PricingCategoryRule[];
    mediaTypes: MediaType[];
    surgeWindows: SurgeEventWindow[];
    rules: PriceRule[];
    sampleSite: SiteOption | null;
}

const EMPTY: Loaded = {
    settings: null,
    dimensions: [],
    cards: [],
    categoryRules: [],
    mediaTypes: [],
    surgeWindows: [],
    rules: [],
    sampleSite: null,
};

/**
 * Everything the hub's five tabs draw, fetched together so switching tabs is
 * instant. One reload serves every tab: a card published under Rate cards is
 * the card the simulator traces from a moment later.
 */
export function PricingModelLoader() {
    const live = isLive("pricingEngine");

    const resource = useApiResource<Loaded>(`price-model:hub:${live}`, async () => {
        if (!live) return EMPTY;
        const [settings, dimensions, cards, categoryRules, mediaTypes, surgeWindows, rules, sites] =
            await Promise.all([
                priceModelService.settings(),
                priceModelService.dimensions(true),
                rateCardService.list(),
                priceModelService.categoryRules(),
                pricingService.mediaTypes(),
                pricingService.surgeWindows(true),
                priceModelService.rules(true),
                priceModelService.sites(),
            ]);
        return {
            settings,
            dimensions,
            cards,
            categoryRules,
            mediaTypes,
            surgeWindows,
            rules,
            sampleSite: sites.find((site) => site.mediaTypeId) ?? null,
        };
    });

    return (
        <EngineShell
            title="Pricing model"
            subtitle="The manual model: base rates, multipliers, category rules, seasonality and rules. What a quote is built from."
        >
            <ResourceBoundary resource={resource}>
                {(data) =>
                    data.settings ? (
                        <PricingModelView
                            // Remounts on reload so drafts restart from what the server stored.
                            key={`${JSON.stringify(data.settings)}:${data.dimensions.length}:${data.rules.length}`}
                            settings={data.settings}
                            dimensions={data.dimensions}
                            cards={data.cards}
                            categoryRules={data.categoryRules}
                            mediaTypes={data.mediaTypes}
                            surgeWindows={data.surgeWindows}
                            rules={data.rules}
                            sampleSite={data.sampleSite}
                            onChanged={resource.reload}
                        />
                    ) : null
                }
            </ResourceBoundary>
        </EngineShell>
    );
}
