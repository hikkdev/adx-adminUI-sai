"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { advertiserService } from "@/services/advertisers";
import type { Advertiser } from "@/types";
import { AdvertisersTable } from "./advertisers-table";

export function AdvertisersLoader() {
    const live = isLive("advertisers");
    const resource = useApiResource<Advertiser[]>(`advertisers:list:${live}`, () =>
        advertiserService.list()
    );

    return (
        <ResourceBoundary resource={resource}>
            {(advertisers) => <AdvertisersTable advertisers={advertisers} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
