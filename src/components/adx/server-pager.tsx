"use client";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

/**
 * The server's pager under a table whose page the server cut — "26-50 of
 * 52" and Previous / Next. The orders list and its review queue drew it
 * first; the campaigns list, the launch queue and the landing pages share
 * it, so a server-paged table reads the same everywhere. Pair it with
 * `DataTable`'s `showPagination={false}`.
 */
export function ServerPager({
    total,
    pageNumber,
    pageSize,
    onPageChange,
    note,
}: {
    total: number;
    pageNumber: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    /** After the count — what the rows are when they are not the API's. */
    note?: string;
}) {
    const from = total === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
    const to = Math.min(pageNumber * pageSize, total);
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
                {from}-{to} of {formatNumber(total)}
                {note}
            </span>
            <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber - 1)} disabled={pageNumber <= 1}>
                    Previous
                </Button>
                <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">{pageNumber}</span>
                <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onPageChange(pageNumber + 1)} disabled={pageNumber >= lastPage}>
                    Next
                </Button>
            </div>
        </div>
    );
}
