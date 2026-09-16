"use client";

import { notFound } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { trainingService, type ModuleRow, type ModuleWithQuestions } from "@/services/training";
import { TrainingOffline } from "../training-nav";
import { ModuleEditor } from "./module-editor";

interface Loaded {
    /** Null when the id names no module. */
    module: ModuleWithQuestions | null;
    /** Every module, for the rail beside the form. */
    modules: ModuleRow[];
}

/**
 * One module with its questions, and the rail beside it, in one resource so
 * a save refetches both and the rail's badge agrees with the form.
 */
export function ModuleLoader({ id }: { id: string }) {
    const live = isLive("training");
    const resource = useApiResource<Loaded>(`training:module:${id}:${live}`, async () => {
        if (!live) return { module: null, modules: [] };
        const [module, modules] = await Promise.all([
            trainingService.module(id).catch((cause) => {
                if (cause instanceof ApiError && cause.status === 404) return null;
                throw cause;
            }),
            trainingService.modules(),
        ]);
        return { module, modules };
    });

    if (!live) return <TrainingOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.module) notFound();
                // Keyed by id so moving down the rail starts a fresh draft
                // rather than carrying the last module's edits across.
                return (
                    <ModuleEditor
                        key={data.module.id}
                        module={data.module}
                        modules={data.modules}
                        onSaved={resource.reload}
                    />
                );
            }}
        </ResourceBoundary>
    );
}
