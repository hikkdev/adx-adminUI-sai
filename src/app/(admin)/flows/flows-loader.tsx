"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { PageHeader } from "@/components/adx/page-header";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { flowService, type ConfigDocument } from "@/services/flows";
import type { FlowSummary } from "@/types";
import { FlowsNav } from "./flows-nav";
import { FlowsOffline } from "./flows-offline";
import { FlowsView } from "./flows-view";

interface Loaded {
    summaries: FlowSummary[];
    document: ConfigDocument;
}

/**
 * The cards' data: the keys and versions from `GET /config/flows`, and the
 * bodies from `GET /config` so a card can count what it holds. One resource,
 * so a card's version and its counts always describe the same row.
 */
export function FlowsLoader() {
    const live = isLive("flows");
    const resource = useApiResource<Loaded>(`flows:list:${live}`, async () => {
        if (!live) return { summaries: [], document: { enums: {}, flows: {} } };
        const [summaries, document] = await Promise.all([flowService.list(), flowService.document()]);
        return { summaries, document };
    });

    return (
        <div className="space-y-5">
            <PageHeader
                title="Flow Editor"
                subtitle="The flows the mobile apps and the desks render: onboarding, listings, the agent's job checklist and employee intake."
            />
            <FlowsNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(data) => (
                        <FlowsView summaries={data.summaries} flows={data.document.flows} onChanged={resource.reload} />
                    )}
                </ResourceBoundary>
            ) : (
                <FlowsOffline />
            )}
        </div>
    );
}
