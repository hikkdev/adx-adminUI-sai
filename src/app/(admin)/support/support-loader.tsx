"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { supportService, type TicketQueuePage, type TicketQueueQuery } from "@/services/support";
import { agentService, type AgentSummary } from "@/services/agents";
import { usersService, type UserRow } from "@/services/users";
import type { TicketPriority } from "@/types";
import { SupportConsole } from "./support-console";

/** The three chips DR 10 draws: Open, Mine, All. */
export type QueueChip = "open" | "mine" | "all";

/** The kind chips: issues, feedback, or both. */
export type KindChip = "ALL" | "ISSUE" | "FEEDBACK";

export interface QueueFacets {
    chip: QueueChip;
    priority: TicketPriority | "ALL";
    breached: boolean;
    q: string;
    /** E7-3: the list contract's `kind` facet, drawn as chips. */
    kind: KindChip;
    /** The list contract's `team` facet, drawn as chips over the teams on the page; null is any team. */
    team: string | null;
}

export const DEFAULT_FACETS: QueueFacets = { chip: "open", priority: "ALL", breached: false, q: "", kind: "ALL", team: null };

/** What the chip rows and the two toggles ask the server for. */
export function queueQueryOf(facets: QueueFacets): TicketQueueQuery {
    return {
        ...(facets.q ? { q: facets.q } : {}),
        // Open is anything not closed — WAITING included, because a ticket
        // waiting on the requester is still work somebody owns.
        ...(facets.chip === "open" ? { status: ["OPEN", "WAITING"] } : {}),
        ...(facets.chip === "mine" ? { mine: true } : {}),
        ...(facets.priority === "ALL" ? {} : { priority: facets.priority }),
        ...(facets.breached ? { breached: true } : {}),
        ...(facets.kind === "ALL" ? {} : { kind: facets.kind }),
        ...(facets.team ? { team: facets.team } : {}),
        sort: "OLDEST",
        pageSize: 100,
    };
}

/**
 * Loads the queue under the facets in force, and beside it the two rosters
 * the rail's pickers need: the field agents (`GET /agents`) and the console's
 * own people (`GET /users?role=ADMIN`). Every facet sits in the resource key, so a change refetches
 * rather than filtering the one page the console happens to hold: `counts`
 * comes back computed without the status facet, which is the only way the
 * chips can say how many each would show.
 */
export function SupportLoader() {
    const live = isLive("support");
    const [facets, setFacets] = React.useState<QueueFacets>(DEFAULT_FACETS);
    const q = useDebounced(facets.q.trim(), 300);
    const effective = { ...facets, q };
    const key = `support:queue:${live}:${effective.chip}:${effective.priority}:${effective.breached}:${effective.kind}:${effective.team ?? ""}:${q}`;

    const resource = useApiResource<TicketQueuePage>(key, () => supportService.queue(queueQueryOf(effective)));
    const agents = useApiResource<AgentSummary[]>(`support:agents:${live}`, () =>
        live ? agentService.list() : Promise.resolve([])
    );
    // E6: `GET /users?role=ADMIN` — the server's own role facet, not a filter over the whole roster.
    const admins = useApiResource<UserRow[]>(`support:admins:${live}`, async () =>
        live ? usersService.list({ closed: false, role: "ADMIN" }) : []
    );

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="Support reads the API"
                description="There are no ticket fixtures — a ticket is somebody waiting on an answer, with a clock running. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to work the desk."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <SupportConsole
                    page={page}
                    facets={facets}
                    onFacetsChange={setFacets}
                    agents={agents.data ?? []}
                    admins={admins.data ?? []}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
