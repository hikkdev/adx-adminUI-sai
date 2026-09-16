"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { agentKycService, type AgentKycQueue as AgentKycQueueData } from "@/services/agent-kyc";
import { kycStateFilter } from "@/services/kyc-state";
import { useStateChip } from "../_shared/use-state-chip";
import { AgentKycQueue } from "./agent-kyc-queue";

export interface LoadedAgentQueue {
    /** The chip in force, from the server. */
    visible: AgentKycQueueData;
    /** Every agent, for the header's counts. */
    everything: AgentKycQueueData;
}

/**
 * Every agent, from `GET /agent-kyc` — N3-B: the queue lists parties, each
 * in one of six states, and `meta.counts` is the chips; N3-C: the chip in
 * force is sent as `?state=` (or `?escalated=true`) and kept in the URL.
 * The Escalated chip is not a facet this desk answers (agents are not
 * escalated), so it reads the whole queue and the view narrows to none.
 *
 * The token lives in the browser, so this reads on the client like the agents
 * screens do. There is no fixture for agent KYC — the domain was born live —
 * so when the KYC domain is off the queue is simply empty and says so.
 */
export function AgentKycLoader() {
    const live = isLive("kyc");
    const [chip, setChip] = useStateChip();
    const resource = useApiResource<LoadedAgentQueue>(`agent-kyc:${live}:${chip}`, async () => {
        const filter = kycStateFilter(chip);
        const [everything, visible] = await Promise.all([
            agentKycService.queue(),
            filter.state ? agentKycService.queue({ state: filter.state }) : Promise.resolve(null),
        ]);
        return { everything, visible: visible ?? (chip === "ESCALATED" ? { ...everything, rows: [], total: 0 } : everything) };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <AgentKycQueue loaded={data} chip={chip} onChip={setChip} live={live} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
