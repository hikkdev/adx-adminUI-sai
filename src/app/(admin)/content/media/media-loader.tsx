"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { mediaReadApi, mediaService, type MediaAsset, type MediaSpec } from "@/services/media";
import { MediaView, type MediaFilters } from "./media-view";

/**
 * The library's two reads: the size specs (fixed, read once) and the
 * pictures under the filters — each filter is a `?` the server cuts, so a
 * search reaches every picture rather than the page already on screen.
 *
 * ADX's own pictures only (`owner=adx`, 28 Sep 2026): an advertiser's ad
 * artwork lives with their ad, on Ads & sponsored › Display ads.
 */
export function MediaLoader() {
    const live = mediaReadApi();
    const [filters, setFilters] = React.useState<MediaFilters>({ q: "", tag: "", spec: "", archived: false });
    const q = useDebounced(filters.q.trim(), 300);
    const tag = useDebounced(filters.tag.trim().toLowerCase(), 300);

    const specs = useApiResource<MediaSpec[]>(`media:specs:${live}`, () => (live ? mediaService.specs() : Promise.resolve([])));
    const assets = useApiResource<MediaAsset[]>(`media:list:${live}:${q}:${tag}:${filters.spec}:${filters.archived}`, () =>
        live ? mediaService.list({ q: q || undefined, tag: tag || undefined, spec: filters.spec || undefined, archived: filters.archived, owner: "adx" }) : Promise.resolve([]),
    );

    if (!live) return <MediaOffline />;

    return (
        <ResourceBoundary resource={specs}>
            {(specList) => (
                <MediaView
                    specs={specList}
                    assets={assets.data}
                    loading={assets.loading}
                    error={assets.error}
                    filters={filters}
                    onFilters={setFilters}
                    onChanged={assets.reload}
                />
            )}
        </ResourceBoundary>
    );
}

export function MediaOffline() {
    return (
        <Card className="rounded-lg border-border p-8 text-center shadow-none">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                The library is the pictures the apps and the website draw. There is no seeded stand-in. Set{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the console at a running backend.
            </p>
        </Card>
    );
}
