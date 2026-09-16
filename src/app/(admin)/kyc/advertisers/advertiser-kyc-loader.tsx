"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { advertiserKycService, type AdvertiserKycQueue } from "@/services/advertiser-kyc";
import { kycStateFilter } from "@/services/kyc-state";
import { useStateChip } from "../_shared/use-state-chip";
import { AdvertiserKycView } from "./advertiser-kyc-view";

export interface LoadedAdvertiserQueue {
    /** The chip in force, from the server. */
    visible: AdvertiserKycQueue;
    /** Every advertiser on the queue, for the header's counts and the SLA across it. */
    everything: AdvertiserKycQueue;
}

/**
 * Every advertiser, from `GET /advertiser-kyc` — N3-B: the queue lists
 * PARTIES (every Advertiser profile not yet verified plus every one with a
 * record), each in one of six states; N3-C: the chip in force is sent as
 * `?state=` (or `?escalated=true`) and kept in the URL, the unfiltered
 * queue read beside it for the header. G11-1: an escalation's people are
 * named on the row, so nothing is read beside the queue.
 */
export function AdvertiserKycLoader() {
    const live = isLive("kyc");
    const [chip, setChip] = useStateChip();
    const resource = useApiResource<LoadedAdvertiserQueue>(`advertiser-kyc:${live}:${chip}`, async () => {
        const [everything, visible] = await Promise.all([
            advertiserKycService.queue(),
            chip === "all" ? Promise.resolve(null) : advertiserKycService.queue(kycStateFilter(chip)),
        ]);
        return { everything, visible: visible ?? everything };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    Advertiser KYC is read from the API and has no fixtures. Turn the KYC domain on to see what is waiting.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <AdvertiserKycView loaded={data} chip={chip} onChip={setChip} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
