"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { usePartyRosterFilters } from "@/components/adx/party-roster-filter-bar";
import { usePartyRoster } from "@/components/adx/party-roster-table";
import { isLive } from "@/lib/api-config";
import { DEFAULT_ACCOUNT_STATUS } from "@/services/account-state";
import { advertiserService } from "@/services/advertisers";
import type { Advertiser } from "@/types";
import { AdvertisersTable } from "./advertisers-table";

/**
 * The advertiser roster's data — 29 Sep 2026 (the party rosters, made
 * uniform): `GET /advertisers` cut on the server by the five filters every
 * party desk takes, two hundred rows a read and "Load more" past them. The
 * filters live here, outside the boundary, so a refetch never drops them.
 */
export function AdvertisersLoader() {
    const live = isLive("advertisers");
    /* 2 Oct 2026: the Status select starts on Active — the working accounts. */
    const filters = usePartyRosterFilters({ status: DEFAULT_ACCOUNT_STATUS });
    const roster = usePartyRoster<Advertiser>(`advertisers:roster:${live}`, filters, (query, cursor) => advertiserService.rosterPage(query, cursor));

    return (
        <ResourceBoundary resource={roster.resource}>
            {() => <AdvertisersTable view={roster.view} filters={filters} onChanged={roster.reload} />}
        </ResourceBoundary>
    );
}
