"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { legalReadsApi, legalService, type SafetyAlert } from "@/services/legal";
import { SafetyView } from "./safety-view";

/**
 * No fixtures. A seeded safety alert would put a fabricated emergency in front
 * of the person whose job is to answer them.
 */
export function SafetyLoader() {
    const live = legalReadsApi();
    const resource = useApiResource<SafetyAlert[]>(`safety:alerts:${live}`, () => (live ? legalService.safetyAlerts() : Promise.resolve([])));

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    These are reports from people in the field. There is no seeded stand-in, because a fixture emergency is worse than an empty
                    queue. Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the console at a
                    running backend.
                </p>
            </Card>
        );
    }

    return <ResourceBoundary resource={resource}>{(alerts) => <SafetyView alerts={alerts} onChanged={resource.reload} />}</ResourceBoundary>;
}
