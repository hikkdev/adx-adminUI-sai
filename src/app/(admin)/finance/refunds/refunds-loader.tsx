"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import {
    refundsReadApi,
    refundsService,
    type CampaignRefund,
    type CampaignRefundStatus,
    type ListPage,
    type RefundRequest,
    type RefundRequestStatus,
} from "@/services/refunds";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { CampaignRefundsView, RefundRequestsView } from "./refunds-view";

/**
 * The refund desk — two queues under one heading.
 *
 * Each tab is its own resource with its own status facet in the key: the
 * facet is a `?status=` the server cuts and counts, so changing it refetches
 * rather than hiding rows a capped page never held. The two are independent
 * because they are different tables with different lifecycles, and a decision
 * on one has nothing to reload on the other.
 */
export function RefundsLoader() {
    const live = refundsReadApi();
    const [tab, setTab] = React.useState<"campaign" | "requests">("campaign");

    const [campaignStatus, setCampaignStatus] = React.useState<CampaignRefundStatus | "ALL">("PENDING");
    const campaignRefunds = useApiResource<ListPage<CampaignRefund>>(
        `finance:campaign-refunds:${campaignStatus}:${live}`,
        () =>
            live
                ? refundsService.campaignRefunds(campaignStatus === "ALL" ? {} : { status: [campaignStatus] })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50, counts: {} })
    );

    const [requestStatus, setRequestStatus] = React.useState<RefundRequestStatus | "ALL">("PENDING");
    const requests = useApiResource<ListPage<RefundRequest>>(
        `finance:refund-requests:${requestStatus}:${live}`,
        () =>
            live
                ? refundsService.refundRequests(requestStatus === "ALL" ? {} : { status: [requestStatus] })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50, counts: {} })
    );

    return (
        <div className="space-y-5">
            <FinanceNav />
            <PageHeader
                title="Refund desk"
                subtitle="Money going back to an advertiser. A campaign refund is what a cancelled campaign owes; a refund request is what support raised on the advertiser's behalf. Every decision here has a person behind it."
            />
            {live ? (
                <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
                    <TabsList>
                        <TabsTrigger value="campaign">
                            Campaign refunds
                            {typeof campaignRefunds.data?.counts.PENDING === "number" && (
                                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                    {campaignRefunds.data.counts.PENDING}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="requests">
                            Refund requests
                            {typeof requests.data?.counts.PENDING === "number" && (
                                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                    {requests.data.counts.PENDING}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="campaign" className="mt-5">
                        <ResourceBoundary resource={campaignRefunds}>
                            {(page) => (
                                <CampaignRefundsView
                                    page={page}
                                    status={campaignStatus}
                                    onStatusChange={setCampaignStatus}
                                    onChanged={campaignRefunds.reload}
                                />
                            )}
                        </ResourceBoundary>
                    </TabsContent>
                    <TabsContent value="requests" className="mt-5">
                        <ResourceBoundary resource={requests}>
                            {(page) => (
                                <RefundRequestsView
                                    page={page}
                                    status={requestStatus}
                                    onStatusChange={setRequestStatus}
                                    onChanged={requests.reload}
                                />
                            )}
                        </ResourceBoundary>
                    </TabsContent>
                </Tabs>
            ) : (
                <FinanceOffline what="A refund" />
            )}
        </div>
    );
}
