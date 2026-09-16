"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    financeReadsApi,
    financeService,
    type BankAccount,
    type BankLineMatchStatus,
    type BankStatementLine,
    type ListPage,
    type ReconciliationSummary,
    type StatementImport,
    type StatementProfile,
} from "@/services/finance";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { ReconciliationView, type ReconFilters } from "./reconciliation-view";

interface Static {
    accounts: BankAccount[];
    profiles: StatementProfile[];
}

interface Lines {
    lines: ListPage<BankStatementLine>;
    summary: ReconciliationSummary;
    /** Lot G (Q125): the account's past imports, newest first — what the Import facet lists and Export files one of. */
    imports: StatementImport[];
}

const PAGE_SIZE = 100;

const startOfDay = (date: string) => new Date(`${date}T00:00:00.000`).toISOString();
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999`).toISOString();

/**
 * Two reads with two lifetimes.
 *
 * The bank accounts and the statement profiles change when somebody adds one,
 * which is rarely; the lines and their summary change with every filter the
 * person touches. Keeping them apart means a chip click refetches a page of
 * lines and not the account picker behind it.
 *
 * The account in view defaults to the default account once the list is in —
 * derived, not stored, so there is no effect writing state after a fetch. An
 * explicit pick overrides it; "every account" is a pick too.
 */
export function ReconciliationLoader() {
    const live = financeReadsApi();
    const [filters, setFilters] = React.useState<ReconFilters>({
        bankAccountId: null,
        status: "all",
        importId: "",
        from: "",
        to: "",
        page: 1,
    });

    const statics = useApiResource<Static>(`finance:reconciliation:static:${live}`, async () => {
        if (!live) return { accounts: [], profiles: [] };
        const [accounts, profiles] = await Promise.all([
            financeService.bankAccounts(),
            financeService.reconciliation.profiles(),
        ]);
        return { accounts, profiles };
    });

    const accounts = statics.data?.accounts ?? [];
    const defaultAccountId = accounts.find((account) => account.isDefault)?.id ?? accounts[0]?.id ?? "";
    /* null = not yet chosen (the default applies); "" = every account. */
    const accountId = filters.bankAccountId === null ? defaultAccountId : filters.bankAccountId;
    const staticsReady = statics.data !== null;

    const key = `finance:reconciliation:lines:${live}:${staticsReady}:${accountId}:${filters.status}:${filters.importId}:${filters.from}:${filters.to}:${filters.page}`;
    const lines = useApiResource<Lines | null>(key, async () => {
        if (!live || !staticsReady) return null;
        const window = {
            bankAccountId: accountId || undefined,
            from: filters.from ? startOfDay(filters.from) : undefined,
            to: filters.to ? endOfDay(filters.to) : undefined,
        };
        const [page, summary, imports] = await Promise.all([
            financeService.reconciliation.lines({
                ...window,
                importId: filters.importId || undefined,
                status: filters.status === "all" ? undefined : [filters.status as BankLineMatchStatus],
                page: filters.page,
                pageSize: PAGE_SIZE,
            }),
            financeService.reconciliation.summary(window),
            financeService.reconciliation.imports({ bankAccountId: accountId || undefined, limit: 50 }),
        ]);
        return { lines: page, summary, imports };
    });

    /* An import adds lines; a profile is created inside the import dialog;
       both are cheap to re-read together. */
    const reload = () => {
        statics.reload();
        lines.reload();
    };

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={statics}>
                    {(data) => (
                        <ResourceBoundary resource={lines}>
                            {(loaded) =>
                                loaded ? (
                                    <ReconciliationView
                                        accounts={data.accounts}
                                        profiles={data.profiles}
                                        accountId={accountId}
                                        lines={loaded.lines}
                                        summary={loaded.summary}
                                        imports={loaded.imports}
                                        filters={filters}
                                        onFiltersChange={setFilters}
                                        onChanged={reload}
                                    />
                                ) : null
                            }
                        </ResourceBoundary>
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A bank statement" />
            )}
        </div>
    );
}
