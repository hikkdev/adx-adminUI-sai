"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { isLive } from "@/lib/api-config";
import { orderService, type OrderSort, type OrderStatusWire, type OrdersPage } from "@/services/orders";
import { BookingsTable } from "./bookings-table";

/**
 * The bookings board's data.
 *
 * /bookings is a view over the ORDERS domain — a booking is an advertiser's
 * order on a listing, and there is no other record of one — so it reads
 * `isLive("orders")` rather than a flag of its own. The six seeded `BKG-*`
 * rows it used to draw are gone: their status vocabulary (confirmed, pending
 * payment, active…) belonged to nothing on the backend.
 *
 * Every facet — the search, the status chip, the sort and the page — goes
 * to the API and sits in the resource key, so a change refetches rather than
 * filtering the one page the console happens to be holding. `counts` comes
 * back computed over the search *without* the status in force, which is the
 * only way each chip can say how many it would show.
 */

/** One server page. The table draws it whole and the pager below it walks the rest. */
export const BOOKINGS_PAGE_SIZE = 25;

export function BookingsLoader() {
    const live = isLive("orders");
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim());
    const [status, setStatus] = React.useState<OrderStatusWire | "ALL">("ALL");
    const [sort, setSort] = React.useState<OrderSort>("NEWEST");
    const [page, setPage] = React.useState(1);

    const resource = useApiResource<OrdersPage>(
        `bookings:list:${settledQ}:${status}:${sort}:${page}:${live}`,
        () =>
            orderService.page({
                ...(settledQ ? { q: settledQ } : {}),
                ...(status === "ALL" ? {} : { status: [status] }),
                sort,
                page,
                pageSize: BOOKINGS_PAGE_SIZE,
            }),
    );

    /* A new search, chip or sort starts from the first page: page 4 of a
       narrower result is usually empty, and "no bookings" would be a lie. */
    const changeQ = (next: string) => {
        setQ(next);
        setPage(1);
    };
    const changeStatus = (next: OrderStatusWire | "ALL") => {
        setStatus(next);
        setPage(1);
    };
    const changeSort = (next: OrderSort) => {
        setSort(next);
        setPage(1);
    };

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <BookingsTable
                    page={data}
                    q={q}
                    onQChange={changeQ}
                    status={status}
                    onStatusChange={changeStatus}
                    sort={sort}
                    onSortChange={changeSort}
                    pageNumber={page}
                    onPageChange={setPage}
                    pageSize={BOOKINGS_PAGE_SIZE}
                    live={live}
                />
            )}
        </ResourceBoundary>
    );
}
