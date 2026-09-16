"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { pricingService } from "@/services/pricing";
import type { SurgeEventWindow } from "@/types/pricing-engine";
import { EngineShell } from "../engine-shell";
import { SurgeView } from "./surge-view";

export function SurgeLoader() {
    const resource = useApiResource<SurgeEventWindow[]>("pricing:surge", () =>
        pricingService.surgeWindows(true)
    );

    return (
        <EngineShell
            title="Surge calendar"
            subtitle="Events that lift the ceiling a publisher can price to. They never change what anyone is charged."
        >
            <ResourceBoundary resource={resource}>
                {(windows) => <SurgeView windows={windows} onChanged={resource.reload} />}
            </ResourceBoundary>
        </EngineShell>
    );
}
