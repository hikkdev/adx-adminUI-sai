"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Flame, Layers, Minus, PenLine, Plus, RefreshCw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FilterChips } from "@/components/adx/filter-chips";
import { MapSurface, type MapBounds, type MapCell, type MapPoint, type MapPolygon, type MarkerTone } from "@/components/adx/map";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { cameraInto, stepZoom, type Camera } from "@/lib/map-geometry";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { agentLabel, type AgentSummary } from "@/services/agents";
import {
    LEAD_SIDE_LABEL,
    STAGE_META,
    TEMPERATURE_META,
    leadsService,
    ringCentre,
    temperatureMeta,
    zoneBudgetUsed,
    zoneState,
    type LeadHeat,
    type LeadMapView,
    type LeadSide,
    type LeadTemperature,
    type MapPin,
    type PriorityZone,
    type Ring,
    type Territory,
} from "@/services/leads";
import type { MapsClientConfig } from "@/services/maps";
import { ZoneDialog } from "../priority-zones/zone-dialog";
import { TerritoryDialog } from "../territories/territory-dialog";

export interface MapFilter {
    side?: LeadSide;
    temperature?: LeadTemperature;
    claimed?: "MINE" | "OPEN" | "ANY";
    priority?: boolean;
    heat: boolean;
    /** The desk's bulk plot: every pin even when the viewport would cluster. */
    plotAll: boolean;
}

interface MapViewProps {
    mapsConfig: MapsClientConfig | null;
    view: LeadMapView | null;
    loading: boolean;
    error: string | null;
    heat: LeadHeat | null;
    territories: Territory[];
    zones: PriorityZone[];
    agents: AgentSummary[];
    filter: MapFilter;
    onFilter: (filter: MapFilter) => void;
    onBounds: (bounds: MapBounds) => void;
    onChanged: () => void;
}

type TempChip = LeadTemperature | "ALL";

/** Bengaluru, the platform's first city; zoom 13 is a district — the map opens on clusters and a zoom in gives pins. */
const HOME: Camera = { latitude: 12.9716, longitude: 77.5946, zoom: 13 };

type LeadPoint = MapPoint & { kind: "pin" | "cluster"; pin?: MapPin; count?: number };

const TEMP_TONE: Record<LeadTemperature, MarkerTone> = { HOT: "danger", WARM: "warning", COLD: "neutral" };

/** The dot's colour: temperature, with "info" for a lead somebody holds. */
export function pinTone(pin: Pick<MapPin, "temperature" | "claim">): MarkerTone {
    if (pin.claim) return "info";
    return pin.temperature ? TEMP_TONE[pin.temperature] : "neutral";
}

/** A cluster's colour: whichever temperature it has most of. */
export function clusterTone(cluster: { hot: number; warm: number; cold: number }): MarkerTone {
    if (cluster.hot >= cluster.warm && cluster.hot >= cluster.cold && cluster.hot > 0) return "danger";
    if (cluster.warm >= cluster.cold && cluster.warm > 0) return "warning";
    return "neutral";
}

/** The heat's cells scaled to 0..1 against the warmest one in view. */
export function heatCells(heat: LeadHeat | null): MapCell[] {
    if (!heat || heat.cells.length === 0) return [];
    const max = Math.max(...heat.cells.map((cell) => cell.weight), 1);
    return heat.cells
        .filter((cell) => cell.weight > 0)
        .map((cell) => ({
            id: `${cell.latitude.toFixed(4)}:${cell.longitude.toFixed(4)}`,
            latitude: cell.latitude,
            longitude: cell.longitude,
            sizeDeg: heat.cellDeg,
            weight: cell.weight / max,
            title: `${cell.demand} demand · ${cell.supply} supply`,
        }));
}

/**
 * LH5: the ops map. Every open lead in view — clusters over a district,
 * pins over a locality — coloured by temperature (blue when held); the
 * heat as tinted cells; territories and zones as outlines; a draw tool
 * whose ring becomes an assignment, a territory or a zone.
 */
export function MapView({ mapsConfig, view, loading, error, heat, territories, zones, agents, filter, onFilter, onBounds, onChanged }: MapViewProps) {
    const [camera, setCamera] = React.useState<Camera>(HOME);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [layers, setLayers] = React.useState({ territories: true, zones: true });
    const [drawing, setDrawing] = React.useState(false);
    const [ring, setRing] = React.useState<Ring>([]);
    const [dialog, setDialog] = React.useState<"assign" | "territory" | "zone" | null>(null);

    const points = React.useMemo<LeadPoint[]>(() => {
        if (!view) return [];
        if (view.mode === "PINS") {
            return view.pins.map((pin) => ({
                id: pin.id,
                kind: "pin",
                pin,
                latitude: pin.latitude,
                longitude: pin.longitude,
                tone: pinTone(pin),
                title: `${pin.businessName} · ${temperatureMeta(pin.temperature).label}${pin.claim ? " · held" : ""}`,
            }));
        }
        return view.clusters.map((cluster, index) => ({
            id: `cluster:${index}`,
            kind: "cluster",
            count: cluster.count,
            latitude: cluster.latitude,
            longitude: cluster.longitude,
            tone: clusterTone(cluster),
            title: `${cluster.label.toLowerCase()} · ${cluster.hot} hot`,
        }));
    }, [view]);

    const polygons = React.useMemo<MapPolygon[]>(() => {
        const out: MapPolygon[] = [];
        if (layers.territories) for (const row of territories.filter((t) => t.isActive)) out.push({ id: `territory:${row.id}`, ring: row.polygon, tone: "info", title: row.name });
        if (layers.zones) for (const row of zones.filter((z) => z.polygon && zoneState(z).state === "LIVE")) out.push({ id: `zone:${row.id}`, ring: row.polygon!, tone: "warning", title: row.name, dashed: true });
        if (ring.length >= 2) out.push({ id: "drawing", ring, tone: "success", title: "Drawing", dashed: true });
        return out;
    }, [territories, zones, layers, ring]);

    const cells = React.useMemo(() => heatCells(heat), [heat]);
    const selected = view?.mode === "PINS" ? (view.pins.find((pin) => pin.id === selectedId) ?? null) : null;

    const chips: { value: TempChip; label: string; count?: number }[] = [
        { value: "ALL", label: "All", count: view?.total },
        ...(["HOT", "WARM", "COLD"] as LeadTemperature[]).map((t) => ({ value: t as TempChip, label: TEMPERATURE_META[t].label })),
    ];

    const stopDrawing = () => {
        setDrawing(false);
        setRing([]);
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Hunting map"
                subtitle="Every open lead in view, coloured by temperature — zoom in for pins. Draw an area to assign it, keep it as a territory, or make it a priority zone."
                actions={
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                            <Link href="/leads/territories">Territories</Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                            <Link href="/leads/priority-zones">Priority zones</Link>
                        </Button>
                        <Button size="sm" variant="outline" onClick={onChanged}>
                            <RefreshCw className="mr-1.5 size-3.5" /> Refresh
                        </Button>
                    </div>
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <FilterChips<TempChip> chips={chips} value={filter.temperature ?? "ALL"} onChange={(value) => onFilter({ ...filter, temperature: value === "ALL" ? undefined : value })} />
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={filter.side ?? "ALL"} onValueChange={(value) => onFilter({ ...filter, side: value === "ALL" ? undefined : (value as LeadSide) })}>
                        <SelectTrigger className="h-9 w-[150px]" aria-label="Side">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Both sides</SelectItem>
                            <SelectItem value="PUBLISHER">{LEAD_SIDE_LABEL.PUBLISHER}</SelectItem>
                            <SelectItem value="ADVERTISER">{LEAD_SIDE_LABEL.ADVERTISER}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filter.claimed ?? "ANY"} onValueChange={(value) => onFilter({ ...filter, claimed: value === "ANY" ? undefined : (value as "OPEN" | "MINE") })}>
                        <SelectTrigger className="h-9 w-[130px]" aria-label="Held">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ANY">Held or not</SelectItem>
                            <SelectItem value="OPEN">Open only</SelectItem>
                        </SelectContent>
                    </Select>
                    <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
                        <Switch checked={Boolean(filter.priority)} onCheckedChange={(value) => onFilter({ ...filter, priority: value || undefined })} aria-label="In a priority zone" />
                        In a zone
                    </label>
                    <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
                        <Switch checked={filter.heat} onCheckedChange={(value) => onFilter({ ...filter, heat: value })} aria-label="Heat" data-testid="heat-toggle" />
                        <Flame className="size-3.5 text-danger" /> Heat
                    </label>
                    <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
                        <Switch checked={filter.plotAll} onCheckedChange={(value) => onFilter({ ...filter, plotAll: value })} aria-label="Plot every pin" data-testid="plot-all-toggle" />
                        Every pin
                    </label>
                </div>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                <Card className="relative min-h-[620px] overflow-hidden rounded-lg border-border shadow-none">
                    <div className="absolute inset-0">
                        <MapSurface<LeadPoint>
                            config={mapsConfig}
                            points={points}
                            polygons={polygons}
                            cells={cells}
                            camera={camera}
                            onCameraChange={setCamera}
                            onBoundsChange={onBounds}
                            selectedId={selectedId}
                            onSelect={(point) => {
                                if (point.kind === "cluster") setCamera(cameraInto(point, Math.max(camera.zoom + 2, 14)));
                                else setSelectedId(point.id);
                            }}
                            onClusterClick={(cluster) => setCamera(cameraInto(cluster, camera.zoom))}
                            onMapClick={drawing ? (at) => setRing((current) => [...current, [at.longitude, at.latitude]]) : undefined}
                            caption="Open leads in view: red hot, amber warm, grey cold, blue held. Territories outlined blue, live zones dashed amber; the heat is demand over supply."
                        />
                    </div>
                    <div className="absolute left-3 top-3 z-[500] flex flex-col gap-1">
                        <Button size="icon" variant="outline" className="size-8 bg-card" aria-label="Zoom in" onClick={() => setCamera((c) => ({ ...c, zoom: stepZoom(c.zoom, 1) }))}>
                            <Plus className="size-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="size-8 bg-card" aria-label="Zoom out" onClick={() => setCamera((c) => ({ ...c, zoom: stepZoom(c.zoom, -1) }))}>
                            <Minus className="size-4" />
                        </Button>
                    </div>
                    <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
                        {drawing ? (
                            <div className="flex flex-wrap items-center justify-end gap-1 rounded-md border bg-card p-1.5 shadow-sm" data-testid="draw-toolbar">
                                <span className="px-1.5 text-xs text-muted-foreground">
                                    {ring.length === 0 ? "Click the map to drop corners" : `${ring.length} ${ring.length === 1 ? "corner" : "corners"}`}
                                </span>
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => setRing((c) => c.slice(0, -1))} disabled={ring.length === 0} aria-label="Undo corner">
                                    <Undo2 className="size-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7" onClick={stopDrawing} aria-label="Stop drawing">
                                    <X className="size-3.5" />
                                </Button>
                                <Button size="sm" className="h-7" onClick={() => setDialog("assign")} disabled={ring.length < 3} data-testid="draw-assign">
                                    Assign inside…
                                </Button>
                                <Button size="sm" variant="outline" className="h-7" onClick={() => setDialog("territory")} disabled={ring.length < 3} data-testid="draw-territory">
                                    Save as territory…
                                </Button>
                                <Button size="sm" variant="outline" className="h-7" onClick={() => setDialog("zone")} disabled={ring.length < 3} data-testid="draw-zone">
                                    Save as zone…
                                </Button>
                            </div>
                        ) : (
                            <Button size="sm" variant="outline" className="bg-card" onClick={() => setDrawing(true)} data-testid="draw-start">
                                <PenLine className="mr-1.5 size-3.5" /> Draw an area
                            </Button>
                        )}
                        <div className="flex items-center gap-1 rounded-md border bg-card p-1 text-xs shadow-sm">
                            <Layers className="ml-1 size-3.5 text-muted-foreground" />
                            <button type="button" className={cn("rounded px-2 py-1", layers.territories ? "bg-info-soft text-info" : "text-muted-foreground")} onClick={() => setLayers((l) => ({ ...l, territories: !l.territories }))}>
                                Territories
                            </button>
                            <button type="button" className={cn("rounded px-2 py-1", layers.zones ? "bg-warning-soft text-warning" : "text-muted-foreground")} onClick={() => setLayers((l) => ({ ...l, zones: !l.zones }))}>
                                Zones
                            </button>
                        </div>
                    </div>
                    {loading ? <div className="absolute bottom-3 left-3 z-[500] rounded-md bg-card/90 px-2 py-1 text-xs text-muted-foreground">Reading the viewport…</div> : null}
                </Card>

                <div className="space-y-3">
                    <Card className="rounded-lg border-border p-4 shadow-none" data-testid="map-summary">
                        <p className="text-sm font-medium text-foreground">
                            {view ? (view.mode === "PINS" ? `${view.total} ${view.total === 1 ? "lead" : "leads"} in view` : `${view.total} leads in ${view.clusters.length} ${view.clusters.length === 1 ? "cluster" : "clusters"}`) : "Move the map to read a viewport"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{view?.mode === "CLUSTERS" ? "Zoom in for pins, or switch on Every pin." : "A pin opens the lead beside."}</p>
                    </Card>

                    {selected ? <PinCard pin={selected} agents={agents} onClose={() => setSelectedId(null)} /> : null}

                    <Card className="rounded-lg border-border p-4 shadow-none">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground">Territories</h3>
                            <Link href="/leads/territories" className="text-xs text-primary hover:underline">
                                Desk
                            </Link>
                        </div>
                        {territories.filter((t) => t.isActive).length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">None drawn yet — draw an area and save it as a territory.</p>
                        ) : (
                            <ul className="mt-2 space-y-1.5">
                                {territories
                                    .filter((t) => t.isActive)
                                    .map((row) => (
                                        <li key={row.id}>
                                            <button
                                                type="button"
                                                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                                                onClick={() => {
                                                    const centre = ringCentre(row.polygon);
                                                    if (centre) setCamera({ ...centre, zoom: Math.max(camera.zoom, 13) });
                                                }}
                                            >
                                                <span className="truncate">
                                                    {row.name} <span className="text-xs text-muted-foreground">· {agentLabel(agents.find((a) => a.id === row.agentId) ?? { id: row.agentId, userId: "", city: null, tier: "" })}</span>
                                                </span>
                                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{row.leadCount}</span>
                                            </button>
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </Card>

                    <Card className="rounded-lg border-border p-4 shadow-none">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground">Priority zones</h3>
                            <Link href="/leads/priority-zones" className="text-xs text-primary hover:underline">
                                Desk
                            </Link>
                        </div>
                        {zones.filter((z) => zoneState(z).state === "LIVE").length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">Nothing live — draw an area and save it as a zone, or make a category push from the desk.</p>
                        ) : (
                            <ul className="mt-2 space-y-2">
                                {zones
                                    .filter((z) => zoneState(z).state === "LIVE")
                                    .map((row) => {
                                        const used = zoneBudgetUsed(row);
                                        return (
                                            <li key={row.id} className="space-y-1">
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center justify-between gap-2 text-left text-sm"
                                                    onClick={() => {
                                                        const centre = row.polygon ? ringCentre(row.polygon) : null;
                                                        if (centre) setCamera({ ...centre, zoom: Math.max(camera.zoom, 13) });
                                                    }}
                                                >
                                                    <span className="truncate">
                                                        {row.name}
                                                        {row.category ? <span className="text-xs text-muted-foreground"> · {row.category}</span> : null}
                                                    </span>
                                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">+{formatMoney(row.topUp)}</span>
                                                </button>
                                                {used !== null ? <Progress value={used * 100} className="h-1.5" aria-label={`${formatMoney(row.spent)} of ${formatMoney(row.budgetCap)} spent`} /> : null}
                                            </li>
                                        );
                                    })}
                            </ul>
                        )}
                    </Card>
                </div>
            </div>

            <AssignInsideDialog
                open={dialog === "assign"}
                onOpenChange={(open) => setDialog(open ? "assign" : null)}
                ring={ring}
                side={filter.side ?? "PUBLISHER"}
                agents={agents}
                onAssigned={() => {
                    stopDrawing();
                    onChanged();
                }}
            />
            <TerritoryDialog
                open={dialog === "territory"}
                onOpenChange={(open) => setDialog(open ? "territory" : null)}
                territory={null}
                polygon={ring}
                agents={agents}
                onSaved={() => {
                    stopDrawing();
                    onChanged();
                }}
            />
            <ZoneDialog
                open={dialog === "zone"}
                onOpenChange={(open) => setDialog(open ? "zone" : null)}
                zone={null}
                polygon={ring}
                onSaved={() => {
                    stopDrawing();
                    onChanged();
                }}
            />
        </div>
    );
}

/** The selected pin: what the lead is, how warm, what it is worth, who holds it. */
function PinCard({ pin, agents, onClose }: { pin: MapPin; agents: AgentSummary[]; onClose: () => void }) {
    const temperature = temperatureMeta(pin.temperature);
    const holder = pin.claim ? (agents.find((a) => a.id === pin.claim!.agentId) ?? null) : null;
    return (
        <Card className="rounded-lg border-border p-4 shadow-none" data-testid="pin-card">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{pin.businessName}</p>
                    <p className="text-xs text-muted-foreground">
                        {pin.displayId} · {LEAD_SIDE_LABEL[pin.side]}
                        {pin.category ? ` · ${pin.category}` : ""}
                    </p>
                </div>
                <button type="button" className="text-muted-foreground" aria-label="Close" onClick={onClose}>
                    <X className="size-4" />
                </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={{ label: pin.score !== null ? `${temperature.label} · ${pin.score}` : temperature.label, tone: temperature.tone }} />
                <StatusBadge status={{ label: STAGE_META[pin.stage].label, tone: STAGE_META[pin.stage].tone }} />
                {pin.priority ? <StatusBadge status={{ label: "Priority zone", tone: "warning" }} /> : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Estimate</dt>
                <dd className="tabular-nums">{pin.estimatedValue ? formatMoney(pin.estimatedValue) : "—"}</dd>
                <dt className="text-muted-foreground">Commission</dt>
                <dd className="tabular-nums">{pin.estimatedCommission ? formatMoney(pin.estimatedCommission) : "—"}</dd>
                <dt className="text-muted-foreground">Held by</dt>
                <dd>{pin.claim ? `${holder ? agentLabel(holder) : pin.claim.agentId}${pin.claim.expiresAt ? ` · until ${new Date(pin.claim.expiresAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}` : "Nobody"}</dd>
            </dl>
            <Button size="sm" className="mt-3 w-full" asChild>
                <Link href={`/leads/${pin.id}`}>Open lead</Link>
            </Button>
        </Card>
    );
}

/** Every open, unassigned lead inside the ring goes to one agent. */
function AssignInsideDialog({ open, onOpenChange, ring, side: initialSide, agents, onAssigned }: { open: boolean; onOpenChange: (open: boolean) => void; ring: Ring; side: LeadSide; agents: AgentSummary[]; onAssigned: () => void }) {
    const [side, setSide] = React.useState<LeadSide>(initialSide);
    const [agentId, setAgentId] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [wasOpen, setWasOpen] = React.useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setSide(initialSide);
            setAgentId("");
        }
    }

    async function submit() {
        if (!agentId || busy) return;
        setBusy(true);
        try {
            const result = await leadsService.assignInPolygon({ polygon: ring, side, agentId });
            toast.success(result.assigned === 0 ? "Nothing open inside that area" : `${result.assigned} ${result.assigned === 1 ? "lead" : "leads"} assigned`);
            onOpenChange(false);
            onAssigned();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" data-testid="assign-inside-dialog">
                <DialogHeader>
                    <DialogTitle>Assign the leads inside</DialogTitle>
                    <DialogDescription>Every open lead of the side inside the {ring.length}-corner area that nobody holds goes to the agent. Held ones are left alone.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Side</Label>
                        <Select value={side} onValueChange={(value) => setSide(value as LeadSide)}>
                            <SelectTrigger aria-label="Side">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PUBLISHER">{LEAD_SIDE_LABEL.PUBLISHER}</SelectItem>
                                <SelectItem value="ADVERTISER">{LEAD_SIDE_LABEL.ADVERTISER}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Agent</Label>
                        <Select value={agentId} onValueChange={setAgentId}>
                            <SelectTrigger aria-label="Agent" data-testid="assign-agent">
                                <SelectValue placeholder="Pick an agent" />
                            </SelectTrigger>
                            <SelectContent>
                                {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                        {agentLabel(agent)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy || !agentId} data-testid="assign-inside-confirm">
                        {busy ? "Assigning…" : "Assign"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
