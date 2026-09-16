"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    financeReadsApi,
    financeService,
    type LedgerHealth,
    type LedgerTransaction,
    type WalletRow,
} from "@/services/finance";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { LedgerView } from "./ledger-view";

interface Loaded {
    transactions: LedgerTransaction[];
    health: LedgerHealth;
    wallets: WalletRow[];
}

/**
 * The book, its health, and the wallets it can be filtered to.
 *
 * The health check is refetched with the transactions rather than cached,
 * because the one time it matters is the moment after something has been
 * posted or reversed — a stale green is the worst possible answer here.
 *
 * The wallet filter goes into the resource key, so choosing a party refetches
 * the server's answer rather than filtering a capped page on the client.
 */
export function LedgerLoader() {
    const live = financeReadsApi();
    const [walletId, setWalletId] = React.useState("");

    const resource = useApiResource<Loaded>(`finance:ledger:${walletId}:${live}`, async () => {
        if (!live) return { transactions: [], health: { unbalanced: [], drift: [], healthy: true }, wallets: [] };
        const [transactions, health, wallets] = await Promise.all([
            financeService.ledger(walletId ? { walletId } : {}),
            financeService.verifyLedger(),
            financeService.wallets(),
        ]);
        return { transactions, health, wallets };
    });

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(data) => (
                        <LedgerView
                            transactions={data.transactions}
                            health={data.health}
                            wallets={data.wallets}
                            walletId={walletId}
                            onWalletChange={setWalletId}
                            onChanged={resource.reload}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A ledger posting" />
            )}
        </div>
    );
}
