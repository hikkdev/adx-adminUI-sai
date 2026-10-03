"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { contentService, groupPages } from "@/services/content";
import { formsService } from "@/services/forms";
import { geoService, type GeoCity } from "@/services/geo";
import { sitePagesService } from "@/services/site-pages";
import { isLayoutSurface, layoutsReadApi, layoutsService, type BlockTypeDef, type LayoutDetail, type LayoutSurface } from "@/services/layouts";
import { mediaService, type MediaAsset, type MediaSpec } from "@/services/media";
import { promotionsService, type AdSlot } from "@/services/promotions";
import { MediaOffline } from "../../media/media-loader";
import { BuilderView } from "./builder-view";

export interface BuilderData {
    detail: LayoutDetail;
    types: BlockTypeDef[];
    specs: MediaSpec[];
    media: MediaAsset[];
    /** Every ad slot, for the slot-key select; empty when the promotions desk cannot be read. */
    slots: AdSlot[];
    /** Published articles, for the content-slug select. */
    pages: { slug: string; title: string }[];
    /** PB-1: the site's pages, for the PAGE target; empty when the read fails. */
    sitePages: { key: string; title: string; path: string }[];
    /** PB-1: the forms, for the `form` block; empty when the read fails. */
    forms: { key: string; title: string; live: boolean }[];
    /** The active cities, to name the ids a block is shown in. */
    cities: GeoCity[];
}

/**
 * Everything the builder needs in one resource: the surface, the block
 * vocabulary, the size specs, and the pickers' lists. The pickers' reads
 * are allowed to fail — a slot select with no slots says so rather than
 * taking the builder down with it.
 */
export function BuilderLoader({ surface: raw }: { surface: string }) {
    const live = layoutsReadApi();
    const surface = raw.toUpperCase().replace(/-/g, "_");
    const known = isLayoutSurface(surface);
    const resource = useApiResource<BuilderData | null>(`layouts:builder:${live}:${surface}`, async () => {
        if (!live || !known) return null;
        const typed = surface as LayoutSurface;
        const [detail, types, specs, media, slots, pages, cities, sitePages, forms] = await Promise.all([
            layoutsService.get(typed),
            layoutsService.blockTypes(),
            mediaService.specs(),
            // ADX's own pictures: blocks never name an advertiser's artwork (the ad slot resolves that server-side).
            mediaService.list({ archived: false, owner: "adx" }).catch(() => [] as MediaAsset[]),
            promotionsService.slots().catch(() => [] as AdSlot[]),
            contentService
                .list()
                .then((all) => groupPages(all).filter((group) => group.live).map((group) => ({ slug: group.slug, title: group.title })))
                .catch(() => [] as { slug: string; title: string }[]),
            geoService
                .cities({ stage: ["LAUNCHED", "SEEDING", "PAUSED"], pageSize: 100 })
                .then((page) => page.items)
                .catch(() => [] as GeoCity[]),
            sitePagesService
                .list()
                .then((rows) => rows.filter((row) => !row.archivedAt).map((row) => ({ key: row.key, title: row.title, path: row.path })))
                .catch(() => [] as { key: string; title: string; path: string }[]),
            formsService
                .list()
                .then((rows) => rows.filter((row) => !row.archivedAt).map((row) => ({ key: row.key, title: row.title, live: row.live !== null })))
                .catch(() => [] as { key: string; title: string; live: boolean }[]),
        ]);
        return { detail, types, specs, media, slots, pages, cities, sitePages, forms };
    });

    if (!live) return <MediaOffline />;
    if (!known) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <p className="text-sm text-muted-foreground">
                    “{raw}” is not a screen a layout drives.{" "}
                    <Link href="/content/layouts" className="text-foreground underline">
                        Back to the layouts
                    </Link>
                </p>
            </Card>
        );
    }

    /* Keyed on what was saved: after a save, a discard, a publish or a
       restore the editor starts again from the server's answer. */
    const stampOf = (data: BuilderData) => `${data.detail.draft?.id ?? "-"}:${data.detail.draft?.updatedAt ?? ""}:${data.detail.live?.id ?? "-"}`;
    return <ResourceBoundary resource={resource}>{(data) => (data ? <BuilderView key={stampOf(data)} data={data} onReload={resource.reload} /> : null)}</ResourceBoundary>;
}
