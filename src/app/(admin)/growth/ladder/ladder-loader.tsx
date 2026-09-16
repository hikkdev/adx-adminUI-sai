"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { growthService, type LadderView as Ladder } from "@/services/growth";
import { GrowthOffline } from "../growth-offline";
import { LadderView } from "./ladder-view";

/**
 * The ladder in force. Keyed on the live flag only: there is one ladder, and
 * a save reloads it so the form restarts from what the server actually holds.
 */
export function LadderLoader() {
    const live = isLive("growth");
    const resource = useApiResource<Ladder>(`growth:ladder:${live}`, () =>
        live ? growthService.ladder() : Promise.resolve({ rungs: [], supportLines: {} }),
    );

    if (!live) {
        return (
            <GrowthOffline
                title="Tier ladder"
                subtitle="Where a count of onboarded accounts puts an agent, and what each tier comes with."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(ladder) => <LadderView key={JSON.stringify(ladder)} ladder={ladder} onSaved={resource.reload} />}
        </ResourceBoundary>
    );
}
