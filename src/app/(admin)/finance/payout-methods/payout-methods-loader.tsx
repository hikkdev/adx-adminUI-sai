"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    financeReadsApi,
    financeService,
    type PayoutMethod,
    type RailStatus,
} from "@/services/finance";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { PayoutMethodsView } from "./payout-methods-view";

interface Loaded {
    methods: PayoutMethod[];
    rails: RailStatus[];
}

/**
 * The queue and the rails, because which verification methods are actually
 * available is a property of the configured rails rather than of the account.
 * Asking for both here keeps the dialog from offering a penny drop no vendor
 * can perform.
 */
export function PayoutMethodsLoader() {
    const live = financeReadsApi();

    const resource = useApiResource<Loaded>(`finance:payout-methods:${live}`, async () => {
        if (!live) return { methods: [], rails: [] };
        const [methods, rails] = await Promise.all([
            financeService.pendingPayoutMethods(),
            financeService.rails(),
        ]);
        return { methods, rails };
    });

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(data) => (
                        <PayoutMethodsView
                            methods={data.methods}
                            rails={data.rails}
                            onChanged={resource.reload}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A party's bank account" />
            )}
        </div>
    );
}
