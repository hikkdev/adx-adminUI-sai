"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { contentReadsApi, contentService, type ContentPage } from "@/services/content";
import { ContentView } from "./content-view";

/**
 * Every version of every page in one read. There are no fixtures, for the
 * same reason the legal screen has none: a seeded help article would look
 * exactly like a published one, and this desk's whole job is telling those
 * two apart.
 */
export function ContentLoader() {
    const live = contentReadsApi();
    const resource = useApiResource<ContentPage[]>(`content:pages:${live}`, () => (live ? contentService.list() : Promise.resolve([])));

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    These are the pages the apps and the website read. There is no seeded stand-in, because a fixture page would look exactly
                    like a published one. Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point
                    the console at a running backend.
                </p>
            </Card>
        );
    }

    return <ResourceBoundary resource={resource}>{(pages) => <ContentView pages={pages} onChanged={resource.reload} />}</ResourceBoundary>;
}
