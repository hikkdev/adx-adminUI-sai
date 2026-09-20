"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { supplyService } from "@/services/supply";
import type { RightsQueueRow } from "@/types";
import { RenewalsQueue } from "./renewals-queue";

/** Sixty days of terms, one read; a sweep run from the page reloads it. */
export function RenewalsLoader() {
    const rows = useApiResource<RightsQueueRow[]>("supply:rights-queue", () => supplyService.rightsQueue(60));
    return <ResourceBoundary resource={rows}>{(queue) => <RenewalsQueue rows={queue} onChanged={rows.reload} />}</ResourceBoundary>;
}
