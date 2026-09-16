"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    financeReadsApi,
    financeService,
    type PayoutPartyKind,
    type RailStatus,
    type Withdrawal,
    type WithdrawalSummary,
} from "@/services/finance";
import { FinanceNav } from "./finance-nav";
import { FinanceOffline } from "./finance-offline";
import { WithdrawalsView, type QueueFilters } from "./withdrawals-view";

interface Loaded {
    withdrawals: Withdrawal[];
    rails: RailStatus[];
    summary: WithdrawalSummary;
    /** Batch id → reference, for the column a row's `batchId` needs to read as. */
    batchReferences: Record<string, string>;
}

const EMPTY_SUMMARY: WithdrawalSummary = {
    counts: { REQUESTED: 0, APPROVED: 0, PROCESSING: 0, PAID: 0, REJECTED: 0, FAILED: 0, CANCELLED: 0 },
    processingOver24h: 0,
    reservedTotal: "0.00",
    processingTotal: "0.00",
    paidThisMonth: "0.00",
};

/** The end of a `date` input's day, so a `to` of today includes today. */
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999`).toISOString();
const startOfDay = (date: string) => new Date(`${date}T00:00:00.000`).toISOString();

/**
 * The queue, the rails it can be sent down, the queue's header and the batch
 * references, fetched together.
 *
 * A client loader rather than an async server component, for the reason every
 * wired screen in this console is one: the API client keeps its token in
 * localStorage, so anything reading real data has to read it from the browser.
 *
 * Lot B (Q140) gave the queue four server-side facets — a search over the
 * reference, UTR or party name, the party kind and a requested-at window — so
 * those live here, in the key, and a change refetches. The status chips stay
 * client-side over the loaded rows, as they were. The batch list comes along
 * because a row carries only its `batchId` and the column has to read
 * `BATCH-2026-3`, not a cuid.
 */
export function WithdrawalsLoader() {
    const live = financeReadsApi();
    const [filters, setFilters] = React.useState<QueueFilters>({ q: "", partyKind: "", from: "", to: "" });
    const q = useDebounced(filters.q.trim());

    const key = `finance:withdrawals:${live}:${q}:${filters.partyKind}:${filters.from}:${filters.to}`;
    const resource = useApiResource<Loaded>(key, async () => {
        if (!live) return { withdrawals: [], rails: [], summary: EMPTY_SUMMARY, batchReferences: {} };
        const [withdrawals, rails, summary, batches] = await Promise.all([
            financeService.withdrawals({
                q: q || undefined,
                partyKind: (filters.partyKind || undefined) as PayoutPartyKind | undefined,
                from: filters.from ? startOfDay(filters.from) : undefined,
                to: filters.to ? endOfDay(filters.to) : undefined,
            }),
            financeService.rails(),
            financeService.withdrawalSummary(),
            financeService.payoutBatches({ pageSize: 100 }),
        ]);
        const batchReferences: Record<string, string> = {};
        for (const batch of batches.items) batchReferences[batch.id] = batch.reference;
        return { withdrawals, rails, summary, batchReferences };
    });

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(data) => (
                        <WithdrawalsView
                            withdrawals={data.withdrawals}
                            rails={data.rails}
                            summary={data.summary}
                            batchReferences={data.batchReferences}
                            filters={filters}
                            onFiltersChange={setFilters}
                            onChanged={resource.reload}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A withdrawal queue" />
            )}
        </div>
    );
}
