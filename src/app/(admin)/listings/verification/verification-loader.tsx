"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { useCursorPages } from "@/lib/use-cursor-pages";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { supplyService } from "@/services/supply";
import type { ComplianceCase, VerificationQueueRow } from "@/types";
import { VerificationQueue } from "./verification-queue";

/**
 * The queue rows as one read; the compliance cases as a cursor read that
 * grows behind "Load more" (Q-C item 6). A decision or a sweep reloads
 * both — the cases' follow-on pages are dropped with the first.
 */
export function VerificationLoader() {
    const rows = useApiResource<VerificationQueueRow[]>("supply:verification-queue", () => supplyService.verificationQueue());
    const cases = useCursorPages<ComplianceCase>("supply:compliance-cases", (cursor) => supplyService.complianceCases(cursor));

    const reloadAll = () => {
        rows.reload();
        cases.reload();
    };

    return (
        <ResourceBoundary resource={rows}>
            {(queue) => (
                <ResourceBoundary resource={cases.resource}>
                    {() => (
                        <VerificationQueue
                            rows={queue}
                            cases={cases.rows}
                            casesHaveMore={cases.hasMore}
                            casesLoadingMore={cases.loadingMore}
                            casesMoreError={cases.moreError}
                            onLoadMoreCases={cases.loadMore}
                            onChanged={reloadAll}
                        />
                    )}
                </ResourceBoundary>
            )}
        </ResourceBoundary>
    );
}
