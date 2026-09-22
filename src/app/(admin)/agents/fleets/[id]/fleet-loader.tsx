"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { fleetService, type FleetInvite, type FleetPartner } from "@/services/agent-applications";
import { FleetDetail } from "./fleet-detail";

export function FleetLoader({ id }: { id: string }) {
    const live = isLive("agents");
    const resource = useApiResource<{ partner: FleetPartner; invites: FleetInvite[] }>(`agents:fleet:${id}:${live}`, () => fleetService.get(id));
    return <ResourceBoundary resource={resource}>{(data) => <FleetDetail partner={data.partner} invites={data.invites} onChanged={resource.reload} />}</ResourceBoundary>;
}
