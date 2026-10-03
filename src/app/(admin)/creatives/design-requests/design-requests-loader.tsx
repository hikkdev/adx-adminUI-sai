"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { moderationReadsApi, moderationService, type DesignRequestRow } from "@/services/moderation";
import { ModerationOffline } from "../moderation-offline";
import { DesignRequestsView, type RequestFilter } from "./design-requests-view";

/** The rows and the clock they were read at, so every due label agrees. */
interface RequestsRead {
    rows: DesignRequestRow[];
    readAt: Date;
}

/**
 * CR-1: `GET /campaigns/design-requests`, one read. It is every request
 * there is rather than a page — the set is small by nature, one row per
 * campaign that asked and has nothing standing — so the chips cut the rows
 * in hand rather than refetching.
 */
export function DesignRequestsLoader() {
    const live = moderationReadsApi();
    const [filter, setFilter] = React.useState<RequestFilter>("ALL");

    const resource = useApiResource<RequestsRead>(`creatives:design-requests:${live}`, async () => ({
        rows: live ? await moderationService.designRequests() : [],
        readAt: new Date(),
    }));

    if (!live) return <ModerationOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {({ rows, readAt }) => (
                <DesignRequestsView rows={rows} readAt={readAt} filter={filter} onFilterChange={setFilter} onChanged={resource.reload} />
            )}
        </ResourceBoundary>
    );
}
