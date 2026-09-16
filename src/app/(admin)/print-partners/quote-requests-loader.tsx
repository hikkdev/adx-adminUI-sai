"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useFeature } from "@/lib/use-feature";
import { printPartnerService, type PrintQuoteRequestPage } from "@/services/print-partners";
import { PrintPartnersOffline } from "./print-partners-offline";
import { QuoteRequestsView, type RequestFilter } from "./quote-requests-view";

/** The rows and the clock they were read at — what every countdown on the tab runs from. */
export interface QuoteRequestsRead {
    page: PrintQuoteRequestPage;
    readAt: Date;
}

/**
 * The quote requests across orders — the roster's second tab.
 *
 * G13-B: one read, `GET /print-quote-requests` on the list contract under
 * the chip in force (OPEN first, nearest deadline first, one page of a
 * hundred); the `counts` are computed with the status facet removed, so
 * the chips keep their numbers whichever one is selected. The per-order
 * fan-out over `GET /orders?status=…` that stood in until the route landed
 * is gone.
 */
export function QuoteRequestsLoader() {
    const live = isLive("printPartners");
    const quotes = useFeature("partners.quotes");
    const [filter, setFilter] = React.useState<RequestFilter>("OPEN");

    const resource = useApiResource<QuoteRequestsRead>(`print-quote-requests:${filter}:${live}:${quotes.enabled}`, async () => {
        const empty: PrintQuoteRequestPage = { items: [], total: 0, page: 1, pageSize: 100, counts: {} };
        if (!live || quotes.enabled === false) return { page: empty, readAt: new Date() };
        const page = await printPartnerService.quoteRequests({ status: filter === "ALL" ? undefined : [filter], pageSize: 100 });
        return { page, readAt: new Date() };
    });

    if (!live) return <PrintPartnersOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {({ page, readAt }) => (
                <QuoteRequestsView
                    page={page}
                    readAt={readAt}
                    filter={filter}
                    onFilterChange={setFilter}
                    featureOff={quotes.enabled === false}
                    onRefresh={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
