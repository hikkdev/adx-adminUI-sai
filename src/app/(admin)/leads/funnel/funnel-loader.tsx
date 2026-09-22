"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { leadsService, type FunnelQuery, type LeadFunnel } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { FunnelView } from "./funnel-view";

export function FunnelLoader() {
    const live = isLive("leads");
    const [query, setQuery] = React.useState<FunnelQuery>({});
    const key = JSON.stringify(query);
    const resource = useApiResource<LeadFunnel>(`leads:funnel:${key}:${live}`, () => leadsService.funnel(query));
    if (!live) return <LeadsOffline />;
    return <ResourceBoundary resource={resource}>{(funnel) => <FunnelView funnel={funnel} query={query} onQuery={setQuery} />}</ResourceBoundary>;
}
