"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { useApiResource } from "@/lib/use-api-resource";
import { agentLocationsService, liveMapReadApi, type LiveFilter, type LiveSnapshot } from "@/services/agent-locations";
import { mapsService, type MapsClientConfig } from "@/services/maps";
import type { StreamPhase } from "@/services/live-chat";
import { LiveMapView } from "./live-map-view";

/**
 * LT-1: the live map's data — the first snapshot by GET, then the SSE
 * stream (a `snapshot` whenever the map would change), a poll every 30 s
 * while the stream is down. The filter is the stream's too: a change
 * reopens it.
 */
export function LiveMapLoader() {
    const live = liveMapReadApi();
    const [filter, setFilter] = React.useState<LiveFilter>({});
    const filterKey = JSON.stringify(filter);
    // What the stream (or the poll) last sent, tagged with the filter it answered; a
    // snapshot for another filter is stale and the GET for the new one shows instead.
    const [streamed, setStreamed] = React.useState<{ key: string; snapshot: LiveSnapshot } | null>(null);
    const [phase, setPhase] = React.useState<StreamPhase>("closed");
    const phaseRef = React.useRef<StreamPhase>("closed");

    const maps = useApiResource<MapsClientConfig | null>(`maps:client:${live}`, () => (live ? mapsService.clientConfig().catch(() => null) : Promise.resolve(null)));
    const first = useApiResource<LiveSnapshot | null>(`agent-locations:live:${live}:${filterKey}`, () => (live ? agentLocationsService.live(filter) : Promise.resolve(null)));

    const snapshot = (streamed && streamed.key === filterKey ? streamed.snapshot : null) ?? first.data ?? null;

    React.useEffect(() => {
        if (!live) return undefined;
        const key = filterKey;
        const onSnapshot = (next: LiveSnapshot) => setStreamed({ key, snapshot: next });
        const handle = agentLocationsService.stream(filter, onSnapshot, {
            onPhase: (next) => {
                phaseRef.current = next;
                setPhase(next);
            },
        });
        // While the stream is not open, a slow poll keeps the map honest.
        const poll = setInterval(() => {
            if (phaseRef.current !== "open") void agentLocationsService.live(filter).then(onSnapshot).catch(() => undefined);
        }, 30_000);
        return () => {
            handle.close();
            clearInterval(poll);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live, filterKey]);

    if (!live) {
        return (
            <div className="space-y-5">
                <PageHeader title="Live map" subtitle="Where every working agent is — states, alerts, trails and ETAs, as the agent app reports them." />
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                        <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        The live map draws people's real positions. There is no fixture for it: set{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the console at a running backend.
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <LiveMapView
            snapshot={snapshot}
            loading={first.loading && !snapshot}
            error={first.error}
            phase={phase}
            filter={filter}
            onFilter={setFilter}
            mapsConfig={maps.data ?? null}
            onRefresh={() => {
                const key = filterKey;
                void agentLocationsService.live(filter).then((next) => setStreamed({ key, snapshot: next })).catch(() => undefined);
            }}
        />
    );
}
