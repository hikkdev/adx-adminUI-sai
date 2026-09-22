"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { outreachService, type AdapterState, type LeadSide, type LeadTemperature, type OutreachChannel, type TelePage } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { TeleQueueView } from "./tele-queue-view";

export interface TeleFilter {
    side: LeadSide | "ALL";
    temperature: LeadTemperature;
    q: string;
    page: number;
}

export interface TeleData {
    queue: TelePage;
    /** The telephony adapter's state — click-to-call when it is set up, "log a call" when it is not. */
    telephony: AdapterState | null;
}

export function TeleQueueLoader() {
    const live = isLive("leads");
    const [filter, setFilter] = React.useState<TeleFilter>({ side: "ALL", temperature: "COLD", q: "", page: 1 });
    const resource = useApiResource<TeleData>(`leads:tele:${live}:${filter.side}:${filter.temperature}:${filter.q}:${filter.page}`, async () => {
        const [queue, channels] = await Promise.all([
            outreachService.teleQueue({ side: filter.side === "ALL" ? undefined : filter.side, temperature: filter.temperature, q: filter.q || undefined, page: filter.page, pageSize: 25 }),
            outreachService.channels().catch(() => null as Record<OutreachChannel, AdapterState> | null),
        ]);
        return { queue, telephony: channels?.CALL ?? null };
    });
    if (!live) return <LeadsOffline />;
    return <ResourceBoundary resource={resource}>{(data) => <TeleQueueView data={data} filter={filter} onFilter={setFilter} onChanged={resource.reload} />}</ResourceBoundary>;
}
