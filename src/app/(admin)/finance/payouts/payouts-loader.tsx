"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    financeReadsApi,
    financeService,
    type ListPage,
    type PayoutBatch,
    type PayoutSchedule,
    type WithdrawalSummary,
} from "@/services/finance";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { BATCH_CHIPS, PayoutsView, type BatchChip } from "./payouts-view";

interface Loaded {
    batches: ListPage<PayoutBatch>;
    summary: WithdrawalSummary;
    /** Lot G (Q124): the weekly draft's cadence and next run. Null when that read failed; the tile says so. */
    schedule: PayoutSchedule | null;
}

/**
 * The batch list, the withdrawal summary and the schedule, together.
 *
 * Three reads for one screen because the frame's KPI row is not something the
 * batch list can answer alone: "settled this month" and "processing" are the
 * queue's own sums, and "next scheduled run" is the weekly draft's clock
 * (Lot G, Q124). The list contract's `counts` are computed with the status
 * facet removed, so the chips keep their numbers whichever one is selected.
 */
export function PayoutsLoader() {
    const live = financeReadsApi();
    const [chip, setChip] = React.useState<BatchChip>("all");

    const resource = useApiResource<Loaded>(`finance:payouts:${live}:${chip}`, async () => {
        if (!live) {
            return {
                batches: { items: [], total: 0, page: 1, pageSize: 50, counts: {} },
                schedule: null,
                summary: {
                    counts: {
                        REQUESTED: 0,
                        APPROVED: 0,
                        PROCESSING: 0,
                        PAID: 0,
                        REJECTED: 0,
                        FAILED: 0,
                        CANCELLED: 0,
                    },
                    processingOver24h: 0,
                    reservedTotal: "0.00",
                    processingTotal: "0.00",
                    paidThisMonth: "0.00",
                },
            };
        }
        const [batches, summary, schedule] = await Promise.all([
            financeService.payoutBatches({ status: BATCH_CHIPS[chip] ?? undefined, pageSize: 50 }),
            financeService.withdrawalSummary(),
            /* The schedule is a separate module's read; a failure leaves the
               batches standing and the tile says it could not be read. */
            financeService.payoutSchedule().catch(() => null),
        ]);
        return { batches, summary, schedule };
    });

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(data) => (
                        <PayoutsView
                            batches={data.batches}
                            summary={data.summary}
                            schedule={data.schedule}
                            chip={chip}
                            onChipChange={setChip}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A payout batch" />
            )}
        </div>
    );
}
