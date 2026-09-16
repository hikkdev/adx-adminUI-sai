"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { revenueService, type PublisherPlan } from "@/services/revenue";
import { PublisherPlansView } from "./publisher-plans-view";

/**
 * The publisher plans' data — Lot J-C over Lot J-B1's catalogue.
 *
 * One read, `GET /revenue/plans?includeInactive=true` (the retired rows too,
 * honoured for ADMIN only), re-run after every edit so the cards show what
 * the next purchase will actually be priced on. Gated on `finance` the way
 * the commission screen is: a plan's rate is a finance number.
 */
export function PublisherPlansLoader() {
    const live = isLive("finance");

    const resource = useApiResource<PublisherPlan[]>(`revenue:plans:${live}`, () =>
        live ? revenueService.plans() : Promise.resolve([]),
    );

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="The publisher plans read the API"
                description="A plan here is what the next purchase is priced on and the commission rate a subscriber is granted. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to edit them."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(plans) => <PublisherPlansView plans={plans} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
