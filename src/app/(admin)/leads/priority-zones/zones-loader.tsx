"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { leadsService, type PriorityZone } from "@/services/leads";
import { settingsService, type LeadPriorityPolicy } from "@/services/settings";
import { LeadsOffline } from "../leads-offline";
import { ZonesView } from "./zones-view";

export interface ZonesData {
    zones: PriorityZone[];
    /** The platform's default top-up and monthly cap, for the meter; null on a backend without the section. */
    policy: LeadPriorityPolicy | null;
}

export function ZonesLoader() {
    const live = isLive("leads");
    const resource = useApiResource<ZonesData>(`leads:zones:desk:${live}`, async () => {
        const [zones, settings] = await Promise.all([leadsService.priorityZones(), settingsService.get().catch(() => null)]);
        return { zones, policy: settings?.leads?.priority ?? null };
    });
    if (!live) return <LeadsOffline />;
    return <ResourceBoundary resource={resource}>{(data) => <ZonesView data={data} onChanged={resource.reload} />}</ResourceBoundary>;
}
