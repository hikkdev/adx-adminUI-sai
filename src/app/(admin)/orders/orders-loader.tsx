"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { orderService, type OrderStatusWire, type OrdersPage } from "@/services/orders";
import { OrdersTable } from "./orders-table";

/**
 * A client loader rather than an async server component.
 *
 * The console's API client keeps its token in localStorage, so anything reading
 * real data has to do it from the browser. The key carries the live flag so
 * flipping it in a running dev server refetches rather than showing whichever
 * source answered first.
 */
export function OrdersLoader() {
    const live = isLive("orders");
    const [status, setStatus] = React.useState<OrderStatusWire | "ALL">("ALL");

    // The status is in the key, so choosing a chip refetches rather than
    // filtering a page the server already cut.
    const resource = useApiResource<OrdersPage>(`orders:list:${status}:${live}`, () =>
        orderService.page(status === "ALL" ? {} : { status: [status] }),
    );

    return (
        <ResourceBoundary resource={resource}>
            {(page) => <OrdersTable page={page} status={status} onStatusChange={setStatus} />}
        </ResourceBoundary>
    );
}
