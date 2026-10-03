"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { moderationReadsApi, moderationService, type CreativeReviewRow } from "@/services/moderation";
import { ModerationOffline } from "../moderation-offline";
import { AwaitingView, type WaitingFilter } from "./awaiting-view";

interface WaitingRead {
    rows: CreativeReviewRow[];
    readAt: Date;
}

/** A page of a hundred: designs with the advertiser are few, and every one should be visible. */
const PAGE_SIZE = 100;

/**
 * CR-1: the review queue under one status — AWAITING_ADVERTISER — oldest
 * delivery first, which is the order to chase in.
 */
export function AwaitingLoader() {
    const live = moderationReadsApi();
    const [filter, setFilter] = React.useState<WaitingFilter>("ALL");

    const resource = useApiResource<WaitingRead>(`creatives:awaiting:${live}`, async () => ({
        rows: live ? (await moderationService.queue({ status: ["AWAITING_ADVERTISER"], sort: "OLDEST", pageSize: PAGE_SIZE })).items : [],
        readAt: new Date(),
    }));

    if (!live) return <ModerationOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {({ rows, readAt }) => <AwaitingView rows={rows} readAt={readAt} filter={filter} onFilterChange={setFilter} />}
        </ResourceBoundary>
    );
}
