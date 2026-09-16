"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { geoReadsApi, geoService, type CityReadiness, type GeoCityDetail } from "@/services/geo";
import { GeographiesOffline } from "../geographies-offline";
import { CityView } from "./city-view";

/**
 * One city's page — `GET /geo/cities/:slug` (the row, its counts, its last
 * 50 events) and, beside it, `GET /geo/cities/:slug/readiness`, whose
 * failure is the checklist's alone. A move or a toggle reloads both.
 */
export function CityLoader({ slug }: { slug: string }) {
    const live = geoReadsApi();
    const { can } = useAuth();
    const detail = useApiResource<GeoCityDetail | null>(`geo:city:${slug}:${live}`, () => (live ? geoService.city(slug) : Promise.resolve(null)));
    const readiness = useApiResource<CityReadiness | null>(`geo:readiness:${slug}:${live}`, () => (live ? geoService.readiness(slug) : Promise.resolve(null)));

    if (!live) return <GeographiesOffline />;

    const reload = () => {
        detail.reload();
        readiness.reload();
    };

    return (
        <ResourceBoundary resource={detail}>
            {(city) => (city ? <CityView detail={city} readiness={readiness} onChanged={reload} mayEdit={can("settings.edit")} /> : null)}
        </ResourceBoundary>
    );
}
