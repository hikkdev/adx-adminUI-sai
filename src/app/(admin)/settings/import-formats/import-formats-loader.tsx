"use client";

import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { importFormatsService, type ImportFormat } from "@/services/party-imports";
import { ImportFormatsView } from "./import-formats-view";

/** `GET /party-imports/formats` — every kind's guide, in the platform's order. */
export function ImportFormatsLoader() {
    const live = isLive("listings");
    const resource = useApiResource<ImportFormat[]>(`import-formats:${live}`, () => (live ? importFormatsService.list() : Promise.resolve([])));

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    The format guide is derived from the server&rsquo;s own validators. Set <code className="font-mono text-xs">NEXT_PUBLIC_USE_API=true</code> and
                    point the console at the ADX backend to read it.
                </p>
            </Card>
        );
    }

    return <ResourceBoundary resource={resource}>{(formats) => <ImportFormatsView formats={formats} />}</ResourceBoundary>;
}
