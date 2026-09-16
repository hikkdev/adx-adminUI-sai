"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    financeReadsApi,
    financeService,
    type PayoutBatchDetail,
    type Withdrawal,
} from "@/services/finance";
import { FinanceOffline } from "../../../finance-offline";
import { BatchView } from "./batch-view";

interface Loaded {
    batch: PayoutBatchDetail | null;
    /**
     * Every APPROVED withdrawal — the pool a draft picks its lines from. Read
     * only while the batch is a draft; a batch past that point has its lines
     * and the pool is somebody else's business.
     */
    approved: Withdrawal[];
}

/**
 * One batch with its lines, and — for a draft — the approved queue to pick
 * from. The preflight is fetched by the view itself, because it belongs to a
 * step rather than to the page: asking for it on a draft would check lines
 * that have not been chosen yet.
 */
export function BatchLoader({ id }: { id: string }) {
    const live = financeReadsApi();

    const resource = useApiResource<Loaded>(`finance:payout-batch:${id}:${live}`, async () => {
        if (!live) return { batch: null, approved: [] };
        const batch = await financeService.payoutBatch(id);
        if (!batch) return { batch: null, approved: [] };
        const approved = batch.status === "DRAFT" ? await financeService.withdrawals({ status: ["APPROVED"] }) : [];
        return { batch, approved };
    });

    if (!live) {
        return (
            <div className="space-y-5">
                <FinanceOffline what="A payout batch" />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.batch) notFound();
                return <BatchView batch={data.batch} approved={data.approved} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
