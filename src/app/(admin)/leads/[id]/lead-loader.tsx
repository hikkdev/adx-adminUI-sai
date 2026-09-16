"use client";

import { notFound } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { agentService, type AgentSummary } from "@/services/agents";
import { leadsService, type LeadDetail } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { LeadDetailView } from "./lead-detail";

interface Loaded {
    lead: LeadDetail | null;
    agents: AgentSummary[];
}

/**
 * One lead, with its activity — `GET /leads/:id`. The roster rides along
 * to name the agent it is assigned to; if that read fails the page still
 * works and the id stands in.
 */
export function LeadLoader({ id }: { id: string }) {
    const live = isLive("leads");
    const resource = useApiResource<Loaded>(`lead:${id}:${live}`, async () => {
        const [lead, agents] = await Promise.all([
            leadsService.get(id).catch((cause: unknown) => {
                if (cause instanceof ApiError && cause.status === 404) return null;
                throw cause;
            }),
            agentService.list().catch(() => [] as AgentSummary[]),
        ]);
        return { lead, agents };
    });

    if (!live) return <LeadsOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {({ lead, agents }) => {
                if (!lead) notFound();
                return <LeadDetailView lead={lead} agents={agents} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
