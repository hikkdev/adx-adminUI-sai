"use client";

import Link from "next/link";
import { ExternalLink, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { openStudio } from "@/lib/studio";
import { useApiResource } from "@/lib/use-api-resource";
import { LAYOUT_SURFACE_LABEL, SURFACE_CLIENT, isWebSurface, layoutsReadApi, layoutsService, type LayoutSummary } from "@/services/layouts";
import { pageKeyForSurface, sitePagesService } from "@/services/site-pages";
import { MediaOffline } from "../media/media-loader";

const CLIENT_LABEL = { WEB: "Website", APP: "App" } as const;

interface LayoutsData {
    rows: LayoutSummary[];
    /** A website surface's page key, from the pages the site answers; the seed's map when the read fails. */
    pageKeys: Record<string, string>;
}

/**
 * Every surface a layout drives, each with what is live and whether a
 * draft is waiting. A surface with nothing published draws its baked
 * default — today's order — and says so.
 *
 * PB-3 (27 Sep 2026): the website's pages are laid out in Studio, so a
 * website row opens there; the app homes keep the builder here, since the
 * phones draw them.
 */
export function LayoutsLoader() {
    const live = layoutsReadApi();
    const resource = useApiResource<LayoutsData>(`layouts:list:${live}`, async () => {
        if (!live) return { rows: [], pageKeys: {} };
        const [rows, pages] = await Promise.all([layoutsService.list(), sitePagesService.list().catch(() => [])]);
        const pageKeys: Record<string, string> = {};
        for (const page of pages) if (page.surface) pageKeys[page.surface] = page.key;
        return { rows, pageKeys };
    });
    if (!live) return <MediaOffline />;

    const studioKey = (data: LayoutsData, surface: string) => data.pageKeys[surface] ?? pageKeyForSurface(surface);

    return (
        <div className="space-y-5" data-testid="layouts-desk">
            <PageHeader
                title="Layouts"
                subtitle="What each screen of the website and the apps draws, in what order, for whom and when. The website's pages are edited in Studio; the app homes here. Every version is kept."
            />
            <ResourceBoundary resource={resource}>
                {(data) => (
                    <SimpleTable<LayoutSummary>
                        rows={data.rows}
                        rowKey={(row) => row.surface}
                        emptyMessage="No surfaces answered."
                        columns={[
                            {
                                key: "surface",
                                label: "Screen",
                                render: (row) =>
                                    isWebSurface(row.surface) && studioKey(data, row.surface) ? (
                                        <button
                                            type="button"
                                            onClick={() => openStudio({ kind: "page", key: studioKey(data, row.surface)! })}
                                            className="flex items-center gap-2 text-left font-medium text-foreground hover:underline"
                                            data-testid={`layout-row-${row.surface}`}
                                        >
                                            <LayoutTemplate className="size-4 text-muted-foreground" aria-hidden />
                                            {row.label || LAYOUT_SURFACE_LABEL[row.surface] || row.surface}
                                        </button>
                                    ) : (
                                        <Link href={`/content/layouts/${row.surface}`} className="flex items-center gap-2 font-medium text-foreground hover:underline" data-testid={`layout-row-${row.surface}`}>
                                            <LayoutTemplate className="size-4 text-muted-foreground" aria-hidden />
                                            {row.label || LAYOUT_SURFACE_LABEL[row.surface] || row.surface}
                                        </Link>
                                    ),
                            },
                            {
                                key: "client",
                                label: "Drawn by",
                                render: (row) => (
                                    <span className="text-sm text-muted-foreground">
                                        {CLIENT_LABEL[SURFACE_CLIENT[row.surface] ?? "WEB"]}
                                        {isWebSurface(row.surface) ? " · Edited in Studio" : ""}
                                    </span>
                                ),
                            },
                            {
                                key: "live",
                                label: "Live",
                                render: (row) =>
                                    row.live ? (
                                        <span className="text-sm">
                                            <StatusBadge status={{ label: `v${row.live.number}`, tone: "success" }} />
                                            <span className="ml-2 text-xs text-muted-foreground">{row.live.publishedAt ? formatDateTime(row.live.publishedAt) : ""}</span>
                                        </span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">Default order — nothing published</span>
                                    ),
                            },
                            {
                                key: "draft",
                                label: "Draft",
                                render: (row) =>
                                    row.draft ? (
                                        <span className="text-sm">
                                            <StatusBadge status={{ label: `v${row.draft.number}`, tone: "warning" }} />
                                            <span className="ml-2 text-xs text-muted-foreground">saved {formatDateTime(row.draft.updatedAt)}</span>
                                        </span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    ),
                            },
                            {
                                key: "open",
                                label: "",
                                className: "text-right",
                                render: (row) =>
                                    isWebSurface(row.surface) && studioKey(data, row.surface) ? (
                                        <Button variant="outline" size="sm" className="h-7 bg-card" onClick={() => openStudio({ kind: "page", key: studioKey(data, row.surface)! })} data-testid={`layout-studio-${row.surface}`}>
                                            <ExternalLink className="mr-1 size-3.5" />
                                            Open in Studio
                                        </Button>
                                    ) : (
                                        <Button asChild variant="outline" size="sm" className="h-7 bg-card">
                                            <Link href={`/content/layouts/${row.surface}`}>{row.draft ? "Continue draft" : "Edit"}</Link>
                                        </Button>
                                    ),
                            },
                        ]}
                    />
                )}
            </ResourceBoundary>
        </div>
    );
}
