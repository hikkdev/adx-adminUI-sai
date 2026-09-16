"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { milestoneService } from "@/services/milestones";
import type { FulfilmentPlan, FulfilmentTemplate } from "@/types";
import { TemplatesOffline } from "./templates-offline";
import { TemplatesView } from "./templates-view";

interface Loaded {
    templates: FulfilmentTemplate[];
    plans: FulfilmentPlan[];
}

/**
 * The templates screen's data.
 *
 * Server shell + client loader, because `api-client` keeps its token in
 * localStorage and cannot run on the server. Both lists come in one resource
 * so a plan's steps are always named against the same templates the cards
 * above them draw, and one reload after any write refreshes both.
 *
 * Gated on `orders`: a template is only ever a step on an order, and
 * `milestoneService` already reads that flag for the order page's own use
 * of the same rows.
 */
export function TemplatesLoader() {
    const live = isLive("orders");
    const resource = useApiResource<Loaded>(`flows:templates:${live}`, async () => {
        if (!live) return { templates: [], plans: [] };
        const [templates, plans] = await Promise.all([milestoneService.allTemplates(), milestoneService.plans()]);
        return { templates, plans };
    });

    if (!live) return <TemplatesOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <TemplatesView templates={data.templates} plans={data.plans} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
