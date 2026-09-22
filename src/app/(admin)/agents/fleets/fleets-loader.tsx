"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { fleetService, type FleetPartner } from "@/services/agent-applications";
import { FleetsView } from "./fleets-view";

export function FleetsLoader() {
    const live = isLive("agents");
    const resource = useApiResource<FleetPartner[]>(`agents:fleets:${live}`, () => fleetService.list());
    return <ResourceBoundary resource={resource}>{(partners) => <FleetsView partners={partners} onChanged={resource.reload} />}</ResourceBoundary>;
}
