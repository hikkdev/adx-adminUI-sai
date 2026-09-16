"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import {
    commsReadApi,
    commsService,
    type CommsTemplate,
    type DeliveriesPage,
    type DeliveriesQuery,
    type DeliveryStatus,
    type NotificationChannel,
} from "@/services/comms";
import { CommsOffline } from "../comms-offline";
import { DeliveryLogsView } from "./delivery-logs-view";

const PAGE_SIZE = 50;

export interface DeliveryFilters {
    channel: NotificationChannel | "ALL";
    status: DeliveryStatus | "ALL";
    templateKey: string | "ALL";
    q: string;
    /** `datetime-local` values; sent as ISO instants. */
    from: string;
    to: string;
}

export const EMPTY_FILTERS: DeliveryFilters = { channel: "ALL", status: "ALL", templateKey: "ALL", q: "", from: "", to: "" };

const toInstant = (local: string): string | undefined => {
    if (!local) return undefined;
    const date = new Date(local);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/** The filters as the list contract takes them — what the page reads and what the export files. */
export function deliveriesQueryOf(filters: DeliveryFilters, search: string): DeliveriesQuery {
    return {
        channel: filters.channel === "ALL" ? undefined : filters.channel,
        status: filters.status === "ALL" ? undefined : [filters.status],
        templateKey: filters.templateKey === "ALL" ? undefined : filters.templateKey,
        q: search || undefined,
        from: toInstant(filters.from),
        to: toInstant(filters.to),
        sort: "newest",
    };
}

interface DeliveryLogsData {
    page: DeliveriesPage;
    /** The templates by key, so the desk knows which rows it may resend. */
    templates: Record<string, CommsTemplate>;
}

/**
 * The delivery log — `GET /comms/deliveries`, every facet the list
 * contract names a `?` the server cuts. The template list rides along so a
 * row's key resolves to whether its template is sensitive: the resend the
 * server would refuse is not offered. The query in force is handed to the
 * view as well, so Export files exactly what the table shows.
 */
export function DeliveryLogsLoader() {
    const live = commsReadApi();
    const [filters, setFilters] = React.useState<DeliveryFilters>(EMPTY_FILTERS);
    const search = useDebounced(filters.q.trim(), 300);
    const query = deliveriesQueryOf(filters, search);

    const resource = useApiResource<DeliveryLogsData>(
        `comms:deliveries:${live}:${filters.channel}:${filters.status}:${filters.templateKey}:${search}:${query.from ?? ""}:${query.to ?? ""}`,
        async () => {
            if (!live) return { page: { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, counts: {}, byChannel: {} }, templates: {} };
            const [page, templatesPage] = await Promise.all([
                commsService.deliveries({ ...query, pageSize: PAGE_SIZE }),
                commsService.templates({ pageSize: 100, sort: "key" }),
            ]);
            const templates: Record<string, CommsTemplate> = {};
            for (const template of templatesPage.items) templates[template.key] = template;
            return { page, templates };
        },
    );

    if (!live) return <CommsOffline what="The delivery log" />;

    return (
        <ResourceBoundary resource={resource}>
            {({ page, templates }) => (
                <DeliveryLogsView
                    page={page}
                    templates={templates}
                    filters={filters}
                    query={query}
                    onFiltersChange={setFilters}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
