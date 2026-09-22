"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { outreachService, type AdapterState, type LeadSequence, type OutreachChannel } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { SequencesView } from "./sequences-view";

export interface SequencesData {
    sequences: LeadSequence[];
    /** Every adapter's state, so a step on a channel with no card is flagged; null on a backend without the read. */
    channels: Record<OutreachChannel, AdapterState> | null;
}

export function SequencesLoader() {
    const live = isLive("leads");
    const resource = useApiResource<SequencesData>(`leads:sequences:${live}`, async () => {
        const [sequences, channels] = await Promise.all([outreachService.sequences(), outreachService.channels().catch(() => null)]);
        return { sequences, channels };
    });
    if (!live) return <LeadsOffline />;
    return <ResourceBoundary resource={resource}>{(data) => <SequencesView data={data} onChanged={resource.reload} />}</ResourceBoundary>;
}
