"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { isLive } from "@/lib/api-config";
import { landingPageService, type LandingPageStatus, type LandingPagesPage } from "@/services/landing-pages";
import { LANDING_EXPLAINER, LandingPagesView } from "./landing-pages-view";

/** One page of the server's. */
export const LANDING_PAGE_SIZE = 25;

/**
 * The landing pages list's data. The status and the search go to the API
 * so the counts come back computed over the whole table and the pager
 * walks it. Under `campaigns`, because a page is one campaign's and the
 * row links into it.
 */
export function LandingPagesLoader() {
    const live = isLive("campaigns");
    const [status, setStatus] = React.useState<LandingPageStatus | "ALL">("PUBLISHED");
    const [text, setText] = React.useState("");
    const q = useDebounced(text.trim(), 350);
    /* The page belongs to the filters it was turned under: a new status or search starts at the first page. */
    const filterKey = `${status}:${q}`;
    const [paging, setPaging] = React.useState({ key: filterKey, page: 1 });
    const page = paging.key === filterKey ? paging.page : 1;
    const setPage = (next: number) => setPaging({ key: filterKey, page: next });

    const resource = useApiResource<LandingPagesPage>(`landing-pages:${status}:${q}:${page}:${live}`, () =>
        landingPageService.list({ ...(status === "ALL" ? {} : { status }), ...(q ? { q } : {}), page, pageSize: LANDING_PAGE_SIZE }),
    );

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title="Landing pages" subtitle={LANDING_EXPLAINER} />
                <EmptyState
                    icon={PlugZap}
                    title="Landing pages read the API"
                    description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
                />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <LandingPagesView
                    page={data}
                    status={status}
                    onStatusChange={setStatus}
                    searchText={text}
                    onSearchText={setText}
                    pageNumber={page}
                    pageSize={LANDING_PAGE_SIZE}
                    onPage={setPage}
                    refreshing={resource.loading}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
