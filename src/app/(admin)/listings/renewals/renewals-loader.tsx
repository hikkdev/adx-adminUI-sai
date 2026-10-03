"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { supplyService } from "@/services/supply";
import { RENEWALS_HORIZON_DAYS } from "@/services/renewals-queue";
import type { RightsQueueRow } from "@/types";
import { RenewalsQueue } from "./renewals-queue";

/** Sixty days of terms, one read; a sweep run from the page reloads it. */
export function RenewalsLoader() {
    const rows = useApiResource<RightsQueueRow[]>("supply:rights-queue", () => supplyService.rightsQueue(RENEWALS_HORIZON_DAYS));
    return <ResourceBoundary resource={rows}>{(queue) => <RenewalsQueue rows={queue} onChanged={rows.reload} />}</ResourceBoundary>;
}
