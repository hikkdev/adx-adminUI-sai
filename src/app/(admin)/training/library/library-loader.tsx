"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { trainingService, type TrainingResource } from "@/services/training";
import { TrainingOffline } from "../training-nav";
import { LibraryView } from "./library-view";

/**
 * The flat library both apps read — `GET /training`, unchanged since before
 * the curriculum. The endpoint takes a category and a search, but the whole
 * list is small enough to read once and cut in the table.
 */
export function LibraryLoader() {
    const live = isLive("training");
    const resource = useApiResource<TrainingResource[]>(`training:library:${live}`, () =>
        live ? trainingService.library() : Promise.resolve([]),
    );

    if (!live) return <TrainingOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(resources) => <LibraryView resources={resources} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
