"use client";

import * as React from "react";
import Link from "next/link";
import { LocateFixed, Minus, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterChips } from "@/components/adx/filter-chips";
import { MapSurface, type MapPoint } from "@/components/adx/map";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { cameraFor, cameraInto, stepZoom, type Camera } from "@/lib/map-geometry";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    AGENT_STATES,
    AGENT_STATE_META,
    ALERT_META,
    agentLocationsService,
    ageLabel,
    etaLabel,
    markerToneOf,
    type AgentState,
    type LiveAgent,
    type LiveFilter,
    type LiveSnapshot,
    type TrailView,
} from "@/services/agent-locations";
import type { StreamPhase } from "@/services/live-chat";
import type { MapsClientConfig } from "@/services/maps";

interface LiveMapViewProps {
    snapshot: LiveSnapshot | null;
    loading: boolean;
    error: string | null;
    phase: StreamPhase;
    filter: LiveFilter;
    onFilter: (filter: LiveFilter) => void;
    mapsConfig: MapsClientConfig | null;
    onRefresh: () => void;
}

type StateChip = AgentState | "ALL" | "ALERTS";

/** Bengaluru, the platform's first city, when no agent has a fix to centre on. */
const HOME: Camera = { latitude: 12.9716, longitude: 77.5946, zoom: 11 };

type LivePoint = MapPoint & { kind: "agent" | "trail" | "destination"; agentId: string };

/** The console route the trip's context opens. */
function tripHref(trip: NonNullable<LiveAgent["trip"]>): string | null {
    if (trip.orderId) return `/orders/${trip.orderId}`;
    if (trip.kind === "FIELD_VISIT") return `/visits/${trip.id}`;
    return null;
}

/**
 * LT-1: the live map. The map is the page — every agent with a fix is a
 * marker coloured by state or alert; the list beside it names each with
 * their trip, ETA, age of fix and alerts; a selected agent's trail is drawn
 * as a dotted line of fixes with the destination marked. State chips and
 * the side filter narrow the list; the stream keeps it moving.
 */
export function LiveMapView({ snapshot, loading, error, phase, filter, onFilter, mapsConfig, onRefresh }: LiveMapViewProps) {
    const [chip, setChip] = React.useState<StateChip>("ALL");
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState(filter.q ?? "");
    // The operator's camera, once they have moved it; until then the map frames the placed agents.
    const [ownCamera, setOwnCamera] = React.useState<Camera | null>(null);

    const agents = React.useMemo(() => {
        const rows = snapshot?.agents ?? [];
        if (chip === "ALL") return rows;
        if (chip === "ALERTS") return rows.filter((row) => row.alerts.length > 0);
        return rows.filter((row) => row.state === chip);
    }, [snapshot, chip]);

    const selected = agents.find((row) => row.agent.id === selectedId) ?? snapshot?.agents.find((row) => row.agent.id === selectedId) ?? null;
    const trail = useApiResource<TrailView | null>(`agent-locations:trail:${selectedId ?? "none"}:${selected?.fix?.at ?? ""}`, () => (selectedId ? agentLocationsService.trail(selectedId) : Promise.resolve(null)));

    // The frame around every placed agent, recomputed only when the set of placed agents changes
    // (not with every fix); the operator owns the camera from their first pan or zoom.
    const placedKey = (snapshot?.agents ?? []).filter((row) => row.fix).map((row) => row.agent.id).join(",");
    const autoCamera = React.useMemo<Camera>(() => {
        const placed = (snapshot?.agents ?? []).filter((row) => row.fix).map((row) => ({ id: row.agent.id, latitude: row.fix!.latitude, longitude: row.fix!.longitude }));
        return cameraFor(placed) ?? HOME;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placedKey]);
    const camera = ownCamera ?? autoCamera;
    const setCamera = React.useCallback((next: Camera | ((current: Camera) => Camera)) => setOwnCamera((current) => (typeof next === "function" ? next(current ?? autoCamera) : next)), [autoCamera]);

    const points = React.useMemo<LivePoint[]>(() => {
        const out: LivePoint[] = [];
        for (const row of agents) {
            if (!row.fix) continue;
            out.push({ id: row.agent.id, kind: "agent", agentId: row.agent.id, latitude: row.fix.latitude, longitude: row.fix.longitude, tone: markerToneOf(row), title: `${row.agent.name} · ${AGENT_STATE_META[row.state].label}` });
        }
        if (selected && trail.data) {
            // The trail's fixes, thinned to every third so a long trip does not bury the map, and the destination.
            trail.data.points.forEach((p, index) => {
                if (index % 3 !== 0 || index === trail.data!.points.length - 1) return;
                out.push({ id: `${selected.agent.id}:pt:${index}`, kind: "trail", agentId: selected.agent.id, latitude: p.latitude, longitude: p.longitude, tone: "neutral", title: `${selected.agent.name} at ${formatDateTime(p.at)}` });
            });
            if (trail.data.destination) {
                out.push({ id: `${selected.agent.id}:dest`, kind: "destination", agentId: selected.agent.id, latitude: trail.data.destination.latitude, longitude: trail.data.destination.longitude, tone: "info", title: trail.data.label ?? "Destination" });
            }
        }
        return out;
    }, [agents, selected, trail.data]);

    const counts = snapshot?.counts ?? { OFFLINE: 0, AVAILABLE: 0, TRAVELLING: 0, ON_SITE: 0, STILL: 0 };
    const chips: { value: StateChip; label: string; count?: number }[] = [
        { value: "ALL", label: "Everyone", count: snapshot?.agents.length ?? 0 },
        { value: "ALERTS", label: "Alerts", count: snapshot?.alerts ?? 0 },
        ...AGENT_STATES.map((state) => ({ value: state as StateChip, label: AGENT_STATE_META[state].label, count: counts[state] })),
    ];

    const select = (row: LiveAgent) => {
        setSelectedId(row.agent.id);
        if (row.fix) setCamera((current) => ({ latitude: row.fix!.latitude, longitude: row.fix!.longitude, zoom: Math.max(current.zoom, 14) }));
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Live map"
                subtitle="Where every working agent is — as the agent app reports it while open and on a job."
                actions={
                    <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1.5 text-xs", phase === "open" ? "text-success" : "text-muted-foreground")}>
                            <span className={cn("size-2 rounded-full", phase === "open" ? "bg-success" : phase === "connecting" ? "bg-warning" : "bg-muted-foreground")} />
                            {phase === "open" ? "Live" : phase === "connecting" ? "Connecting…" : "Polling"}
                            {snapshot ? ` · ${formatDateTime(snapshot.at)}` : ""}
                        </span>
                        <Button size="sm" variant="outline" onClick={onRefresh}>
                            <RefreshCw className="mr-1.5 size-3.5" /> Refresh
                        </Button>
                    </div>
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <FilterChips<StateChip> chips={chips} value={chip} onChange={setChip} />
                <div className="flex items-center gap-2">
                    <Select value={filter.side ?? "ALL"} onValueChange={(value) => onFilter({ ...filter, side: value === "ALL" ? undefined : (value as "PUBLISHER" | "ADVERTISER") })}>
                        <SelectTrigger className="h-9 w-[150px]" aria-label="Side">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Both sides</SelectItem>
                            <SelectItem value="PUBLISHER">Field agents</SelectItem>
                            <SelectItem value="ADVERTISER">Sales agents</SelectItem>
                        </SelectContent>
                    </Select>
                    <form
                        className="relative"
                        onSubmit={(event) => {
                            event.preventDefault();
                            onFilter({ ...filter, q: draft.trim() || undefined });
                        }}
                    >
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Name, id or mobile" className="h-9 w-52 pl-8" aria-label="Search agents" />
                        {filter.q ? (
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                                aria-label="Clear search"
                                onClick={() => {
                                    setDraft("");
                                    onFilter({ ...filter, q: undefined });
                                }}
                            >
                                <X className="size-3.5" />
                            </button>
                        ) : null}
                    </form>
                </div>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                <Card className="relative min-h-[600px] overflow-hidden rounded-lg border-border shadow-none">
                    <div className="absolute inset-0">
                        <MapSurface<LivePoint>
                            config={mapsConfig}
                            points={points}
                            camera={camera}
                            onCameraChange={setCamera}
                            selectedId={selectedId}
                            onSelect={(point) => {
                                const row = snapshot?.agents.find((r) => r.agent.id === point.agentId);
                                if (row) select(row);
                            }}
                            onClusterClick={(cluster) => setCamera(cameraInto(cluster, camera.zoom))}
                            caption="Every agent with a fix, coloured by state — red for late or gone dark, amber for idle or off route. A marker opens the agent; their trail and destination are drawn."
                        />
                    </div>
                    <div className="absolute right-4 top-4 z-10 flex flex-col overflow-hidden rounded-md border bg-card shadow-sm">
                        <button type="button" aria-label="Zoom in" className="flex size-8 items-center justify-center border-b transition-colors hover:bg-muted" onClick={() => setCamera((current) => ({ ...current, zoom: stepZoom(current.zoom, 1) }))}>
                            <Plus className="size-4" />
                        </button>
                        <button type="button" aria-label="Zoom out" className="flex size-8 items-center justify-center border-b transition-colors hover:bg-muted" onClick={() => setCamera((current) => ({ ...current, zoom: stepZoom(current.zoom, -1) }))}>
                            <Minus className="size-4" />
                        </button>
                        <button
                            type="button"
                            aria-label="Frame everyone"
                            className="flex size-8 items-center justify-center transition-colors hover:bg-muted"
                            onClick={() => {
                                const placed = (snapshot?.agents ?? []).filter((row) => row.fix).map((row) => ({ id: row.agent.id, latitude: row.fix!.latitude, longitude: row.fix!.longitude }));
                                setCamera(cameraFor(placed) ?? HOME);
                            }}
                        >
                            <LocateFixed className="size-4" />
                        </button>
                    </div>
                    {selected ? <SelectedCard row={selected} trail={trail.data ?? null} onClose={() => setSelectedId(null)} /> : null}
                </Card>

                <Card className="max-h-[600px] overflow-y-auto rounded-lg border-border shadow-none">
                    {loading ? (
                        <p className="p-4 text-sm text-muted-foreground">Reading the fleet…</p>
                    ) : agents.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">{snapshot ? "Nobody matches." : "No agents yet."}</p>
                    ) : (
                        <ul className="divide-y">
                            {agents.map((row) => (
                                <li key={row.agent.id}>
                                    <button type="button" className={cn("w-full px-4 py-3 text-left transition-colors hover:bg-muted/50", selectedId === row.agent.id && "bg-muted/60")} onClick={() => select(row)} data-testid={`live-agent-${row.agent.id}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium">{row.agent.name}</span>
                                            <StatusBadge status={AGENT_STATE_META[row.state]} />
                                        </div>
                                        <div className="mt-0.5 text-xs text-muted-foreground">
                                            {row.agent.displayId ?? "—"} · {row.agent.sides.map((side) => (side === "PUBLISHER" ? "field" : "sales")).join(" + ")}
                                            {row.agent.city ? ` · ${row.agent.city}` : ""}
                                            {row.fix ? ` · fix ${ageLabel(row.fix.ageSec)}` : " · no fix"}
                                        </div>
                                        {row.trip ? (
                                            <div className="mt-1 text-xs">
                                                <span className="text-foreground">{row.trip.label}</span>
                                                {row.trip.arrivedAt ? <span className="text-success"> · arrived</span> : etaLabel(row.trip.eta) ? <span className="text-muted-foreground"> · {etaLabel(row.trip.eta)}</span> : null}
                                            </div>
                                        ) : null}
                                        {row.alerts.length > 0 ? (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {row.alerts.map((alert) => (
                                                    <StatusBadge key={alert.kind} status={ALERT_META[alert.kind]} />
                                                ))}
                                            </div>
                                        ) : null}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </div>
    );
}

function SelectedCard({ row, trail, onClose }: { row: LiveAgent; trail: TrailView | null; onClose: () => void }) {
    const href = row.trip ? tripHref(row.trip) : null;
    return (
        <div className="absolute bottom-4 left-4 z-10 w-[340px] max-w-[calc(100%-2rem)] rounded-md border bg-card p-3 text-sm shadow-sm" data-testid="live-selected">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <Link href={`/agents/${row.agent.id}`} className="font-medium hover:underline">
                        {row.agent.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                        {row.agent.displayId ?? "—"} · {row.agent.mobile}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <StatusBadge status={AGENT_STATE_META[row.state]} />
                    <button type="button" aria-label="Close" className="text-muted-foreground hover:text-foreground" onClick={onClose}>
                        <X className="size-4" />
                    </button>
                </div>
            </div>
            {row.fix ? (
                <div className="mt-2 text-xs text-muted-foreground">
                    Fix {ageLabel(row.fix.ageSec)}
                    {row.fix.speed !== null ? ` · ${Math.round(row.fix.speed * 3.6)} km/h` : ""}
                    {row.fix.accuracy !== null ? ` · ±${Math.round(row.fix.accuracy)} m` : ""}
                </div>
            ) : (
                <div className="mt-2 text-xs text-muted-foreground">No position on record.</div>
            )}
            {row.trip ? (
                <div className="mt-2 rounded bg-muted/50 px-2 py-1.5 text-xs">
                    <div className="font-medium text-foreground">{href ? <Link href={href} className="hover:underline">{row.trip.label}</Link> : row.trip.label}</div>
                    <div className="text-muted-foreground">
                        {row.trip.slotAt ? `Slot ${formatDateTime(row.trip.slotAt)} · ` : ""}
                        {row.trip.arrivedAt ? `arrived ${formatDateTime(row.trip.arrivedAt)}` : (etaLabel(row.trip.eta) ?? "no destination on record")}
                    </div>
                    {trail ? (
                        <div className="text-muted-foreground">
                            Trail since {formatDateTime(trail.startedAt)} · {trail.pointCount} fixes · {trail.distanceM >= 1000 ? `${(trail.distanceM / 1000).toFixed(1)} km` : `${trail.distanceM} m`}
                        </div>
                    ) : null}
                </div>
            ) : null}
            {row.alerts.length > 0 ? (
                <ul className="mt-2 space-y-1">
                    {row.alerts.map((alert) => (
                        <li key={alert.kind} className="flex items-start gap-2 text-xs">
                            <StatusBadge status={ALERT_META[alert.kind]} />
                            <span className="text-muted-foreground">{alert.detail}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
