"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { orderScreeningService, type ReviewFilter, type ReviewPage, type ReviewSort } from "@/services/order-screening";
import { settingsReadApi, settingsService } from "@/services/settings";
import { FraudReviewTable, type ScreeningMode } from "./fraud-review-table";

/** One server page; the pager walks the rest. Also the bulk route's batch, well inside its hundred. */
export const REVIEW_PAGE_SIZE = 25;

/**
 * The review queue's data. Every facet — the status, the search, the sort
 * and the page — goes to the API and sits in the key, as on the list. The
 * settings are read beside it, only for the watch-mode notice: a reader
 * who may not see the settings simply gets no notice.
 */
export function FraudReviewLoader() {
    const live = isLive("orders");
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim());
    const [status, setStatus] = React.useState<ReviewFilter>("FLAGGED");
    const [sort, setSort] = React.useState<ReviewSort>("score");
    const [page, setPage] = React.useState(1);

    const resource = useApiResource<ReviewPage>(`orders:fraud-review:${settledQ}:${status}:${sort}:${page}:${live}`, () =>
        orderScreeningService.list({ status, sort, page, pageSize: REVIEW_PAGE_SIZE, ...(settledQ ? { q: settledQ } : {}) }),
    );

    const settingsLive = settingsReadApi();
    const settings = useApiResource<ScreeningMode>(`orders:fraud-review:mode:${settingsLive}`, async () => {
        if (!settingsLive) return null;
        try {
            const screening = (await settingsService.get()).fraud?.orderScreening;
            return screening ? { enabled: screening.enabled, autoHold: screening.autoHold } : null;
        } catch {
            return null;
        }
    });

    /* A new search, status or sort starts from the first page. */
    const reset = <T,>(set: (value: T) => void) => (value: T) => {
        set(value);
        setPage(1);
    };

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <FraudReviewTable
                    page={data}
                    q={q}
                    onQChange={reset(setQ)}
                    status={status}
                    onStatusChange={reset(setStatus)}
                    sort={sort}
                    onSortChange={reset(setSort)}
                    pageNumber={page}
                    onPageChange={setPage}
                    pageSize={REVIEW_PAGE_SIZE}
                    mode={settings.data ?? null}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
