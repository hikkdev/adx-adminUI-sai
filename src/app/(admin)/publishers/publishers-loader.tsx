"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { supplyService, type RosterPublisher } from "@/services/supply";
import { PublishersTable } from "./publishers-table";
import { PublishersOffline } from "./publishers-offline";

/**
 * The publisher roster's data.
 *
 * This screen was the sharpest example of the crossing `liveDomains` warns
 * about: the list drew `pub_*` fixtures while `/publishers/[id]` next door has
 * resolved from the API since supply went live, so in live mode every row
 * click 404'd. The fixtures are gone rather than kept as a fallback.
 */
export function PublishersLoader() {
    const live = isLive("supply");
    const resource = useApiResource<RosterPublisher[]>(`publishers:roster:${live}`, () =>
        supplyService.roster(),
    );

    if (!live) return <PublishersOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(publishers) => (
                <PublishersTable publishers={publishers} onChanged={resource.reload} />
            )}
        </ResourceBoundary>
    );
}
