"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { leadsService, type FeedRun, type FeedStatus, type LeadSource, type Referral } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { SourcesView } from "./sources-view";

export interface SourcesData {
    feeds: FeedStatus[];
    runs: FeedRun[];
    sources: LeadSource[];
    referrals: Referral[];
}

export function SourcesLoader() {
    const live = isLive("leads");
    const resource = useApiResource<SourcesData>(`leads:sources:${live}`, async () => {
        const [feeds, runs, sources, referrals] = await Promise.all([leadsService.feeds(), leadsService.feedRuns(), leadsService.sources(), leadsService.referrals().catch(() => [])]);
        return { feeds, runs, sources, referrals };
    });
    if (!live) return <LeadsOffline />;
    return <ResourceBoundary resource={resource}>{(data) => <SourcesView data={data} onChanged={resource.reload} />}</ResourceBoundary>;
}
