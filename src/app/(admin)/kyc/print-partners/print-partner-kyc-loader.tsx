"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { kycStateFilter } from "@/services/kyc-state";
import { printPartnerKycService, type PrintPartnerKycQueue } from "@/services/print-partner-kyc";
import { useStateChip } from "../_shared/use-state-chip";
import { PrintPartnerKycQueueView } from "./print-partner-kyc-queue";

export interface LoadedPartnerQueue {
    /** The chip in force, from the server. */
    visible: PrintPartnerKycQueue;
    /** Every partner on the queue, for the header's counts and the SLA across it. */
    everything: PrintPartnerKycQueue;
}

/**
 * The queue from `GET /print-partner-kyc`, read on the client with the chip
 * in force sent as the server's own facet — N3-C: `?state=` for one of the
 * six party states, `?escalated=true` for the flag, the chip kept in the
 * URL. The unfiltered queue is read beside it for the header; the counts
 * per state are the server's, counted with the facet removed.
 */
export function PrintPartnerKycLoader() {
    const live = isLive("kyc");
    const [chip, setChip] = useStateChip();

    const resource = useApiResource<LoadedPartnerQueue>(`print-partner-kyc:queue:${chip}:${live}`, async () => {
        const [everything, visible] = await Promise.all([
            printPartnerKycService.queue(),
            chip === "all" ? Promise.resolve(null) : printPartnerKycService.queue(kycStateFilter(chip)),
        ]);
        return { everything, visible: visible ?? everything };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    Print partner KYC is read from the API and has no fixtures. Turn the KYC domain on to see what is waiting.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <PrintPartnerKycQueueView loaded={data} chip={chip} onChip={setChip} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
