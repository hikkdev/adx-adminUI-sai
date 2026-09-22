"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { agentService, type AgentSummary } from "@/services/agents";
import { leadsService, type Territory } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { TerritoriesView } from "./territories-view";

export interface TerritoriesData {
    territories: Territory[];
    agents: AgentSummary[];
}

export function TerritoriesLoader() {
    const live = isLive("leads");
    const resource = useApiResource<TerritoriesData>(`leads:territories:desk:${live}`, async () => {
        const [territories, agents] = await Promise.all([leadsService.territories(), agentService.list().catch(() => [])]);
        return { territories, agents };
    });
    if (!live) return <LeadsOffline />;
    return <ResourceBoundary resource={resource}>{(data) => <TerritoriesView data={data} onChanged={resource.reload} />}</ResourceBoundary>;
}
