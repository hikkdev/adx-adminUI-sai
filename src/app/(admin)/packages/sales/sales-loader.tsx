"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { isLive } from "@/lib/api-config";
import { agentService, type AgentSummary } from "@/services/agents";
import { packageService, type PackageShelf, type PackageSort, type SalesPage } from "@/services/packages";
import { SalesView } from "./sales-view";

/** The desk's heading, shared by the live screen and the offline card. */
export const SALES_TITLE = "Package sales";
export const SALES_SUBTITLE = "Every plan an advertiser has bought, and the commission recorded on it";

/** One server page. The table draws it whole and the pager below it walks the rest. */
export const SALES_PAGE_SIZE = 25;

/**
 * The desk's data.
 *
 * Server shell + client loader, because `api-client` keeps its token in
 * localStorage and cannot run on the server.
 *
 * Every facet — the search, the shelf, the sort and the page — goes to the
 * API and sits in the resource key, so a change refetches rather than
 * filtering the one page the console happens to be holding. `counts` comes
 * back computed *without* the shelf in force, which is the only way each
 * chip can say how many it would show.
 *
 * The roster is fetched once, keyed without any facet, to name the agent
 * on a row; if it fails the desk still works and the row falls back to the
 * AGT- id it carries.
 */
export function SalesLoader() {
    const live = isLive("packages");
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim());
    const [shelf, setShelf] = React.useState<PackageShelf | "ALL">("ALL");
    const [sort, setSort] = React.useState<PackageSort>("NEWEST");
    const [page, setPage] = React.useState(1);

    const resource = useApiResource<SalesPage>(
        `packages:sales:${settledQ}:${shelf}:${sort}:${page}:${live}`,
        () =>
            live
                ? packageService.sales({
                      ...(settledQ ? { q: settledQ } : {}),
                      ...(shelf === "ALL" ? {} : { shelf }),
                      sort,
                      page,
                      pageSize: SALES_PAGE_SIZE,
                  })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: SALES_PAGE_SIZE, counts: { ACTIVE: 0, EXPIRING: 0, EXPIRED: 0 } }),
    );

    const roster = useApiResource<AgentSummary[]>(`packages:agents:${live}`, () =>
        live ? agentService.list() : Promise.resolve([]),
    );

    /* A new search, chip or sort starts from the first page. */
    const changeQ = (next: string) => {
        setQ(next);
        setPage(1);
    };
    const changeShelf = (next: PackageShelf | "ALL") => {
        setShelf(next);
        setPage(1);
    };
    const changeSort = (next: PackageSort) => {
        setSort(next);
        setPage(1);
    };

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title={SALES_TITLE} subtitle={SALES_SUBTITLE} />
                <EmptyState
                    icon={PlugZap}
                    title="Package sales read the API"
                    description="This console is running on fixtures, and there are no package fixtures — a sale carries the commission the wallet recorded when it was paid. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the book."
                />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <SalesView
                    page={data}
                    q={q}
                    onQChange={changeQ}
                    shelf={shelf}
                    onShelfChange={changeShelf}
                    sort={sort}
                    onSortChange={changeSort}
                    pageNumber={page}
                    onPageChange={setPage}
                    pageSize={SALES_PAGE_SIZE}
                    agents={roster.data ?? []}
                />
            )}
        </ResourceBoundary>
    );
}
