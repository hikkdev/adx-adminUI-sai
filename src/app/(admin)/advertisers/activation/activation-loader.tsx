"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { advertiserService } from "@/services/advertisers";
import type { AdvertiserFunnel, AdvertiserFunnelRow } from "@/types";
import { AdvertiserActivationFunnel } from "./activation-funnel";

type Data = { funnel: AdvertiserFunnel; rows: AdvertiserFunnelRow[] };

export function AdvertiserActivationLoader() {
    const resource = useApiResource<Data>("advertisers:activation", async () => {
        const [funnel, rows] = await Promise.all([
            advertiserService.funnel(),
            advertiserService.funnelRows(),
        ]);
        return { funnel, rows };
    });

    return (
        <ResourceBoundary resource={resource}>
            {({ funnel, rows }) => <AdvertiserActivationFunnel funnel={funnel} rows={rows} />}
        </ResourceBoundary>
    );
}
