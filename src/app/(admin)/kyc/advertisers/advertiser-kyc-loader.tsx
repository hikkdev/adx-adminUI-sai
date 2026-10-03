"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { advertiserKycService, type AdvertiserKycQueue } from "@/services/advertiser-kyc";
import { kycStateFilter } from "@/services/kyc-state";
import { useShowInactive } from "../_shared/show-inactive";
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
    /* 2 Oct 2026: working accounts only, unless the switch asks for the inactive too. */
    const [inactive, setInactive] = useShowInactive();
    const router = useRouter();
    /* 2 Oct 2026: a case used to open in a pane beside the list; a link that named one (`?case=`, `?id=`) now goes to its page. */
    const params = useSearchParams();
    const caseId = params.get("case") ?? params.get("id");
    React.useEffect(() => {
        if (caseId) router.replace(`/kyc/advertisers/${encodeURIComponent(caseId)}`);
    }, [caseId, router]);
    const resource = useApiResource<LoadedAdvertiserQueue>(`advertiser-kyc:${live}:${chip}:${inactive}`, async () => {
        const [everything, visible] = await Promise.all([
            advertiserKycService.queue({ includeInactive: inactive }),
            chip === "all" ? Promise.resolve(null) : advertiserKycService.queue({ ...kycStateFilter(chip), includeInactive: inactive }),
        ]);
        return { everything, visible: visible ?? everything };
    });

    if (caseId) return null;

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
            {(data) => <AdvertiserKycView loaded={data} chip={chip} onChip={setChip} showInactive={inactive} onShowInactive={setInactive} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
