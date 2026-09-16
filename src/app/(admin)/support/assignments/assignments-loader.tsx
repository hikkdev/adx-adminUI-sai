"use client";

import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { supportService, type AgentSummary, type OpsTicket } from "@/services/support";
import { AssignmentsView } from "./assignments-view";

/**
 * Its own screen rather than a tab on the support console: the assignment
 * is the authorisation decision, and it reads the same live queue the
 * console does — oldest first, one page of a hundred.
 */
export function AssignmentsLoader() {
    const resource = useApiResource<{ tickets: OpsTicket[]; agents: AgentSummary[] }>(
        "support:assignments",
        async () => {
            const [page, agents] = await Promise.all([
                supportService.queue({ pageSize: 100 }),
                supportService.agents(),
            ]);
            return { tickets: page.items, agents };
        }
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Request assignments"
                subtitle="Who is handling each support request — and, because of that, who a publisher can let into their account."
            />
            <ResourceBoundary resource={resource}>
                {(data) => <AssignmentsView {...data} onChanged={resource.reload} />}
            </ResourceBoundary>
        </div>
    );
}
