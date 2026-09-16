"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { kycService, type KycQueue } from "@/services/kyc";
import { kycStateFilter } from "@/services/kyc-state";
import { settingsService } from "@/services/settings";
import { useStateChip } from "./_shared/use-state-chip";
import { KycQueueView } from "./kyc-queue";

export interface LoadedQueue {
    /** The chip in force, from the server. */
    visible: KycQueue;
    /** Every party on the queue, for the header's counts and the SLA across it. */
    everything: KycQueue;
    /**
     * Lot G (Q127/142): `kyc.escalationSlaMultiplier` off the platform
     * settings row, so the SLA column can say when the nightly sweep
     * escalates a case on its own. Null when the settings read failed —
     * the column then says nothing rather than guessing.
     */
    escalationSlaMultiplier: number | null;
}

/**
 * The queue from `GET /publishers/kyc-queue`, read on the client with the
 * chip in force sent as the server's own facet — N3-C: `?state=` for one
 * of the six party states, `?escalated=true` for the flag, the chip kept
 * in the URL. The unfiltered queue is read beside it for the header (the
 * counts per state come with either read, counted with the facet
 * removed; the breach count and the SLA are the whole queue's). Lot G:
 * the escalation multiplier comes off `GET /settings/platform`, tolerated
 * failing — the queue still draws without it.
 */
export function KycQueueLoader() {
    const live = isLive("kyc");
    const [chip, setChip] = useStateChip();

    const resource = useApiResource<LoadedQueue>(`kyc:queue:${chip}:${live}`, async () => {
        const [everything, visible, settings] = await Promise.all([
            kycService.queue(),
            chip === "all" ? Promise.resolve(null) : kycService.queue(kycStateFilter(chip)),
            settingsService.get().catch(() => null),
        ]);
        return {
            everything,
            visible: visible ?? everything,
            escalationSlaMultiplier: settings?.kyc.escalationSlaMultiplier ?? null,
        };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    The KYC queue is read from the API and has no fixtures. Turn the KYC domain on to see what is waiting.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => <KycQueueView loaded={data} chip={chip} onChip={setChip} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
