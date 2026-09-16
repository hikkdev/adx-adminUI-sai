"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { landingPageService, type LandingPageStatus, type LandingPagesPage } from "@/services/landing-pages";
import { LandingPagesView } from "./landing-pages-view";

/**
 * The review list's data. The status facet goes to the API so the chip
 * counts come back computed over the whole table. Under `campaigns`,
 * because a page is one campaign's and the row links into it.
 */
export function LandingPagesLoader() {
    const live = isLive("campaigns");
    const [status, setStatus] = React.useState<LandingPageStatus | "ALL">("PUBLISHED");

    const resource = useApiResource<LandingPagesPage>(`landing-pages:${status}:${live}`, () =>
        landingPageService.list(status === "ALL" ? {} : { status }),
    );

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title="Landing pages" subtitle="The ADX pages campaign codes send people to." />
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
            {(page) => <LandingPagesView page={page} status={status} onStatusChange={setStatus} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
