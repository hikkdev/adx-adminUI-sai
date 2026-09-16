"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { supplyService } from "@/services/supply";
import type { PublisherFunnelRow, SupplyFunnel } from "@/types";
import { ActivationFunnel } from "./activation-funnel";

export function ActivationLoader() {
    const resource = useApiResource<{ funnel: SupplyFunnel; rows: PublisherFunnelRow[] }>(
        "supply:activation",
        async () => {
            const [funnel, rows] = await Promise.all([
                supplyService.funnel(),
                supplyService.publishers(),
            ]);
            return { funnel, rows };
        }
    );

    return (
        <ResourceBoundary resource={resource}>
            {({ funnel, rows }) => <ActivationFunnel funnel={funnel} rows={rows} />}
        </ResourceBoundary>
    );
}
