"use client";

import * as React from "react";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MapSurface, type MapPoint, type MarkerTone } from "@/components/adx/map";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatNumber } from "@/lib/format";
import { cameraInto, stepZoom, type Camera } from "@/lib/map-geometry";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import { CITY_STAGES, CITY_STAGE_LABEL, CITY_STAGE_TONE, geoService, type CityStage, type GeoMapPoint } from "@/services/geo";
import { mapsService, type MapsClientConfig } from "@/services/maps";

interface MapData {
    points: GeoMapPoint[];
    mapsConfig: MapsClientConfig | null;
}

/** A city pin as the seam draws it: keyed on the slug, coloured by stage. */
export type CityPin = MapPoint & GeoMapPoint & { latitude: number; longitude: number };

/** The camera's rest: the country, wide. */
const INDIA: Camera = { latitude: 21.5, longitude: 79, zoom: 4 };

/** The stages a fresh map shows — every catalogued city would be 6,500 grey pins; the ones ADX is doing something in are the picture. */
export const DEFAULT_MAP_STAGES: CityStage[] = ["SEEDING", "LAUNCHED", "PAUSED", "WITHDRAWN"];

export const STAGE_MARKER_TONE: Record<CityStage, MarkerTone> = {
    PLANNED: "neutral",
    SEEDING: "info",
    LAUNCHED: "success",
    PAUSED: "warning",
    WITHDRAWN: "danger",
};

/** The pins the API sent that have a fix, as the seam's points. */
export function pinsOf(points: readonly GeoMapPoint[]): CityPin[] {
    return points.flatMap((point) =>
        point.latitude === null || point.longitude === null
            ? []
            : [{ ...point, latitude: point.latitude, longitude: point.longitude, id: point.slug, tone: STAGE_MARKER_TONE[point.stage], title: `${point.name} · ${CITY_STAGE_LABEL[point.stage]}` }],
    );
}

/**
 * The Map tab — `GET /geo/map?stage=` over the maps seam
 * (`components/adx/map.tsx`): a pin per city coloured by stage, folding
 * into bubbles as the camera pulls out; the stage chips refetch; a pin
 * opens the city drawer. The seam draws the honest placeholder while the
 * key is missing or refused (the owner's key is refusing with "enable
 * Billing" as this lands) — the pins still count out under it.
 */
export function MapTab({ nonce, onOpenCity }: { nonce: number; onOpenCity: (slug: string) => void }) {
    const [stages, setStages] = React.useState<CityStage[]>(DEFAULT_MAP_STAGES);
    const [camera, setCamera] = React.useState<Camera>(INDIA);
    const [selected, setSelected] = React.useState<string | null>(null);
    const stageKey = stages.join(",");

    const resource = useApiResource<MapData>(`geo:map:${stageKey}:${nonce}`, async () => {
        const [points, mapsConfig] = await Promise.all([geoService.map({ stage: stages }), mapsService.clientConfig().catch(() => null)]);
        return { points, mapsConfig };
    });

    const toggle = (stage: CityStage) => setStages((current) => (current.includes(stage) ? current.filter((value) => value !== stage) : [...current, stage]));

    return (
        <ResourceBoundary resource={resource}>
            {({ points, mapsConfig }) => {
                const pins = pinsOf(points);
                const perStage = CITY_STAGES.map((stage) => ({ stage, count: points.filter((point) => point.stage === stage).length }));
                const chosen = pins.find((pin) => pin.slug === selected) ?? null;
                return (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Stages on the map">
                            {CITY_STAGES.map((stage) => {
                                const active = stages.includes(stage);
                                return (
                                    <button
                                        key={stage}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => toggle(stage)}
                                        className={cn(
                                            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                                            active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        {CITY_STAGE_LABEL[stage]}
                                        {active && (
                                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", active ? "bg-background/20" : "bg-muted")}>
                                                {perStage.find((row) => row.stage === stage)?.count ?? 0}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                            <span className="ml-auto text-xs text-muted-foreground">
                                {formatNumber(pins.length)} {pins.length === 1 ? "city" : "cities"} on the map
                                {points.length - pins.length > 0 ? ` · ${points.length - pins.length} without a fix` : ""}
                            </span>
                        </div>

                        <Card className="relative min-h-[560px] overflow-hidden rounded-lg border-border shadow-none">
                            <div className="absolute inset-0">
                                <MapSurface
                                    config={mapsConfig}
                                    points={pins}
                                    camera={camera}
                                    onCameraChange={setCamera}
                                    selectedId={selected}
                                    onSelect={(pin) => {
                                        setSelected(pin.slug);
                                        onOpenCity(pin.slug);
                                    }}
                                    onClusterClick={(cluster) => setCamera(cameraInto(cluster, camera.zoom))}
                                    caption={`Cities at ${stages.length ? stages.map((stage) => CITY_STAGE_LABEL[stage]).join(", ") : "no stage"}, coloured by stage; a pin opens the city.`}
                                />
                            </div>
                            <div className="absolute right-4 top-4 z-10 flex flex-col overflow-hidden rounded-md border bg-card shadow-sm">
                                <button type="button" aria-label="Zoom in" className="flex size-8 items-center justify-center border-b transition-colors hover:bg-muted" onClick={() => setCamera((current) => ({ ...current, zoom: stepZoom(current.zoom, 1) }))}>
                                    <Plus className="size-4" />
                                </button>
                                <button type="button" aria-label="Zoom out" className="flex size-8 items-center justify-center border-b transition-colors hover:bg-muted" onClick={() => setCamera((current) => ({ ...current, zoom: stepZoom(current.zoom, -1) }))}>
                                    <Minus className="size-4" />
                                </button>
                                <button type="button" aria-label="Reset view" className="flex size-8 items-center justify-center transition-colors hover:bg-muted" onClick={() => setCamera(INDIA)}>
                                    <LocateFixed className="size-4" />
                                </button>
                            </div>
                            {chosen && (
                                <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
                                    <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => onOpenCity(chosen.slug)}>
                                        {chosen.name}
                                    </button>
                                    <StatusBadge status={{ label: CITY_STAGE_LABEL[chosen.stage], tone: CITY_STAGE_TONE[chosen.stage] }} />
                                    <span className="text-xs text-muted-foreground">{formatNumber(chosen.listingsLive)} live</span>
                                </div>
                            )}
                        </Card>

                        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
                            {CITY_STAGES.map((stage) => (
                                <li key={stage} className="flex items-center gap-1.5">
                                    <span
                                        className={cn("size-2.5 rounded-full", {
                                            "bg-muted-foreground": stage === "PLANNED",
                                            "bg-info": stage === "SEEDING",
                                            "bg-success": stage === "LAUNCHED",
                                            "bg-warning": stage === "PAUSED",
                                            "bg-danger": stage === "WITHDRAWN",
                                        })}
                                        aria-hidden
                                    />
                                    {CITY_STAGE_LABEL[stage]}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            }}
        </ResourceBoundary>
    );
}
