"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { trainingService, type CertificationRow } from "@/services/training";
import { TrainingOffline } from "../training-nav";
import { CertificationsView } from "./certifications-view";

/**
 * Everyone certified, revocations included. One resource, no facet: the
 * endpoint answers the whole list and there is no chip row to cut it by.
 */
export function CertificationsLoader() {
    const live = isLive("training");
    const resource = useApiResource<CertificationRow[]>(`training:certifications:${live}`, () =>
        live ? trainingService.certifications() : Promise.resolve([]),
    );

    if (!live) return <TrainingOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(rows) => <CertificationsView rows={rows} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
