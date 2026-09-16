"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { legalReadsApi, legalService, type AppStatus } from "@/services/legal";
import { AppStatusView } from "./app-status-view";

/**
 * No fixtures here either, and for a sharper reason than the policies: a
 * seeded app status would tell ops every build was supported and every service
 * up when nobody had said so, and this is the one panel whose numbers lock
 * people out of the apps.
 */
export function AppStatusLoader() {
    const live = legalReadsApi();
    const resource = useApiResource<AppStatus | null>(`app-status:${live}`, () => (live ? legalService.appStatus() : Promise.resolve(null)));

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    This panel decides which builds may run and whether the apps are open at all. There is no seeded stand-in, because a fixture
                    answer here would be a claim about production. Set{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the console at a running backend.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(status) => (status ? <AppStatusView status={status} onChanged={resource.reload} /> : null)}
        </ResourceBoundary>
    );
}
