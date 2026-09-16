"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { campaignService, type CampaignStatus, type CampaignsPage } from "@/services/campaigns";
import { CampaignsTable } from "./campaigns-table";

/**
 * The campaign worklist's data.
 *
 * The status facet goes to the API so the chip counts come back computed over
 * the whole filter rather than over one page. No fixture fallback: the seeded
 * `cmp_*` ids were never issued by the backend, so an approve on one would
 * have gone nowhere — which is what the old inert buttons did anyway.
 */
export function CampaignsLoader() {
    const live = isLive("campaigns");
    const [status, setStatus] = React.useState<CampaignStatus | "ALL">("ALL");
    /* `?advertiserId=` — the advertiser page's "View campaign queue" cuts the
       worklist to one account; the API honours the facet for ADMIN only. */
    const advertiserId = useSearchParams().get("advertiserId") ?? undefined;

    const resource = useApiResource<CampaignsPage>(`campaigns:list:${status}:${advertiserId ?? ""}:${live}`, () =>
        campaignService.list({
            ...(status === "ALL" ? {} : { status: [status] }),
            ...(advertiserId ? { advertiserId } : {}),
            sort: "NEWEST",
        }),
    );

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title="Campaigns" subtitle="Advertiser campaigns across the market." />
                <EmptyState
                    icon={PlugZap}
                    title="Campaigns read the API"
                    description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {advertiserId && (
                <p className="text-sm text-muted-foreground">
                    Showing one advertiser&apos;s campaigns.{" "}
                    <Link href={`/advertisers/${encodeURIComponent(advertiserId)}`} className="underline underline-offset-4">
                        Open the account
                    </Link>
                    {" · "}
                    <Link href="/campaigns" className="underline underline-offset-4">
                        Show every campaign
                    </Link>
                </p>
            )}
            <ResourceBoundary resource={resource}>
                {(page) => (
                    <CampaignsTable
                        page={page}
                        status={status}
                        onStatusChange={setStatus}
                        onChanged={resource.reload}
                    />
                )}
            </ResourceBoundary>
        </div>
    );
}
