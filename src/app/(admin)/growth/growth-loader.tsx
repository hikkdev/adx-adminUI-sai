"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { growthService, type TemplateRow } from "@/services/growth";
import { GROWTH_SUBTITLE, GROWTH_TITLE } from "./growth-nav";
import { GrowthOffline } from "./growth-offline";
import { GrowthView } from "./growth-view";

/**
 * The CMS's data.
 *
 * Server shell + client loader, because `api-client` keeps its token in
 * localStorage and cannot run on the server. One resource for the whole
 * list — the endpoint returns every template, active or not, and the desk
 * wants to see the switched-off ones too.
 */
export function GrowthLoader() {
    const live = isLive("growth");
    const resource = useApiResource<TemplateRow[]>(`growth:templates:${live}`, () =>
        live ? growthService.templates() : Promise.resolve([]),
    );

    if (!live) return <GrowthOffline title={GROWTH_TITLE} subtitle={GROWTH_SUBTITLE} />;

    return (
        <ResourceBoundary resource={resource}>
            {(templates) => <GrowthView templates={templates} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
