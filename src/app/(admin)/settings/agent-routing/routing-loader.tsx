"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { agentRoutingService, type RoutingSettings } from "@/services/agent-applications";
import { RoutingView } from "./routing-view";

export function RoutingLoader() {
    const live = isLive("agents");
    const resource = useApiResource<RoutingSettings>(`agents:routing:${live}`, () => agentRoutingService.get());
    return <ResourceBoundary resource={resource}>{(settings) => <RoutingView settings={settings} onSaved={resource.reload} />}</ResourceBoundary>;
}
