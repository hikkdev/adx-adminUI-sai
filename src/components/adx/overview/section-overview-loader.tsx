"use client";

import * as React from "react";
import { PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ApiError } from "@/lib/api-client";
import { useApiResource, type ApiResource } from "@/lib/use-api-resource";
import { todayIST } from "@/services/overview";
import {
    MAX_OVERVIEW_DAYS,
    SECTION_META,
    sectionOverviewReadsApi,
    sectionOverviewsService,
    windowValid,
    type OverviewWindow,
    type Section,
    type SectionOverviewOf,
} from "@/services/section-overviews";
import { useOverviewWindow } from "./use-overview-window";
import { WindowPicker } from "./window-picker";

export interface SectionOverviewLoaderProps<S extends Section> {
    section: S;
    title: string;
    subtitle: string;
    /** The section's own buttons, beside the window picker. */
    actions?: React.ReactNode;
    /** The tab strip, drawn between the header and the body. */
    nav: React.ReactNode;
    children: (data: SectionOverviewOf<S>, window: OverviewWindow, resource: ApiResource<SectionOverviewOf<S>>) => React.ReactNode;
}

/**
 * The frame every section's Overview tab shares — package O-C: the
 * header with the window picker (and the city select where the section's
 * read takes one) at the top right, the tab strip, then whatever the
 * section draws from its one read, `GET /section-overviews/:section`.
 * The window lives in the URL; a window the server would refuse is
 * refused here first, as an `ApiError`, so the boundary prints the reason.
 * A section whose read fails shows the boundary's error — there are no
 * fixtures for a sum.
 */
export function SectionOverviewLoader<S extends Section>({ section, title, subtitle, actions, nav, children }: SectionOverviewLoaderProps<S>) {
    const meta = SECTION_META[section];
    const live = sectionOverviewReadsApi(section);
    const today = todayIST();
    const [window, setWindow] = useOverviewWindow();
    const valid = windowValid(window);

    const resource = useApiResource<SectionOverviewOf<S>>(`section-overview:${section}:${window.from}:${window.to}:${window.city}:${live}`, async () => {
        if (!live) throw new ApiError(0, "OFFLINE", "The console is not connected to the ADX backend.");
        if (!valid) throw new ApiError(400, "VALIDATION_ERROR", `Pick a window of one to ${MAX_OVERVIEW_DAYS} days, the end on or after the start.`);
        return sectionOverviewsService.read(section, window);
    });

    return (
        <div className="space-y-5">
            <PageHeader
                title={title}
                subtitle={subtitle}
                actions={
                    <>
                        {actions}
                        {live ? (
                            <>
                                <WindowPicker window={window} onChange={setWindow} today={today} cityFilter={meta.cityFilter} />
                                <Button variant="outline" className="h-9 bg-card" onClick={resource.reload} disabled={resource.loading} aria-label="Refresh">
                                    <RefreshCw className="size-4" />
                                </Button>
                            </>
                        ) : null}
                    </>
                }
            />
            {nav}
            {live ? (
                <ResourceBoundary resource={resource}>{(data) => children(data, window, resource)}</ResourceBoundary>
            ) : (
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                        <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        Every figure on this tab is a sum over the {meta.label.toLowerCase()} tables. There is no seeded stand-in, because a fixture window
                        would look exactly like a real one. Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point
                        the console at the API.
                    </p>
                </Card>
            )}
        </div>
    );
}
