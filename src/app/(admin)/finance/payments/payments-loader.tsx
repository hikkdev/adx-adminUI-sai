"use client";

import * as React from "react";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import {
    paymentsReadApi,
    paymentsService,
    type PaymentGateway,
    type PaymentStatus,
    type PaymentsPage,
} from "@/services/payments";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { PaymentsView } from "./payments-view";

const PAGE_SIZE = 50;

/**
 * The payments desk — Lot C's gateway register under the finance nav.
 *
 * Status, gateway and the search are each a `?` the server cuts, so
 * changing one refetches rather than hiding rows a capped page never held;
 * the status chips carry the histogram the list contract sends.
 */
export function PaymentsLoader() {
    const live = paymentsReadApi();
    const [status, setStatus] = React.useState<PaymentStatus | "ALL">("ALL");
    const [gateway, setGateway] = React.useState<PaymentGateway | "ALL">("ALL");
    const [q, setQ] = React.useState("");
    const search = useDebounced(q.trim(), 300);

    const resource = useApiResource<PaymentsPage>(
        `finance:payments:${live}:${status}:${gateway}:${search}`,
        () =>
            live
                ? paymentsService.list({
                      status: status === "ALL" ? undefined : [status],
                      gateway: gateway === "ALL" ? undefined : gateway,
                      q: search || undefined,
                      pageSize: PAGE_SIZE,
                  })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE, counts: {} }),
    );

    return (
        <div className="space-y-5">
            <FinanceNav />
            <PageHeader
                title="Payments"
                subtitle="Money arriving from advertisers through Razorpay, Cashfree and CCAvenue. A capture tops up the wallet and the campaign or sale is settled out of it; a refund goes back to the card or UPI it came from."
            />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(page) => (
                        <PaymentsView
                            page={page}
                            status={status}
                            onStatusChange={setStatus}
                            gateway={gateway}
                            onGatewayChange={setGateway}
                            q={q}
                            onSearch={setQ}
                            onChanged={resource.reload}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A gateway payment" />
            )}
        </div>
    );
}
