"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import {
    financeReadsApi,
    financeService,
    type LedgerFilter,
    type LedgerHealth,
    type LedgerPage,
    type WalletRow,
} from "@/services/finance";
import { EMPTY_LEDGER_FILTERS, LEDGER_AMOUNT, LEDGER_PAGE_SIZES, type LedgerFilters } from "./ledger-filters";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { LedgerView } from "./ledger-view";

interface Loaded {
    page: LedgerPage;
    health: LedgerHealth;
}

/**
 * The book, one server page at a time, with its health and the wallets it
 * can be narrowed to.
 *
 * Every filter is the server's, so a filter never hides a row on a page the
 * console has not read. The page is cursor-paged: `nextCursor` reaches the
 * next page and the cursors already used are kept as a stack, which is how
 * Previous steps back. Any change to the filters or the page size starts
 * again from the newest page.
 *
 * The health check is refetched with every page rather than cached, because
 * the one time it matters is the moment after something has been posted or
 * reversed — a stale green is the worst possible answer here.
 */
export function LedgerLoader() {
    const live = financeReadsApi();
    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? <LedgerDesk /> : <FinanceOffline what="A ledger posting" />}
        </div>
    );
}

function LedgerDesk() {
    const [filters, setFilters] = React.useState<LedgerFilters>(EMPTY_LEDGER_FILTERS);
    const [pageSize, setPageSize] = React.useState<number>(LEDGER_PAGE_SIZES[0]);

    const q = useDebounced(filters.q.trim(), 300);
    const amount = useDebounced(filters.amount.trim(), 300);
    const query = React.useMemo<LedgerFilter>(
        () => ({
            q: q || undefined,
            walletId: filters.walletId || undefined,
            kind: filters.kind.length ? filters.kind : undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
            amount: LEDGER_AMOUNT.test(amount) ? amount : undefined,
        }),
        [q, amount, filters.walletId, filters.kind, filters.from, filters.to]
    );
    const queryKey = `${JSON.stringify(query)}:${pageSize}`;

    /* The cursors used to reach the page on screen; the first page has none.
       Held against the query they were read under, so a new query starts over. */
    const [paging, setPaging] = React.useState<{ key: string; cursors: (string | null)[] }>({ key: queryKey, cursors: [null] });
    const cursors = paging.key === queryKey ? paging.cursors : [null];
    const cursor = cursors[cursors.length - 1] ?? null;

    const resource = useApiResource<Loaded>(`finance:ledger:${queryKey}:${cursor ?? ""}`, async () => {
        const [page, health] = await Promise.all([
            financeService.ledgerPage(query, { limit: pageSize, cursor }),
            financeService.verifyLedger(),
        ]);
        return { page, health };
    });

    const wallets = useApiResource<WalletRow[]>("finance:ledger:wallets", () => financeService.wallets());

    const nextCursor = resource.data?.page.nextCursor ?? null;

    return (
        <LedgerView
            page={resource.data?.page ?? null}
            health={resource.data?.health ?? null}
            loading={resource.loading}
            error={resource.error}
            onRetry={resource.reload}
            wallets={wallets.data ?? []}
            filters={filters}
            query={query}
            onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            onClear={() => setFilters(EMPTY_LEDGER_FILTERS)}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            pageIndex={cursors.length - 1}
            canPrevious={cursors.length > 1 && !resource.loading}
            canNext={nextCursor !== null && !resource.loading}
            onPrevious={() => setPaging({ key: queryKey, cursors: cursors.slice(0, -1) })}
            onNext={() => nextCursor && setPaging({ key: queryKey, cursors: [...cursors, nextCursor] })}
            onChanged={resource.reload}
        />
    );
}
