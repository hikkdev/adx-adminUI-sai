"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { usePartyRosterFilters } from "@/components/adx/party-roster-filter-bar";
import { usePartyRoster } from "@/components/adx/party-roster-table";
import { isLive } from "@/lib/api-config";
import { DEFAULT_ACCOUNT_STATUS } from "@/services/account-state";
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
 *
 * 29 Sep 2026 (the party rosters, made uniform): `GET /agents` cut on the
 * server by the five filters every party desk takes, two hundred rows a
 * read and "Load more" past them — it used to read the route's default
 * fifty and stop there.
 */
export function AgentsLoader() {
    const live = isLive("agents");
    /* 2 Oct 2026: the Status select starts on Active — the working accounts. */
    const filters = usePartyRosterFilters({ status: DEFAULT_ACCOUNT_STATUS });
    const roster = usePartyRoster<Agent>(`agents:roster:${live}`, filters, (query, cursor) => agentService.rosterPage(query, cursor));

    return (
        <ResourceBoundary resource={roster.resource}>
            {() => <AgentsTable view={roster.view} filters={filters} onCreated={roster.reload} />}
        </ResourceBoundary>
    );
}
