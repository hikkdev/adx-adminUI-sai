"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { orderService } from "@/services/orders";
import type { Order } from "@/types";
import { OrderDetail } from "./order-detail";

export function OrderLoader({ id }: { id: string }) {
    const live = isLive("orders");
    const resource = useApiResource<Order | null>(`order:${id}:${live}`, () =>
        orderService.get(id)
    );

    return (
        <ResourceBoundary resource={resource}>
            {(order) => {
                if (!order) notFound();
                return <OrderDetail order={order} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
