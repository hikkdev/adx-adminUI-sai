"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { financeReadsApi } from "@/services/finance";
import { invoicesService, type InvoiceDetail as Invoice } from "@/services/invoices";
import { FinanceNav } from "../../finance-nav";
import { FinanceOffline } from "../../finance-offline";
import { InvoiceDetail } from "./invoice-detail";

/**
 * One document with its lines. A 404 is the page's own not-found, so a stale
 * link from somebody's history reads as "no such invoice" rather than as a
 * failed request with a retry button that will never succeed.
 */
export function InvoiceLoader({ id }: { id: string }) {
    const live = financeReadsApi();

    const resource = useApiResource<Invoice | null>(`finance:invoice:${id}:${live}`, () =>
        live ? invoicesService.get(id) : Promise.resolve(null)
    );

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(invoice) => {
                        if (!invoice) notFound();
                        return <InvoiceDetail invoice={invoice} onChanged={resource.reload} />;
                    }}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A tax invoice" />
            )}
        </div>
    );
}
