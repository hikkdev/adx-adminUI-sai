"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { agentService, type AgentSummary } from "@/services/agents";
import { leadsService, type LeadStatus, type LeadsPage } from "@/services/leads";
import { LeadsTable } from "./leads-table";
import { LeadsOffline } from "./leads-offline";

/**
 * The leads desk's data.
 *
 * Server shell + client loader, because `api-client` keeps its token in
 * localStorage and cannot run on the server.
 *
 * Both facets — the status and the open-pool toggle — go to the API and both
 * sit in the resource key, so a change refetches rather than filtering the one
 * page the console happens to be holding. That matters more here than on most
 * screens: `counts` comes back computed over the whole filter *without* the
 * status in force, which is the only way each option in the Select can say how
 * many leads it would show, and `total` under `unassigned=true` is the real
 * size of the open pool rather than however much of it fitted on this page.
 *
 * The roster is fetched separately and keyed without either facet, so it is
 * read once and not again on every filter change. It exists only to name the
 * agent a lead is assigned to and to fill the Assign dialog; if it fails the
 * desk still works, and the Assigned column falls back to the agent id the
 * lead carries.
 */

/** One page. Generous, and the header says so when there is more behind it. */
const PAGE_SIZE = 100;

export function LeadsLoader() {
    const live = isLive("leads");
    const [status, setStatus] = React.useState<LeadStatus | "ALL">("ALL");
    const [unassignedOnly, setUnassignedOnly] = React.useState(false);

    const resource = useApiResource<LeadsPage>(
        `leads:list:${status}:${unassignedOnly}:${live}`,
        () =>
            leadsService.list({
                ...(status === "ALL" ? {} : { status: [status] }),
                ...(unassignedOnly ? { unassigned: true } : {}),
                sort: "NEWEST",
                pageSize: PAGE_SIZE,
            }),
    );

    const roster = useApiResource<AgentSummary[]>(`leads:agents:${live}`, () => agentService.list());

    if (!live) return <LeadsOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <LeadsTable
                    page={page}
                    status={status}
                    onStatusChange={setStatus}
                    unassignedOnly={unassignedOnly}
                    onUnassignedOnlyChange={setUnassignedOnly}
                    agents={roster.data ?? []}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
