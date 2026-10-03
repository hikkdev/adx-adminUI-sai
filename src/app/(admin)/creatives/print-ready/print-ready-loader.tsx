"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { moderationReadsApi, moderationService, type CreativeReviewRow } from "@/services/moderation";
import { ModerationOffline } from "../moderation-offline";
import { PrintReadyView, type ReadyFilter } from "./print-ready-view";

/** Newest approvals first: the artwork most likely to need a print job opened is the one just approved. */
const PAGE_SIZE = 100;

/**
 * CR-1: the review queue under APPROVED. The row now carries the spot's order
 * and its print job, so readiness is read off the row rather than fetched
 * per line.
 */
export function PrintReadyLoader() {
    const live = moderationReadsApi();
    const [filter, setFilter] = React.useState<ReadyFilter>("ALL");

    const resource = useApiResource<CreativeReviewRow[]>(`creatives:print-ready:${live}`, async () =>
        live ? (await moderationService.queue({ status: ["APPROVED"], sort: "NEWEST", pageSize: PAGE_SIZE })).items : [],
    );

    if (!live) return <ModerationOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(rows) => <PrintReadyView rows={rows} filter={filter} onFilterChange={setFilter} />}
        </ResourceBoundary>
    );
}
