"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import {
    moderationReadsApi,
    moderationService,
    type CreativePath,
    type CreativeStatus,
    type ReviewQueuePage,
} from "@/services/moderation";
import { ModerationOffline } from "./moderation-offline";
import { ModerationView, type QueueFacet } from "./moderation-view";

/** The queue is worked from the back; a page of fifty is a morning's work. */
const PAGE_SIZE = 50;

/**
 * The review queue, live.
 *
 * Every facet is a `?` the server cuts and counts — the status chips carry
 * the histogram the list contract sends, and the frame's own four facets
 * (Flagged, Static, Video, Resubmitted) are `flagged`, `kind` and
 * `resubmitted` on the same route. Changing one refetches rather than hiding
 * rows a capped page never held.
 */
export function ModerationLoader() {
    const live = moderationReadsApi();
    const [status, setStatus] = React.useState<CreativeStatus | "ALL">("IN_REVIEW");
    const [facet, setFacet] = React.useState<QueueFacet>("all");
    const [q, setQ] = React.useState("");
    const search = useDebounced(q.trim(), 300);

    const kind: CreativePath | undefined =
        facet === "static" ? "STATIC_IMAGES" : facet === "video" ? "VIDEO_OR_MOTION" : undefined;

    const resource = useApiResource<ReviewQueuePage>(
        `moderation:queue:${live}:${status}:${facet}:${search}`,
        () =>
            live
                ? moderationService.queue({
                      status: status === "ALL" ? undefined : [status],
                      kind,
                      flagged: facet === "flagged" ? true : undefined,
                      resubmitted: facet === "resubmitted" ? true : undefined,
                      q: search || undefined,
                      pageSize: PAGE_SIZE,
                  })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE, counts: {} }),
    );

    if (!live) return <ModerationOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <ModerationView
                    page={page}
                    status={status}
                    onStatusChange={setStatus}
                    facet={facet}
                    onFacetChange={setFacet}
                    q={q}
                    onSearch={setQ}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
