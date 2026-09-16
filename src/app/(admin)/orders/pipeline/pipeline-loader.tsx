"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { orderService } from "@/services/orders";
import type { Order } from "@/types";
import { PipelineBoard } from "./pipeline-board";

export function PipelineLoader() {
    const live = isLive("orders");
    const resource = useApiResource<Order[]>(`orders:board:${live}`, () => orderService.list());

    return (
        <ResourceBoundary resource={resource}>
            {(orders) => <PipelineBoard orders={orders} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
