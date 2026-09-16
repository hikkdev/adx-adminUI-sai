"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { mapsService, type MapsClientConfig } from "@/services/maps";

/**
 * AD-C: `GET /app/maps` once for a small map drawn inside a form or a
 * card. The map-shaped screens read it beside their own data; a pin
 * picker or a mini map has no data of its own, so this is the read. A
 * failed read is the null the surface draws its placeholder on, never an
 * error the form has to show.
 */
export function useMapsConfig(): { config: MapsClientConfig | null; loading: boolean } {
    const resource = useApiResource<MapsClientConfig | null>("maps:client-config", () => mapsService.clientConfig().catch(() => null));
    return { config: resource.data, loading: resource.loading };
}
