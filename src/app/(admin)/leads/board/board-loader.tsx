"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { agentService, type AgentSummary } from "@/services/agents";
import { leadsService, type LeadSide, type LeadsPage } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { BoardView } from "./board-view";

/**
 * One read per side, hottest first. The list contract caps a page at
 * `MAX_LIST_PAGE_SIZE` (100) and the server refuses anything larger with a
 * 400 — which is what this board asked for until 22 Sep, and why it drew
 * "Invalid request" instead of columns. The cap is the whole board: the
 * per-stage counts come off `stageCounts`, computed over the whole filter
 * server-side, so the column headers stay true even when there are more
 * leads than the hundred cards drawn, and the header says so.
 */
const PAGE_SIZE = 100;

export function BoardLoader() {
    const live = isLive("leads");
    const [side, setSide] = React.useState<LeadSide>("PUBLISHER");
    const resource = useApiResource<LeadsPage>(`leads:board:${side}:${live}`, () => leadsService.list({ side, sort: "HOTTEST", pageSize: PAGE_SIZE }));
    const roster = useApiResource<AgentSummary[]>(`leads:agents:${live}`, () => agentService.list());

    if (!live) return <LeadsOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(page) => <BoardView page={page} side={side} onSideChange={setSide} agents={roster.data ?? []} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
