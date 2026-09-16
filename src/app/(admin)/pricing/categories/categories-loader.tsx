"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { pricingService } from "@/services/pricing";
import { priceModelService, type PricingCategoryRule } from "@/services/price-model";
import type { MediaType } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { CategoriesView } from "./categories-view";

interface Loaded {
    rules: PricingCategoryRule[];
    mediaTypes: MediaType[];
}

/**
 * The matrix on its own route. The same view sits under the Pricing model
 * hub's "Categories" tab.
 */
export function CategoriesLoader() {
    const live = isLive("pricingEngine");

    const resource = useApiResource<Loaded>(`price-model:categories:${live}`, async () => {
        if (!live) return { rules: [], mediaTypes: [] };
        const [rules, mediaTypes] = await Promise.all([
            priceModelService.categoryRules(),
            pricingService.mediaTypes(),
        ]);
        return { rules, mediaTypes };
    });

    return (
        <EngineShell
            title="Category rules"
            subtitle="What an advertiser sector pays, and whether it may book at all."
        >
            <ResourceBoundary resource={resource}>
                {(data) => (
                    <CategoriesView
                        rules={data.rules}
                        mediaTypes={data.mediaTypes}
                        onChanged={resource.reload}
                    />
                )}
            </ResourceBoundary>
        </EngineShell>
    );
}
