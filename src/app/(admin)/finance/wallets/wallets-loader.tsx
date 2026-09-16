"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { financeReadsApi, financeService, type WalletKind, type WalletRow } from "@/services/finance";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { WalletsTable } from "./wallets-table";

/**
 * The kind filter lives here rather than in the table, because it is part of
 * the request: it goes into the resource key, so changing it refetches instead
 * of hiding rows the server never sent.
 */
export function WalletsLoader() {
    const live = financeReadsApi();
    const [kind, setKind] = React.useState<WalletKind | "ALL">("ALL");

    const resource = useApiResource<WalletRow[]>(`finance:wallets:${kind}:${live}`, () =>
        live ? financeService.wallets(kind === "ALL" ? {} : { kind }) : Promise.resolve([])
    );

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(wallets) => (
                        <WalletsTable wallets={wallets} kind={kind} onKindChange={setKind} />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A wallet balance" />
            )}
        </div>
    );
}
