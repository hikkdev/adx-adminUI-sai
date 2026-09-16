"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { trainingService, type ModuleRow } from "@/services/training";
import { TrainingOffline } from "./training-nav";
import { TrainingView } from "./training-view";

/**
 * The modules table's data.
 *
 * Server shell + client loader, because `api-client` keeps its token in
 * localStorage and cannot run on the server. One resource for the whole
 * list — the endpoint returns every module, active or not, and the desk
 * wants to see the switched-off ones too.
 */
export function TrainingLoader() {
    const live = isLive("training");
    const resource = useApiResource<ModuleRow[]>(`training:modules:${live}`, () =>
        live ? trainingService.modules() : Promise.resolve([]),
    );

    if (!live) return <TrainingOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(modules) => <TrainingView modules={modules} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
