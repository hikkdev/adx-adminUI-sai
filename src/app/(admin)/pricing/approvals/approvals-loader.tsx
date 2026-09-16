"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useDebounced } from "@/lib/use-debounced";
import { priceModelService, type PriceModelSettings } from "@/services/price-model";
import { rateCardService, type ApprovalsPage, type PriceApprovalSource, type PriceApprovalStatus } from "@/services/rate-cards";
import { EngineShell } from "../engine-shell";
import { ApprovalsView } from "./approvals-view";

const PAGE_SIZE = 25;

/** Every facet the server cuts on (E10-2), plus the page. */
export interface ApprovalFilters {
    status: PriceApprovalStatus | "ALL";
    source: PriceApprovalSource | "ALL";
    /** A listing id, matched exactly by the server. */
    listingId: string;
    page: number;
}

export const DEFAULT_FILTERS: ApprovalFilters = { status: "PENDING", source: "ALL", listingId: "", page: 1 };

interface Loaded {
    approvals: ApprovalsPage;
    settings: PriceModelSettings | null;
}

/**
 * The queue, and the guardrails each request is checked against.
 *
 * Status, source and the listing are the list contract's own cuts, so
 * changing one refetches with the page reset rather than hiding rows a
 * capped page never held; `counts` comes back with the status facet
 * removed, so each chip's number is what choosing it would show.
 */
export function ApprovalsLoader() {
    const live = isLive("pricingEngine");
    const [filters, setFilters] = React.useState<ApprovalFilters>(DEFAULT_FILTERS);
    const listingId = useDebounced(filters.listingId.trim(), 300);

    const resource = useApiResource<Loaded>(`price-approvals:${live}:${filters.status}:${filters.source}:${listingId}:${filters.page}`, async () => {
        if (!live) return { approvals: { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, counts: {} }, settings: null };
        const [approvals, settings] = await Promise.all([
            rateCardService.approvals({
                status: filters.status === "ALL" ? undefined : filters.status,
                source: filters.source === "ALL" ? undefined : filters.source,
                listingId: listingId || undefined,
                page: filters.page,
                pageSize: PAGE_SIZE,
            }),
            priceModelService.settings(),
        ]);
        return { approvals, settings };
    });

    /** A facet change goes back to page one; only the pager keeps the page. */
    const change = (next: Partial<ApprovalFilters>) => setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }));

    return (
        <EngineShell
            title="Price approvals"
            subtitle="Listings priced under the rate-card floor, waiting for a person to say yes or no."
        >
            <ResourceBoundary resource={resource}>
                {(data) =>
                    data.settings ? (
                        <ApprovalsView
                            page={data.approvals}
                            settings={data.settings}
                            filters={filters}
                            onFiltersChange={change}
                            onChanged={resource.reload}
                        />
                    ) : null
                }
            </ResourceBoundary>
        </EngineShell>
    );
}
