"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    financeReadsApi,
    financeService,
    type WalletDetail as Wallet,
    type WalletEntry,
} from "@/services/finance";
import { FinanceNav } from "../../finance-nav";
import { FinanceOffline } from "../../finance-offline";
import { WalletDetail } from "./wallet-detail";

interface Loaded {
    wallet: Wallet | null;
    entries: WalletEntry[];
}

/**
 * The wallet and its statement, fetched together.
 *
 * The statement is a second endpoint rather than part of the snapshot because
 * it is paged on the server; a hundred lines is enough for the tab and small
 * enough not to slow the summary down.
 */
export function WalletLoader({ id }: { id: string }) {
    const live = financeReadsApi();

    const resource = useApiResource<Loaded>(`finance:wallet-detail:${id}:${live}`, async () => {
        if (!live) return { wallet: null, entries: [] };
        const wallet = await financeService.wallet(id);
        if (!wallet) return { wallet: null, entries: [] };
        // Only worth asking for once the wallet is known to exist.
        const entries = await financeService.walletEntries(id);
        return { wallet, entries };
    });

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(data) => {
                        if (!data.wallet) notFound();
                        return <WalletDetail wallet={data.wallet} entries={data.entries} />;
                    }}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A wallet balance" />
            )}
        </div>
    );
}
