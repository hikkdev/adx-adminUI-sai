"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { financeReadsApi } from "@/services/finance";
import {
    invoicesService,
    type InvoiceRow,
    type LegalEntity,
    type ListPage,
} from "@/services/invoices";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { InvoicesNav } from "./invoices-nav";
import { InvoicesView, type InvoiceFilter } from "./invoices-view";

const PAGE_SIZE = 50;

/**
 * The register, on the list contract.
 *
 * Every facet is part of the request — the endpoint takes `q`, `status` and
 * `kind` and answers with a page and the per-status counts — so the filter
 * lives in the resource key and refetches rather than cutting a capped page
 * on the client. The counts are computed with the status facet removed, so
 * the chips keep reading the whole register whichever one is selected.
 *
 * The legal entity is read beside it for one reason: the banner. While the
 * entity has no GSTIN every document issued is a proforma, and the desk
 * should see that here, where the proformas are, rather than under Settings.
 */
export function InvoicesLoader() {
    const live = financeReadsApi();
    const [filter, setFilter] = React.useState<InvoiceFilter>({
        status: "ALL",
        kind: "ALL",
        q: "",
        page: 1,
    });
    const q = useDebounced(filter.q.trim(), 350);

    const resource = useApiResource<ListPage<InvoiceRow>>(
        `finance:invoices:${filter.status}:${filter.kind}:${q}:${filter.page}:${live}`,
        () =>
            live
                ? invoicesService.list({
                      q,
                      status: filter.status === "ALL" ? undefined : [filter.status],
                      kind: filter.kind === "ALL" ? undefined : filter.kind,
                      page: filter.page,
                      pageSize: PAGE_SIZE,
                  })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE, counts: {} })
    );

    const entity = useApiResource<LegalEntity | null>(`finance:legal-entity:${live}`, () =>
        live ? invoicesService.legalEntity().catch(() => null) : Promise.resolve(null)
    );

    const onFilterChange = React.useCallback((next: Partial<InvoiceFilter>) => {
        // A new facet or search term starts again from page one; only an
        // explicit page change keeps its page.
        setFilter((current) => ({ ...current, page: 1, ...next }));
    }, []);

    return (
        <div className="space-y-5">
            <FinanceNav />
            <InvoicesNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(page) => (
                        <InvoicesView
                            page={page}
                            filter={filter}
                            onFilterChange={onFilterChange}
                            entity={entity.data}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A tax invoice" />
            )}
        </div>
    );
}
