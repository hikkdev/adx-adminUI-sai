"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { sitePagesReadApi, sitePagesService, type SitePageRow, type SiteRedirectRow } from "@/services/site-pages";
import { PagesView } from "./pages-view";

export interface PagesData {
    pages: SitePageRow[];
    /** Every redirect; empty when the read failed — the tab says so on its own read. */
    redirects: SiteRedirectRow[];
}

/**
 * PB-1: the pages and the redirects in one read. There are no fixtures, for
 * the same reason the articles have none: a seeded page would look exactly
 * like a live one, and this desk's job is telling those apart.
 */
export function PagesLoader() {
    const live = sitePagesReadApi();
    const resource = useApiResource<PagesData>(`site:pages:${live}`, async () => {
        if (!live) return { pages: [], redirects: [] };
        const [pages, redirects] = await Promise.all([sitePagesService.list(), sitePagesService.redirects().catch(() => [] as SiteRedirectRow[])]);
        return { pages, redirects };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    These are the addresses the website answers and the apps open. There is no seeded stand-in, because a fixture page would look
                    exactly like a live one. Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the
                    console at a running backend.
                </p>
            </Card>
        );
    }

    return <ResourceBoundary resource={resource}>{(data) => <PagesView pages={data.pages} redirects={data.redirects} onChanged={resource.reload} />}</ResourceBoundary>;
}
