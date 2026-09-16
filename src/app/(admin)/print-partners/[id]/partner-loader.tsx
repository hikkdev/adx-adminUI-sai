"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { financeReadsApi, financeService, type PayoutMethod } from "@/services/finance";
import { printPartnerService, type PartnerInvoice, type PartnerQuoteHistoryRow, type PrintPartnerLedger } from "@/services/print-partners";
import { PrintPartnersOffline } from "../print-partners-offline";
import { PartnerView } from "./partner-view";

type Loaded = {
    ledger: PrintPartnerLedger;
    /** Null when the finance API is off — the same gate the agent page uses. */
    methods: PayoutMethod[] | null;
    /** Lot H: `GET /print-partners/:id/quotes`; null when that read failed rather than the whole page. */
    quotes: PartnerQuoteHistoryRow[] | null;
    /** G13-B: `GET /print-partners/:id/invoices` — every invoice with its month; null when that read failed (the ledger's list stands in). */
    invoices: PartnerInvoice[] | null;
};

/**
 * One partner: `GET /print-partners/:id/ledger` is the partner, its wallet,
 * its statement lines, its withdrawals, its jobs and its invoices in one
 * read; the payout methods on its account come from the finance router
 * beside it, and (Lot H) the quote history from its own route — a failure
 * there loses the tab, not the page. G13-B: the invoices with their months
 * are a fourth read on their own route; the ledger's plain list stands in
 * when it fails.
 */
export function PartnerLoader({ id }: { id: string }) {
    const live = isLive("printPartners");
    const financeLive = financeReadsApi();

    const resource = useApiResource<Loaded | null>(`print-partner:${id}:${live}:${financeLive}`, async () => {
        if (!live) return null;
        const partner = await printPartnerService.get(id);
        if (!partner) return null;
        const [ledger, methods, quotes, invoices] = await Promise.all([
            printPartnerService.ledger(id),
            financeLive ? financeService.payoutMethodsFor(partner.userId).catch(() => [] as PayoutMethod[]) : Promise.resolve(null),
            printPartnerService.quotesFor(id).catch(() => null),
            printPartnerService.invoicesFor(id).catch(() => null),
        ]);
        return { ledger, methods, quotes, invoices };
    });

    if (!live) return <PrintPartnersOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) =>
                data ? (
                    <PartnerView ledger={data.ledger} methods={data.methods} quotes={data.quotes} invoices={data.invoices} onChanged={resource.reload} />
                ) : (
                    <EmptyState
                        icon={PlugZap}
                        title="No such print partner"
                        description="It may never have been on the roster, or the link may be stale."
                    />
                )
            }
        </ResourceBoundary>
    );
}
