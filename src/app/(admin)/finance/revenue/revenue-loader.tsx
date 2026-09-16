"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { financeReadsApi } from "@/services/finance";
import { pricingService } from "@/services/pricing";
import { revenueService } from "@/services/revenue";
import type { MediaType } from "@/types/pricing-engine";
import type { CommissionRate, FeeSchedule, TaxSettings } from "@/types/revenue";
import { FinanceNav } from "../finance-nav";
import { RevenueView } from "./revenue-view";

/**
 * No fixture fallback, for the same reason the pricing engine has none: every
 * number here is what somebody is actually charged or paid, and a seeded take
 * rate on screen would be indistinguishable from the real one.
 *
 * Gated on `financeReadsApi()` like the rest of the finance section rather
 * than on the pricing engine's flag: this is a finance screen that happens to
 * read one pricing list (the media types a rate may be keyed on), not a
 * pricing screen.
 */
export function RevenueLoader() {
    const live = financeReadsApi();
    const resource = useApiResource<{
        rates: CommissionRate[];
        fees: FeeSchedule[];
        tax: TaxSettings | null;
        mediaTypes: MediaType[];
    }>(`revenue:settings:${live}`, async () => {
        if (!live) return { rates: [], fees: [], tax: null, mediaTypes: [] };
        const [rates, fees, tax, mediaTypes] = await Promise.all([
            revenueService.commissionRates(),
            revenueService.fees(true),
            revenueService.tax(),
            /* The same list the pricing screens read. A failed read leaves the
               rates standing and the picker says so, rather than the page. */
            pricingService.mediaTypes().catch(() => [] as MediaType[]),
        ]);
        return { rates, fees, tax, mediaTypes };
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="Commission & fees"
                subtitle="What ADX takes from a publisher, and what an advertiser pays on top."
            />
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(data) => <RevenueView {...data} onChanged={resource.reload} />}
                </ResourceBoundary>
            ) : (
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                        <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">
                        Not connected to the revenue service
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        These are real take rates and real charges. A seeded stand-in would look
                        exactly like the live figure, so nothing is shown without a backend.
                    </p>
                </Card>
            )}
        </div>
    );
}
