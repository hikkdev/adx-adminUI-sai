"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import {
    moderationReadsApi,
    moderationService,
    queueRail,
    type CreativeReviewRow,
} from "@/services/moderation";
import { ModerationOffline } from "../moderation-offline";
import { CreativeDetail } from "./creative-detail";

interface Loaded {
    creative: CreativeReviewRow | null;
    /** The next six awaiting review after this one — the rail beside the viewer. */
    queue: CreativeReviewRow[];
}

/**
 * One artwork, live: the row from `GET /campaigns/creatives/:id` and the rail
 * from the queue it sits in. The two are one read so the rail cannot show a
 * queue the artwork is not part of.
 */
export function CreativeLoader({ id }: { id: string }) {
    const live = moderationReadsApi();

    const resource = useApiResource<Loaded>(`moderation:creative:${live}:${id}`, async () => {
        if (!live) return { creative: null, queue: [] };
        let creative: CreativeReviewRow | null;
        try {
            creative = await moderationService.get(id);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return { creative: null, queue: [] };
            throw cause;
        }
        // The rail is a courtesy; a failed read leaves it empty rather than
        // failing the page whose whole point is the artwork.
        const page = await moderationService.queue({ status: ["IN_REVIEW"], pageSize: 50 }).catch(() => null);
        return { creative, queue: page ? queueRail(page.items, id) : [] };
    });

    if (!live) return <ModerationOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {({ creative, queue }) =>
                creative ? (
                    <CreativeDetail creative={creative} queue={queue} onChanged={resource.reload} />
                ) : (
                    <EmptyState
                        icon={PlugZap}
                        title="No such creative"
                        description="It may have been deleted with its campaign, or the link may be stale."
                    />
                )
            }
        </ResourceBoundary>
    );
}
