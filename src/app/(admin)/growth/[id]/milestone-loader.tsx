"use client";

import { notFound } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { growthService, type TemplateRow } from "@/services/growth";
import { GROWTH_SUBTITLE, GROWTH_TITLE } from "../growth-nav";
import { GrowthOffline } from "../growth-offline";
import { MilestoneEditor } from "./milestone-editor";

interface Loaded {
    /** Null when the id names no template. */
    template: TemplateRow | null;
    /** Every template, for the rail beside the form. */
    templates: TemplateRow[];
}

/**
 * One template and the rail beside it, in one resource so a save refetches
 * both and the rail's badge agrees with the form.
 */
export function MilestoneLoader({ id }: { id: string }) {
    const live = isLive("growth");
    const resource = useApiResource<Loaded>(`growth:template:${id}:${live}`, async () => {
        if (!live) return { template: null, templates: [] };
        const [template, templates] = await Promise.all([
            growthService.template(id).catch((cause) => {
                if (cause instanceof ApiError && cause.status === 404) return null;
                throw cause;
            }),
            growthService.templates(),
        ]);
        return { template, templates };
    });

    if (!live) return <GrowthOffline title={GROWTH_TITLE} subtitle={GROWTH_SUBTITLE} />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.template) notFound();
                // Keyed by id so moving down the rail starts a fresh draft
                // rather than carrying the last template's edits across.
                return (
                    <MilestoneEditor
                        key={data.template.id}
                        template={data.template}
                        templates={data.templates}
                        onSaved={resource.reload}
                    />
                );
            }}
        </ResourceBoundary>
    );
}
