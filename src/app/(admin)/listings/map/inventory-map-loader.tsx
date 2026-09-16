"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { listingsService, type AdminListingsPage } from "@/services/listings";
import { mapsService, type MapsClientConfig } from "@/services/maps";
import { InventoryMap } from "./inventory-map";

/**
 * The map's data.
 *
 * The component used to carry seven Bengaluru clusters and their sites
 * inside itself — a thousand listings the platform did not have, in six
 * cities it had not opened. It reads the same `GET /listings` page the table
 * does now, under the same `listings` flag, and pins only what has a fix.
 *
 * One generous page rather than the whole table: the endpoint caps a page
 * at a hundred, and the map says when there is more behind it.
 *
 * G13-C: the maps seam's client config (`GET /app/maps` — the provider and
 * the browser key) is read beside the page and fails soft: a read that
 * fails, or a key not set yet, is the surface's placeholder, not a map
 * page that will not load.
 */
export const MAP_PAGE_SIZE = 100;

interface MapData {
    page: AdminListingsPage;
    mapsConfig: MapsClientConfig | null;
}

export function InventoryMapLoader() {
    const live = isLive("listings");
    const resource = useApiResource<MapData>(`listings:map:${live}`, async () => {
        if (!live) return { page: { items: [], total: 0, page: 1, pageSize: MAP_PAGE_SIZE, counts: {} }, mapsConfig: null };
        const [page, mapsConfig] = await Promise.all([
            listingsService.list({ sort: "NEWEST", pageSize: MAP_PAGE_SIZE }),
            mapsService.clientConfig().catch(() => null),
        ]);
        return { page, mapsConfig };
    });

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title="Inventory map" subtitle="Every placed spot on the marketplace, by city." />
                <EmptyState
                    icon={PlugZap}
                    title="The map reads the API"
                    description="This console is running on fixtures, and the seeded clusters this map used to draw are gone — they described listings the backend never held. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the real inventory."
                />
            </div>
        );
    }

    return <ResourceBoundary resource={resource}>{(data) => <InventoryMap page={data.page} mapsConfig={data.mapsConfig} />}</ResourceBoundary>;
}
