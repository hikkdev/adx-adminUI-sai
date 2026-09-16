"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { liveChatService, type CannedReply } from "@/services/live-chat";
import { CannedView } from "./canned-view";

/**
 * The desk's canned replies — `/support/canned`, Lot I.
 *
 * Read with `includeInactive=true`, because this is the screen where a retired
 * reply is brought back: a manager that can only see the live ones cannot undo
 * a retirement, and a reply retired by mistake would have to be retyped.
 */
export function CannedLoader() {
    const live = isLive("support");
    const replies = useApiResource<CannedReply[]>(`support:canned:${live}`, () =>
        live ? liveChatService.canned({ includeInactive: true }) : Promise.resolve([]),
    );

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="Canned replies read the API"
                description="These are rows the desk writes and the live composer inserts. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to manage them."
            />
        );
    }

    return (
        <ResourceBoundary resource={replies}>
            {(items) => <CannedView replies={items} onChanged={replies.reload} />}
        </ResourceBoundary>
    );
}
