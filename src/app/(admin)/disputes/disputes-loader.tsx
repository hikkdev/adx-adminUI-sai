"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { disputeService, QUEUE_CHIP_STATUSES, type CaseSummary, type DisputeQueuePage, type DisputeQueueQuery } from "@/services/disputes";
import { DisputesView } from "./disputes-view";

/** The three chips DR 10 draws: Open, Escalated, Resolved. */
export type DisputeChip = "open" | "escalated" | "resolved";

export interface DisputeFacets {
    chip: DisputeChip;
    q: string;
    page: number;
}

export const DEFAULT_DISPUTE_FACETS: DisputeFacets = { chip: "open", q: "", page: 1 };

/** The page size the desk reads; the server clamps larger asks. */
export const DISPUTE_PAGE_SIZE = 50;

/** What the chip row, the search and the pager ask the server for. */
export function disputeQueryOf(facets: DisputeFacets): DisputeQueueQuery {
    return {
        ...(facets.q ? { q: facets.q } : {}),
        status: QUEUE_CHIP_STATUSES[facets.chip],
        page: facets.page,
        pageSize: DISPUTE_PAGE_SIZE,
    };
}

interface Loaded {
    page: DisputeQueuePage;
    summary: CaseSummary;
}

/**
 * Loads the queue under the facets in force — E6's list contract, `q`,
 * the chip's statuses and the page all sent to the server — and the KPI
 * strip beside it. Every facet sits in the resource key, so a change
 * refetches rather than filtering the one page the console happens to
 * hold: `counts` comes back computed without the status facet, which is
 * the only way the chips can say how many each would show.
 */
export function DisputesLoader() {
    const live = isLive("disputes");
    const [facets, setFacets] = React.useState<DisputeFacets>(DEFAULT_DISPUTE_FACETS);
    const q = useDebounced(facets.q.trim(), 300);
    const effective = { ...facets, q };
    const key = `disputes:queue:${live}:${effective.chip}:${effective.page}:${q}`;

    const resource = useApiResource<Loaded>(key, async () => {
        const [page, summary] = await Promise.all([disputeService.queue(disputeQueryOf(effective)), disputeService.summary()]);
        return { page, summary };
    });

    if (!live) {
        return (
            <div className="space-y-5">
                <PageHeader title="Disputes & refunds" />
                <EmptyState
                    icon={PlugZap}
                    title="Disputes read the API"
                    description="There are no dispute fixtures — a case is a real party waiting on a decision, with a clock running. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to work the desk."
                />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <DisputesView page={data.page} summary={data.summary} facets={facets} onFacetsChange={setFacets} onChanged={resource.reload} />
            )}
        </ResourceBoundary>
    );
}
