"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { competitorsService, type SightingsPage, type SightingsQuery } from "@/services/competitors";
import { LeadsOffline } from "../leads-offline";
import { CompetitorsView } from "./competitors-view";

export interface CompetitorsData {
    page: SightingsPage;
    brands: { brand: string; count: number }[];
}

/**
 * VA-2: the desk's read of the sightings. The filters live in this loader's
 * state so a re-read after an analysis keeps the desk where it was.
 */
export function CompetitorsLoader() {
    const live = isLive("leads");
    const [query, setQuery] = React.useState<SightingsQuery>({ page: 1, pageSize: 50 });
    const key = JSON.stringify(query);
    const resource = useApiResource<CompetitorsData>(`leads:competitors:${live}:${key}`, async () => {
        const [page, brands] = await Promise.all([competitorsService.list(query), competitorsService.brands().catch(() => [])]);
        return { page, brands };
    });
    if (!live) return <LeadsOffline />;
    return (
        <ResourceBoundary resource={resource}>
            {(data) => <CompetitorsView data={data} query={query} onQuery={setQuery} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
