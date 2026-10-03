"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { usePartyRosterFilters } from "@/components/adx/party-roster-filter-bar";
import { usePartyRoster } from "@/components/adx/party-roster-table";
import { isLive } from "@/lib/api-config";
import { DEFAULT_ACCOUNT_STATUS } from "@/services/account-state";
import { supplyService, type RosterPublisher } from "@/services/supply";
import { PublishersTable } from "./publishers-table";
import { PublishersOffline } from "./publishers-offline";

/**
 * The publisher roster's data.
 *
 * This screen was the sharpest example of the crossing `liveDomains` warns
 * about: the list drew `pub_*` fixtures while `/publishers/[id]` next door has
 * resolved from the API since supply went live, so in live mode every row
 * click 404'd. The fixtures are gone rather than kept as a fallback.
 *
 * 29 Sep 2026 (the party rosters, made uniform): the list contract,
 * `GET /publishers?page=`, cut on the server by the five filters every
 * party desk takes, a hundred rows a read and "Load more" past them. The
 * filters live here, outside the boundary, so a refetch never drops them.
 */
export function PublishersLoader() {
    const live = isLive("supply");
    /* 2 Oct 2026: the Status select starts on Active — the working accounts. */
    const filters = usePartyRosterFilters({ status: DEFAULT_ACCOUNT_STATUS });
    const roster = usePartyRoster<RosterPublisher>(`publishers:roster:${live}`, filters, (query, cursor) =>
        live ? supplyService.rosterPage(query, cursor) : Promise.resolve({ rows: [], nextCursor: null, total: 0 }),
    );

    if (!live) return <PublishersOffline />;

    return (
        <ResourceBoundary resource={roster.resource}>
            {() => <PublishersTable view={roster.view} filters={filters} onChanged={roster.reload} />}
        </ResourceBoundary>
    );
}
