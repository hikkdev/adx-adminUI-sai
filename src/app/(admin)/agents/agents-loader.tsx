"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { agentService } from "@/services/agents";
import type { Agent } from "@/types";
import { AgentsTable } from "./agents-table";

/**
 * A client loader rather than an async server component.
 *
 * The console's API client keeps its token in localStorage, so anything reading
 * real data has to do it from the browser. The key carries the live flag so
 * flipping it in a running dev server refetches rather than showing whichever
 * source answered first.
 */
export function AgentsLoader() {
    const live = isLive("agents");
    const resource = useApiResource<Agent[]>(`agents:list:${live}`, () =>
        agentService.directory()
    );

    return (
        <ResourceBoundary resource={resource}>
            {(agents) => <AgentsTable agents={agents} onCreated={resource.reload} />}
        </ResourceBoundary>
    );
}
