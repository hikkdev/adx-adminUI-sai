"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { agentService, type AgentSummary } from "@/services/agents";
import { leadsService, type LeadHeat, type LeadMapView, type MapBBox, type MapQuery, type PriorityZone, type Territory } from "@/services/leads";
import { mapsService, type MapsClientConfig } from "@/services/maps";
import { LeadsOffline } from "../leads-offline";
import { MapView, type MapFilter } from "./map-view";

/** The viewport is asked for this long after the last move settles. */
const SETTLE_MS = 350;

/** A bbox rounded to what the server sees, so two moves that agree do not ask twice. */
const boxKey = (box: MapBBox | null): string => (box ? [box.south, box.west, box.north, box.east].map((n) => n.toFixed(4)).join(",") : "none");

/**
 * LH5: the hunting map's data — the viewport (`GET /leads/map`) after every
 * settled move with the desk's filters, the heat when it is on, the
 * territories and zones for the side panes, the roster for the assign
 * dialogs. The map's own component draws.
 */
export function MapLoader() {
    const live = isLive("leads");
    const [bounds, setBounds] = React.useState<MapBBox | null>(null);
    const [settled, setSettled] = React.useState<MapBBox | null>(null);
    const [filter, setFilter] = React.useState<MapFilter>({ heat: false, plotAll: false });
    const [nonce, setNonce] = React.useState(0);

    React.useEffect(() => {
        if (!bounds) return undefined;
        const timer = setTimeout(() => setSettled(bounds), SETTLE_MS);
        return () => clearTimeout(timer);
    }, [bounds]);

    const key = boxKey(settled);
    const filterKey = JSON.stringify(filter);
    const query = React.useMemo<MapQuery | null>(
        () =>
            settled
                ? {
                      bbox: settled,
                      ...(filter.side ? { side: filter.side } : {}),
                      ...(filter.temperature ? { temperature: filter.temperature } : {}),
                      ...(filter.priority ? { priority: true } : {}),
                      ...(filter.claimed ? { claimed: filter.claimed } : {}),
                      ...(filter.plotAll ? { pins: true } : {}),
                  }
                : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the keys are the query, spelled out
        [key, filterKey],
    );

    const maps = useApiResource<MapsClientConfig | null>(`maps:client:${live}`, () => (live ? mapsService.clientConfig().catch(() => null) : Promise.resolve(null)));
    const view = useApiResource<LeadMapView | null>(`leads:map:${key}:${filterKey}:${nonce}`, () => (live && query ? leadsService.map(query) : Promise.resolve(null)));
    const heat = useApiResource<LeadHeat | null>(`leads:heat:${key}:${filter.side ?? "ALL"}:${filter.heat}`, () => (live && settled && filter.heat ? leadsService.heat(settled, filter.side) : Promise.resolve(null)));
    const territories = useApiResource<Territory[]>(`leads:territories:${live}:${nonce}`, () => (live ? leadsService.territories() : Promise.resolve([])));
    const zones = useApiResource<PriorityZone[]>(`leads:zones:${live}:${nonce}`, () => (live ? leadsService.priorityZones() : Promise.resolve([])));
    const roster = useApiResource<AgentSummary[]>(`leads:agents:${live}`, () => (live ? agentService.list() : Promise.resolve([])));

    if (!live) return <LeadsOffline />;

    return (
        <MapView
            mapsConfig={maps.data ?? null}
            view={view.data ?? null}
            loading={view.loading}
            error={view.error}
            heat={filter.heat ? (heat.data ?? null) : null}
            territories={territories.data ?? []}
            zones={zones.data ?? []}
            agents={roster.data ?? []}
            filter={filter}
            onFilter={setFilter}
            onBounds={setBounds}
            onChanged={() => setNonce((n) => n + 1)}
        />
    );
}
