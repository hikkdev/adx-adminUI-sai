"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { financeReadsApi } from "@/services/finance";
import {
    invoicesService,
    type ListPage,
    type PublisherInvoice,
    type PublisherInvoiceStatus,
} from "@/services/invoices";
import { supplyService, type RosterPublisher } from "@/services/supply";
import { FinanceNav } from "../../finance-nav";
import { FinanceOffline } from "../../finance-offline";
import { InvoicesNav } from "../invoices-nav";
import { PublisherInvoicesView } from "./publisher-invoices-view";

/**
 * What GST-registered publishers billed ADX, month by month.
 *
 * The status is part of the request and lives in the key. The roster is read
 * once beside it, keyed without the status, so a row can name the publisher
 * it belongs to — the endpoint carries `publisherId` and nothing else about
 * them. If the roster read fails the queue still works and the column shows
 * the PUB- short id with a link that resolves it.
 */
export function PublisherInvoicesLoader() {
    const live = financeReadsApi();
    const [status, setStatus] = React.useState<PublisherInvoiceStatus | "ALL">("UPLOADED");

    const resource = useApiResource<ListPage<PublisherInvoice>>(
        `finance:publisher-invoices:${status}:${live}`,
        () =>
            live
                ? invoicesService.publisherInvoices(status === "ALL" ? {} : { status: [status] })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100, counts: {} })
    );

    const rosterLive = isLive("supply");
    const roster = useApiResource<RosterPublisher[]>(
        `finance:publisher-invoices:roster:${rosterLive}`,
        () => (rosterLive ? supplyService.roster().catch(() => []) : Promise.resolve([]))
    );

    return (
        <div className="space-y-5">
            <FinanceNav />
            <InvoicesNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(page) => (
                        <PublisherInvoicesView
                            page={page}
                            publishers={roster.data ?? []}
                            status={status}
                            onStatusChange={setStatus}
                            onChanged={resource.reload}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A publisher's invoice to ADX" />
            )}
        </div>
    );
}
