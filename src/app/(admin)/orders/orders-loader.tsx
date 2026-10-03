"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { orderService, type OrderSort, type OrderStatusWire, type OrdersPage } from "@/services/orders";
import { OrdersTable } from "./orders-table";

/**
 * The orders list's data — OM-1, formerly the bookings board's.
 *
 * Every facet — the search, the status chip, the sort and the page — goes
 * to the API and sits in the resource key, so a change refetches rather than
 * filtering the one page the console happens to be holding. `counts` comes
 * back computed over the search *without* the status in force, which is the
 * only way each chip can say how many it would show.
 *
 * A client loader rather than an async server fetch: the API client keeps
 * its token in the browser, so the orders have to be read from there.
 */

/** One server page. The table draws it whole and the pager below it walks the rest. */
export const ORDERS_PAGE_SIZE = 25;

export function OrdersLoader() {
    const live = isLive("orders");
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim());
    const [status, setStatus] = React.useState<OrderStatusWire | "ALL">("ALL");
    const [sort, setSort] = React.useState<OrderSort>("NEWEST");
    const [page, setPage] = React.useState(1);

    const resource = useApiResource<OrdersPage>(`orders:list:${settledQ}:${status}:${sort}:${page}:${live}`, () =>
        orderService.page({
            ...(settledQ ? { q: settledQ } : {}),
            ...(status === "ALL" ? {} : { status: [status] }),
            sort,
            page,
            pageSize: ORDERS_PAGE_SIZE,
        }),
    );

    /* A new search, chip or sort starts from the first page: page 4 of a
       narrower result is usually empty, and "no orders" would be a lie. */
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
                <OrdersTable
                    page={data}
                    q={q}
                    onQChange={changeQ}
                    status={status}
                    onStatusChange={changeStatus}
                    sort={sort}
                    onSortChange={changeSort}
                    pageNumber={page}
                    onPageChange={setPage}
                    pageSize={ORDERS_PAGE_SIZE}
                    live={live}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
