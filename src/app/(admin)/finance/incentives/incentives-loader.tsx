"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { agentService, type AgentSummary } from "@/services/agents";
import { useDebounced } from "@/lib/use-debounced";
import {
    financeReadsApi,
    financeService,
    type Incentive,
    type IncentiveEvent,
    type IncentiveStatus,
} from "@/services/finance";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { IncentivesView } from "./incentives-view";

/**
 * The status filter is part of the request — the endpoint takes a comma-joined
 * `status` and caps its answer — so it lives in the resource key and refetches
 * rather than filtering a capped page on the client.
 *
 * The roster is fetched once per page load, keyed without the status, so the
 * queue can name the agent a row belongs to instead of printing the tail of
 * an id. If it fails the queue still works and the column falls back to the
 * AGT- short id.
 */
export function IncentivesLoader() {
    const live = financeReadsApi();
    const [status, setStatus] = React.useState<IncentiveStatus | "ALL">("PENDING_VERIFICATION");
    /* Lot B: the per-order facet is part of the request — `?orderId=` — so it
       lives in the key and refetches, debounced so a pasted id is one call. */
    const [orderId, setOrderId] = React.useState("");
    const orderIdQuery = useDebounced(orderId.trim(), 300);
    /* E6: the event facet is `?event=` on the admin endpoint, so it lives in
       the key and refetches like the status chip does. */
    const [event, setEvent] = React.useState<IncentiveEvent | "ALL">("ALL");

    const resource = useApiResource<Incentive[]>(
        `finance:incentives:${status}:${event}:${orderIdQuery}:${live}`,
        () =>
            live
                ? financeService.incentives({
                      ...(status === "ALL" ? {} : { status: [status] }),
                      ...(event === "ALL" ? {} : { event: [event] }),
                      ...(orderIdQuery ? { orderId: orderIdQuery } : {}),
                  })
                : Promise.resolve([])
    );

    const rosterLive = isLive("agents");
    const roster = useApiResource<AgentSummary[]>(`finance:incentives:agents:${rosterLive}`, () =>
        rosterLive ? agentService.list().catch(() => []) : Promise.resolve([]),
    );

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(incentives) => (
                        <IncentivesView
                            incentives={incentives}
                            agents={roster.data ?? []}
                            status={status}
                            onStatusChange={setStatus}
                            event={event}
                            onEventChange={setEvent}
                            orderId={orderId}
                            onOrderIdChange={setOrderId}
                            onChanged={resource.reload}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="An agent's incentive" />
            )}
        </div>
    );
}
