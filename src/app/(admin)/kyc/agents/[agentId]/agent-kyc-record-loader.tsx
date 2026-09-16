"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { agentService } from "@/services/agents";
import { agentKycService, type AgentKycCase } from "@/services/agent-kyc";
import type { Agent } from "@/types";
import { AgentKycRecord } from "./agent-kyc-record";

interface Loaded {
    agent: Agent | null;
    /** Null before anything has been recorded for this agent. */
    kyc: AgentKycCase | null;
}

/** The agent, and whatever the desk has recorded for them so far. */
export function AgentKycRecordLoader({ agentId }: { agentId: string }) {
    const live = isLive("kyc");
    const resource = useApiResource<Loaded>(`agent-kyc:${agentId}:${live}`, async () => {
        const agent = await agentService.get(agentId);
        if (!agent) return { agent: null, kyc: null };
        return { agent, kyc: await agentKycService.get(agent.id) };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.agent) notFound();
                return <AgentKycRecord agent={data.agent} kyc={data.kyc} live={live} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
