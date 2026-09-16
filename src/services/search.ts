import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { shapeAdvertiser } from "@/services/advertisers";
import { agentLabel, agentService, type AgentSummary } from "@/services/agents";
import { campaignService, campaignStatusLabel, type CampaignRow } from "@/services/campaigns";
import { listingStatusLabel, listingsService, type AdminListing } from "@/services/listings";
import { orderService } from "@/services/orders";
import { supplyService, type RosterPublisher } from "@/services/supply";
import type { Advertiser, Order } from "@/types";

/**
 * The command palette's record search — DR 10 `5102:21873`.
 *
 * Two or more characters fan out to the six list routes the console already
 * reads, five rows a group, each row opening the record. The fan-out is
 * `allSettled`: a source that fails or times out drops its group rather than
 * emptying the palette, because "no publishers matched" and "the publishers
 * route is down" are different things and the other five groups are still
 * good.
 *
 * Every source searches on the server, the publishers included since E10-1
 * (`GET /publishers?q=&page=1&pageSize=5`); the once-a-minute roster cache
 * and the client-side cut it needed are gone with it.
 *
 * Every hit carries an id the API issued, so following one through works.
 * With the API off the palette offers navigation only.
 */

export type SearchDomain = "publishers" | "advertisers" | "agents" | "orders" | "listings" | "campaigns";

/** Rows per group — the frame's list is short on purpose; the full table is one click away. */
export const SEARCH_LIMIT = 5;

/** Below this the palette stays on navigation: one character matches everything. */
export const MIN_QUERY_LENGTH = 2;

export interface SearchHit {
    id: string;
    title: string;
    subtitle: string | null;
    href: string;
}

export interface SearchGroup {
    domain: SearchDomain;
    heading: string;
    hits: SearchHit[];
}

export const SEARCH_HEADING: Record<SearchDomain, string> = {
    publishers: "Publishers",
    advertisers: "Advertisers",
    agents: "Agents",
    orders: "Orders",
    listings: "Listings",
    campaigns: "Campaigns",
};

/* ------------------------------------------------------------------ */
/* Shaping                                                             */
/* ------------------------------------------------------------------ */

const join = (parts: (string | null | undefined)[]): string | null => {
    const text = parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
    return text || null;
};

export const publisherHit = (row: RosterPublisher): SearchHit => ({
    id: row.id,
    title: row.name,
    subtitle: join([row.displayId, row.city, row.mobile]),
    href: `/publishers/${row.id}`,
});

export const advertiserHit = (row: Advertiser): SearchHit => ({
    id: row.id,
    title: row.companyName ?? row.name,
    subtitle: join([row.displayId, row.companyName ? row.name : null, row.city]),
    href: `/advertisers/${row.id}`,
});

export const agentHit = (row: AgentSummary): SearchHit => ({
    id: row.id,
    title: agentLabel(row),
    subtitle: join([row.displayId, row.user?.mobile]),
    href: `/agents/${row.id}`,
});

export const orderHit = (row: Order): SearchHit => ({
    id: row.id,
    title: row.campaignName ?? row.listing,
    subtitle: join([row.campaignName ? row.listing : null, row.city, row.status.replace(/_/g, " ").toLowerCase()]),
    href: `/orders/${row.id}`,
});

export const listingHit = (row: AdminListing): SearchHit => ({
    id: row.id,
    title: row.title,
    subtitle: join([row.displayId, row.city, listingStatusLabel(row.status)]),
    href: `/listings/${row.id}`,
});

export const campaignHit = (row: CampaignRow): SearchHit => ({
    id: row.id,
    title: row.name,
    subtitle: join([row.reference, row.brandName, campaignStatusLabel(row.status)]),
    href: `/campaigns/${row.id}`,
});

/** A group is a heading over at most `SEARCH_LIMIT` hits; an empty one is not drawn. */
export function groupOf(domain: SearchDomain, hits: SearchHit[]): SearchGroup {
    return { domain, heading: SEARCH_HEADING[domain], hits: hits.slice(0, SEARCH_LIMIT) };
}

/**
 * Folds the fan-out into the groups the palette draws, in the domains' order:
 * a settled source with hits is a group, an empty one is skipped, and a
 * rejected one is dropped — the other groups still stand.
 */
export function foldSearch(results: PromiseSettledResult<SearchGroup>[]): SearchGroup[] {
    const groups: SearchGroup[] = [];
    for (const result of results) {
        if (result.status !== "fulfilled") continue;
        if (result.value.hits.length === 0) continue;
        groups.push(result.value);
    }
    return groups;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/** The advertiser roster's page shape — `{ rows }` — with `q` beside the cursor page. */
type AdvertiserPage = { rows: Parameters<typeof shapeAdvertiser>[0][] };

export const searchService = {
    /** Whether the palette searches records at all. With the API off there is nothing to search. */
    readsApi: (): boolean => apiConfig.live,

    /** The fan-out. Empty below `MIN_QUERY_LENGTH`; otherwise the groups with hits, in order. */
    records: async (query: string): Promise<SearchGroup[]> => {
        const q = query.trim();
        if (q.length < MIN_QUERY_LENGTH || !apiConfig.live) return [];
        const encoded = encodeURIComponent(q);
        const sources: Promise<SearchGroup>[] = [
            supplyService.search(q, SEARCH_LIMIT).then((rows) => groupOf("publishers", rows.map(publisherHit))),
            http
                .get<AdvertiserPage>(`/advertisers?q=${encoded}&limit=${SEARCH_LIMIT}`)
                .then((page) => groupOf("advertisers", (page.rows ?? []).map((row) => advertiserHit(shapeAdvertiser(row))))),
            agentService.search(q, SEARCH_LIMIT).then((rows) => groupOf("agents", (rows ?? []).map(agentHit))),
            orderService
                .page({ q, sort: "NEWEST", pageSize: SEARCH_LIMIT })
                .then((page) => groupOf("orders", page.items.map(orderHit))),
            listingsService
                .list({ q, sort: "NEWEST", pageSize: SEARCH_LIMIT })
                .then((page) => groupOf("listings", page.items.map(listingHit))),
            campaignService
                .list({ q, sort: "NEWEST", pageSize: SEARCH_LIMIT })
                .then((page) => groupOf("campaigns", page.items.map(campaignHit))),
        ];
        return foldSearch(await Promise.allSettled(sources));
    },
};
