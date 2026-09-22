"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { AdvancedMarker, APIProvider, Map as GoogleMap, useMap, type MapCameraChangedEvent, type MapMouseEvent } from "@vis.gl/react-google-maps";
import type { DivIcon, Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";
import { markerClusters, MAX_ZOOM, MIN_ZOOM, type Camera, type MarkerCluster, type Placed } from "@/lib/map-geometry";
import { browserKeyOf, vendorSentence, type MapsClientConfig } from "@/services/maps";

/**
 * The map surface every map-shaped screen on the console draws.
 *
 * **The provider is the platform's choice** — owner decision 101 (13 Sep):
 * Google Maps, through `@vis.gl/react-google-maps`, keyed by what
 * `GET /app/maps` answers (`services/maps.ts`). This file is the seam: the
 * screens hand it points and a camera and never import a vendor, so the
 * key arriving is a form change under Settings › Integrations › Maps, not
 * a deploy. Until it does — the key is still to come (Q128) — the surface
 * is the honest placeholder the phones draw too: the frame's map area at
 * its size, the points it would have plotted counted out, and the vendor
 * sentence. Never an unauthorised grey map.
 *
 * Z-C (the owner, 15 Sep 2026): OpenStreetMap is the third provider,
 * drawn through react-leaflet. It has no key — `GET /app/maps` answers the
 * tile template, the attribution and the deepest zoom, and the surface
 * draws them as soon as the read lands. The same props, the same clusters,
 * the same dots and bubbles: a screen cannot tell which vendor is under
 * it. Leaflet touches `window` on import, so its branch is loaded with
 * `ssr: false` (the way the charts are) and its CSS is imported once,
 * here. The placeholder is drawn for OSM only while the read has not
 * landed, since there is no key to wait on.
 *
 * Mapbox is the other provider ops may pick. The phones draw it; the
 * console has no Mapbox library installed, so choosing it here is the
 * placeholder with the Mapbox sentence until one lands.
 *
 * G13-C: the markers fold into zoom-dependent clusters (`lib/map-geometry`),
 * a lone point is a status-coloured dot with its title, a bubble is the
 * count, and a click on either goes to the caller — a bubble asks for the
 * camera to move in, a dot selects.
 *
 * V-C: a key the vendor REFUSES is the placeholder too, with the refusal
 * named. Google reports an unauthorised or unbilled key through the global
 * `gm_authFailure` callback (the owner's key is refusing with "enable
 * Billing" as this lands) and a script that fails to load through the
 * provider's `onError`; either way the surface says so under the markers
 * it would have plotted, rather than the vendor's grey "Oops" overlay. The
 * refusal is remembered per key, so a rotated key is tried afresh.
 *
 * AD-C: a lone marker can be dragged when the caller gives `onPointDragEnd`
 * — the pin picker's one pin. The vendor reports where it was let go and
 * the seam hands the caller the point and the new position; the caller
 * owns the coordinates, so the pin only moves when they are written back.
 */

/*
 * LH5 (the Lead Hunt, 22 Sep 2026): the hunting map needs three more
 * things from the seam, all optional so every earlier screen is untouched:
 * `polygons` (territories, priority zones, the ring being drawn) as filled
 * outlines; `cells` (the heat — demand over supply) as tinted squares;
 * `onMapClick` (a corner dropped) and `onBoundsChange` (the viewport the
 * server is asked for). Both vendors draw them the same.
 */

/** A ring the surface draws: GeoJSON order, `[longitude, latitude]`. */
export interface MapPolygon {
    id: string;
    ring: readonly (readonly [number, number])[];
    tone: MarkerTone;
    title?: string;
    /** A ring still being drawn, or a zone (an intent, not a boundary). */
    dashed?: boolean;
}

/** One tinted square of the heat: centred on a point, `sizeDeg` across, `weight` 0..1. */
export interface MapCell {
    id: string;
    latitude: number;
    longitude: number;
    sizeDeg: number;
    weight: number;
    title?: string;
}

export interface MapBounds {
    south: number;
    west: number;
    north: number;
    east: number;
}

/** Google's documented hook for an authorisation failure (a bad, restricted or unbilled key). */
type WindowWithAuthFailure = Window & { gm_authFailure?: () => void };

export const KEY_REFUSED_SENTENCE = "Google refused this key — it is not authorised for this site, or billing is not enabled on its project. Fix it under Settings › Integrations › Maps; everything else on this screen works.";
export const SCRIPT_FAILED_SENTENCE = "The Google Maps script could not be loaded. Check the key and the network; everything else on this screen works.";

/** The map's own id — Google's documented demo id, which is what Advanced Markers need to render at all. Swap for the platform's styled map id when one is made. */
const MAP_ID = "DEMO_MAP_ID";

export type MarkerTone = "success" | "warning" | "danger" | "info" | "neutral";

/** A point the surface draws: where, what colour, and what to call it. */
export interface MapPoint extends Placed {
    tone: MarkerTone;
    title: string;
}

export interface MapSurfaceProps<T extends MapPoint> {
    /** `GET /app/maps`; null while unread, failed, or on fixtures — the placeholder either way. */
    config: MapsClientConfig | null;
    points: readonly T[];
    /** Controlled: the caller owns the camera so its chips and buttons can move it. */
    camera: Camera;
    onCameraChange: (camera: Camera) => void;
    selectedId?: string | null;
    onSelect?: (point: T) => void;
    /** A bubble was clicked: the caller usually zooms into it with `cameraInto`. */
    onClusterClick?: (cluster: MarkerCluster<T>) => void;
    /** Under the placeholder, what the map is for. */
    caption?: string;
    className?: string;
    /** AD-C: given, every lone marker is draggable and reports where it was let go. Clusters never drag. */
    onPointDragEnd?: (point: T, at: { latitude: number; longitude: number }) => void;
    /** LH5: rings to outline — territories, zones, the one being drawn. */
    polygons?: readonly MapPolygon[];
    /** LH5: the heat's squares. */
    cells?: readonly MapCell[];
    /** LH5: a click on the map itself (not a marker) — the polygon tool's corner. */
    onMapClick?: (at: { latitude: number; longitude: number }) => void;
    /** LH5: the viewport after every move, for a screen that asks the server for what is in view. */
    onBoundsChange?: (bounds: MapBounds) => void;
}

/** The stroke and fill a ring or a square takes, by tone — the same hues the dots use. */
const SHAPE_COLOURS: Record<MarkerTone, string> = {
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    info: "#2563eb",
    neutral: "#6b7280",
};

/** The heat's fill: the warmer the cell, the more of the tone shows. */
const cellOpacity = (weight: number): number => 0.08 + Math.max(0, Math.min(1, weight)) * 0.5;

/** A cell's corners as a bounds box. */
const cellBounds = (cell: MapCell): MapBounds => ({
    south: cell.latitude - cell.sizeDeg / 2,
    west: cell.longitude - cell.sizeDeg / 2,
    north: cell.latitude + cell.sizeDeg / 2,
    east: cell.longitude + cell.sizeDeg / 2,
});

const DOT_CLASSES: Record<MarkerTone, string> = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    neutral: "bg-muted-foreground",
};

/** The dot's classes, shared by the Google marker (a React child) and the Leaflet one (an HTML icon). */
const dotClasses = (tone: MarkerTone, selected: boolean): string =>
    cn(
        "flex items-center justify-center rounded-full border-2 border-card shadow-md transition-transform",
        DOT_CLASSES[tone],
        selected ? "size-5 scale-110 ring-2 ring-foreground/60" : "size-4",
    );

/** The bubble's classes: its size grows with the count. */
const bubbleClasses = (count: number): string =>
    cn(
        "flex items-center justify-center rounded-full border-2 border-card bg-primary font-semibold tabular-nums text-primary-foreground shadow-md ring-4 ring-primary/25",
        count >= 100 ? "size-11 text-sm" : count >= 10 ? "size-9 text-xs" : "size-8 text-xs",
    );

/** The dot's box in pixels, for Leaflet to centre the icon on the point: `size-4` / `size-5`. */
const dotPixels = (selected: boolean): number => (selected ? 20 : 16);
/** The bubble's box in pixels: `size-8` / `size-9` / `size-11`. */
const bubblePixels = (count: number): number => (count >= 100 ? 44 : count >= 10 ? 36 : 32);

export function MapSurface<T extends MapPoint>({
    config,
    points,
    camera,
    onCameraChange,
    selectedId = null,
    onSelect,
    onClusterClick,
    caption,
    className,
    onPointDragEnd,
    polygons,
    cells,
    onMapClick,
    onBoundsChange,
}: MapSurfaceProps<T>) {
    const key = browserKeyOf(config);
    const provider = config?.provider ?? null;
    const clusters = React.useMemo(() => markerClusters(points, camera.zoom), [points, camera.zoom]);
    /* The refusal is kept with the key it was for: a new key starts clean without an effect resetting anything. */
    const [refused, setRefused] = React.useState<{ key: string; reason: string } | null>(null);
    const refusal = refused && refused.key === key ? refused.reason : null;

    React.useEffect(() => {
        if (!key || provider !== "GOOGLE") return;
        const scope = window as WindowWithAuthFailure;
        const previous = scope.gm_authFailure;
        scope.gm_authFailure = () => setRefused({ key, reason: KEY_REFUSED_SENTENCE });
        return () => {
            scope.gm_authFailure = previous;
        };
    }, [key, provider]);

    if (!config || !key || provider === "MAPBOX" || refusal) {
        return <MapPlaceholder points={points} polygons={polygons} provider={provider} configured={Boolean(config)} refusal={refusal} caption={caption} className={className} />;
    }

    if (config.provider === "OSM") {
        return (
            <div className={cn("relative size-full", className)} data-testid="map-surface" data-provider="OSM">
                <OsmSurface
                    tileUrlTemplate={config.tileUrlTemplate}
                    tileAttribution={config.tileAttribution}
                    tileMaxZoom={config.tileMaxZoom}
                    clusters={clusters}
                    camera={camera}
                    onCameraChange={onCameraChange}
                    selectedId={selectedId}
                    onSelect={onSelect as ((point: MapPoint) => void) | undefined}
                    onClusterClick={onClusterClick as ((cluster: MarkerCluster<MapPoint>) => void) | undefined}
                    onPointDragEnd={onPointDragEnd as ((point: MapPoint, at: { latitude: number; longitude: number }) => void) | undefined}
                    polygons={polygons}
                    cells={cells}
                    onMapClick={onMapClick}
                    onBoundsChange={onBoundsChange}
                />
            </div>
        );
    }

    return (
        <div className={cn("relative size-full", className)} data-testid="map-surface" data-provider="GOOGLE">
            <APIProvider apiKey={key} libraries={["marker"]} onError={() => setRefused({ key, reason: SCRIPT_FAILED_SENTENCE })}>
                <GoogleMap
                    mapId={MAP_ID}
                    center={{ lat: camera.latitude, lng: camera.longitude }}
                    zoom={camera.zoom}
                    minZoom={MIN_ZOOM}
                    maxZoom={MAX_ZOOM}
                    onCameraChanged={(event: MapCameraChangedEvent) => {
                        onCameraChange({ latitude: event.detail.center.lat, longitude: event.detail.center.lng, zoom: event.detail.zoom });
                        if (onBoundsChange && event.detail.bounds) onBoundsChange(event.detail.bounds);
                    }}
                    onClick={onMapClick ? (event: MapMouseEvent) => event.detail.latLng && onMapClick({ latitude: event.detail.latLng.lat, longitude: event.detail.latLng.lng }) : undefined}
                    disableDefaultUI
                    gestureHandling="greedy"
                    clickableIcons={false}
                    className="size-full"
                >
                    {((polygons && polygons.length > 0) || (cells && cells.length > 0)) && <GoogleShapes polygons={polygons ?? []} cells={cells ?? []} />}
                    {clusters.map((cluster) =>
                        cluster.points.length === 1 ? (
                            <PointMarker
                                key={cluster.key}
                                point={cluster.points[0]}
                                selected={cluster.points[0].id === selectedId}
                                onClick={onSelect ? () => onSelect(cluster.points[0]) : undefined}
                                onDragEnd={onPointDragEnd ? (at) => onPointDragEnd(cluster.points[0], at) : undefined}
                            />
                        ) : (
                            <ClusterMarker key={cluster.key} cluster={cluster} onClick={onClusterClick ? () => onClusterClick(cluster) : undefined} />
                        ),
                    )}
                </GoogleMap>
            </APIProvider>
        </div>
    );
}

function PointMarker<T extends MapPoint>({
    point,
    selected,
    onClick,
    onDragEnd,
}: {
    point: T;
    selected: boolean;
    onClick?: () => void;
    onDragEnd?: (at: { latitude: number; longitude: number }) => void;
}) {
    return (
        <AdvancedMarker
            position={{ lat: point.latitude, lng: point.longitude }}
            title={point.title}
            onClick={onClick}
            zIndex={selected ? 2 : 1}
            draggable={Boolean(onDragEnd)}
            onDragEnd={onDragEnd ? (event) => event.latLng && onDragEnd({ latitude: event.latLng.lat(), longitude: event.latLng.lng() }) : undefined}
        >
            <span className={dotClasses(point.tone, selected)} aria-label={point.title} />
        </AdvancedMarker>
    );
}

function ClusterMarker<T extends MapPoint>({ cluster, onClick }: { cluster: MarkerCluster<T>; onClick?: () => void }) {
    const count = cluster.points.length;
    return (
        <AdvancedMarker position={{ lat: cluster.latitude, lng: cluster.longitude }} title={`${count} listings`} onClick={onClick} zIndex={3}>
            <span className={bubbleClasses(count)}>{count}</span>
        </AdvancedMarker>
    );
}

/**
 * LH5: the rings and the heat on Google, drawn imperatively — the library
 * ships no Polygon or Rectangle component. The shapes are rebuilt when
 * their props change and cleared when the surface goes.
 */
function GoogleShapes({ polygons, cells }: { polygons: readonly MapPolygon[]; cells: readonly MapCell[] }) {
    const map = useMap();
    React.useEffect(() => {
        if (!map || typeof google === "undefined") return;
        const drawn: { setMap(map: null): void }[] = [];
        for (const polygon of polygons) {
            drawn.push(
                new google.maps.Polygon({
                    map,
                    paths: polygon.ring.map(([lng, lat]) => ({ lat, lng })),
                    strokeColor: SHAPE_COLOURS[polygon.tone],
                    strokeOpacity: 0.9,
                    strokeWeight: 2,
                    fillColor: SHAPE_COLOURS[polygon.tone],
                    fillOpacity: polygon.dashed ? 0.08 : 0.18,
                    clickable: false,
                }),
            );
        }
        for (const cell of cells) {
            drawn.push(
                new google.maps.Rectangle({
                    map,
                    bounds: cellBounds(cell),
                    strokeWeight: 0,
                    fillColor: SHAPE_COLOURS.danger,
                    fillOpacity: cellOpacity(cell.weight),
                    clickable: false,
                }),
            );
        }
        return () => {
            for (const shape of drawn) shape.setMap(null);
        };
    }, [map, polygons, cells]);
    return null;
}

/* ------------------------------------------------------------------ */
/* Z-C: the OpenStreetMap branch, over react-leaflet                   */
/* ------------------------------------------------------------------ */

interface OsmSurfaceProps {
    tileUrlTemplate: string;
    tileAttribution: string;
    tileMaxZoom: number;
    clusters: readonly MarkerCluster<MapPoint>[];
    camera: Camera;
    onCameraChange: (camera: Camera) => void;
    selectedId: string | null;
    onSelect?: (point: MapPoint) => void;
    onClusterClick?: (cluster: MarkerCluster<MapPoint>) => void;
    onPointDragEnd?: (point: MapPoint, at: { latitude: number; longitude: number }) => void;
    polygons?: readonly MapPolygon[] | undefined;
    cells?: readonly MapCell[] | undefined;
    onMapClick?: ((at: { latitude: number; longitude: number }) => void) | undefined;
    onBoundsChange?: ((bounds: MapBounds) => void) | undefined;
}

/** A Next static image import in the app, a plain URL under Vite's test transform. */
const imageUrl = (image: { src: string } | string): string => (typeof image === "string" ? image : image.src);

/** A title inside an icon's HTML: the four characters that would break out of the attribute. */
const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Closer than this, in degrees, the camera and the map agree — Leaflet reports a centre rounded to the pixel, and chasing that would loop. */
const CAMERA_EPSILON = 1e-7;

/**
 * Leaflet reads `window` the moment it is imported, so the branch is
 * built inside the loader: the library and react-leaflet arrive together,
 * the default marker icon is pointed at the bundled images (Leaflet
 * guesses their path from its own script tag, which no bundler has — the
 * known fix), and the component is returned for `next/dynamic` to mount
 * on the client only. The escape hatch `ssr: false` is legal here because
 * this file is a Client Component.
 */
const OsmSurface = dynamic(
    () =>
        import("react-leaflet").then(async (RL) => {
            const L = (await import("leaflet")).default;

            delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: imageUrl(markerIcon2x),
                iconUrl: imageUrl(markerIcon),
                shadowUrl: imageUrl(markerShadow),
            });

            /* One icon per look — Leaflet compares icons by identity and rebuilds the marker's element when it changes. */
            const icons = new Map<string, DivIcon>();
            const dotIcon = (tone: MarkerTone, selected: boolean, title: string): DivIcon => {
                const id = `dot:${tone}:${selected}:${title}`;
                let icon = icons.get(id);
                if (!icon) {
                    const px = dotPixels(selected);
                    icon = L.divIcon({
                        html: `<span class="${dotClasses(tone, selected)}" role="img" aria-label="${escapeHtml(title)}"></span>`,
                        className: "adx-osm-marker",
                        iconSize: [px, px],
                        iconAnchor: [px / 2, px / 2],
                    });
                    icons.set(id, icon);
                }
                return icon;
            };
            const bubbleIcon = (count: number): DivIcon => {
                const id = `bubble:${count}`;
                let icon = icons.get(id);
                if (!icon) {
                    const px = bubblePixels(count);
                    icon = L.divIcon({
                        html: `<span class="${bubbleClasses(count)}">${count}</span>`,
                        className: "adx-osm-marker",
                        iconSize: [px, px],
                        iconAnchor: [px / 2, px / 2],
                    });
                    icons.set(id, icon);
                }
                return icon;
            };

            /**
             * The camera is the caller's: the map follows it when a chip or a
             * button moves it, and reports back when the operator drags or
             * scrolls. `MapContainer` only reads `center` and `zoom` once, so
             * the follow is an effect on the live map.
             */
            function CameraSync({
                camera,
                onCameraChange,
                onMapClick,
                onBoundsChange,
            }: {
                camera: Camera;
                onCameraChange: (camera: Camera) => void;
                onMapClick?: ((at: { latitude: number; longitude: number }) => void) | undefined;
                onBoundsChange?: ((bounds: MapBounds) => void) | undefined;
            }) {
                const reportBounds = (map: LeafletMap) => {
                    if (!onBoundsChange || typeof map.getBounds !== "function") return;
                    const bounds = map.getBounds();
                    onBoundsChange({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() });
                };
                const report = (map: LeafletMap) => {
                    const centre = map.getCenter();
                    onCameraChange({ latitude: centre.lat, longitude: centre.lng, zoom: map.getZoom() });
                    reportBounds(map);
                };
                const map = RL.useMapEvents({
                    moveend: (event) => report(event.target as LeafletMap),
                    zoomend: (event) => report(event.target as LeafletMap),
                    ...(onMapClick ? { click: (event: { latlng: { lat: number; lng: number } }) => onMapClick({ latitude: event.latlng.lat, longitude: event.latlng.lng }) } : {}),
                });
                /* The first viewport, before anyone moves: the screen asks the server for it right away. */
                const first = React.useRef(true);
                React.useEffect(() => {
                    if (!first.current) return;
                    first.current = false;
                    reportBounds(map);
                });
                React.useEffect(() => {
                    const centre = map.getCenter();
                    const moved =
                        Math.abs(centre.lat - camera.latitude) > CAMERA_EPSILON ||
                        Math.abs(centre.lng - camera.longitude) > CAMERA_EPSILON ||
                        map.getZoom() !== camera.zoom;
                    if (moved) map.setView([camera.latitude, camera.longitude], camera.zoom, { animate: false });
                }, [map, camera.latitude, camera.longitude, camera.zoom]);
                return null;
            }

            function OsmMap({ tileUrlTemplate, tileAttribution, tileMaxZoom, clusters, camera, onCameraChange, selectedId, onSelect, onClusterClick, onPointDragEnd, polygons, cells, onMapClick, onBoundsChange }: OsmSurfaceProps) {
                return (
                    <RL.MapContainer
                        center={[camera.latitude, camera.longitude]}
                        zoom={camera.zoom}
                        minZoom={MIN_ZOOM}
                        maxZoom={Math.min(MAX_ZOOM, tileMaxZoom)}
                        zoomControl={false}
                        className="size-full"
                    >
                        <RL.TileLayer url={tileUrlTemplate} attribution={tileAttribution} maxZoom={tileMaxZoom} />
                        <CameraSync camera={camera} onCameraChange={onCameraChange} onMapClick={onMapClick} onBoundsChange={onBoundsChange} />
                        {cells?.map((cell) => {
                            const box = cellBounds(cell);
                            return (
                                <RL.Rectangle
                                    key={cell.id}
                                    bounds={[
                                        [box.south, box.west],
                                        [box.north, box.east],
                                    ]}
                                    pathOptions={{ stroke: false, fillColor: SHAPE_COLOURS.danger, fillOpacity: cellOpacity(cell.weight) }}
                                    interactive={false}
                                />
                            );
                        })}
                        {polygons?.map((polygon) => (
                            <RL.Polygon
                                key={polygon.id}
                                positions={polygon.ring.map(([lng, lat]) => [lat, lng] as [number, number])}
                                pathOptions={{ color: SHAPE_COLOURS[polygon.tone], weight: 2, opacity: 0.9, fillColor: SHAPE_COLOURS[polygon.tone], fillOpacity: polygon.dashed ? 0.08 : 0.18, dashArray: polygon.dashed ? "6 6" : undefined }}
                                interactive={false}
                            />
                        ))}
                        {clusters.map((cluster) => {
                            if (cluster.points.length === 1) {
                                const point = cluster.points[0];
                                const selected = point.id === selectedId;
                                return (
                                    <RL.Marker
                                        key={cluster.key}
                                        position={[point.latitude, point.longitude]}
                                        icon={dotIcon(point.tone, selected, point.title)}
                                        title={point.title}
                                        zIndexOffset={selected ? 200 : 100}
                                        draggable={Boolean(onPointDragEnd)}
                                        eventHandlers={{
                                            ...(onSelect ? { click: () => onSelect(point) } : {}),
                                            ...(onPointDragEnd
                                                ? {
                                                      dragend: (event: { target: unknown }) => {
                                                          const at = (event.target as LeafletMarker).getLatLng();
                                                          onPointDragEnd(point, { latitude: at.lat, longitude: at.lng });
                                                      },
                                                  }
                                                : {}),
                                        }}
                                    />
                                );
                            }
                            const count = cluster.points.length;
                            return (
                                <RL.Marker
                                    key={cluster.key}
                                    position={[cluster.latitude, cluster.longitude]}
                                    icon={bubbleIcon(count)}
                                    title={`${count} listings`}
                                    zIndexOffset={300}
                                    eventHandlers={onClusterClick ? { click: () => onClusterClick(cluster) } : undefined}
                                />
                            );
                        })}
                    </RL.MapContainer>
                );
            }

            return OsmMap;
        }),
    { ssr: false, loading: () => <div className="size-full animate-pulse bg-muted/40" data-testid="map-loading" aria-hidden /> },
);

/**
 * The frame's map area with no tiles: what would have been plotted, and the
 * one sentence saying what the tiles are waiting on.
 */
function MapPlaceholder({
    points,
    polygons,
    provider,
    configured,
    refusal,
    caption,
    className,
}: {
    points: readonly MapPoint[];
    polygons?: readonly MapPolygon[] | undefined;
    provider: MapsClientConfig["provider"] | null;
    configured: boolean;
    /** The vendor's refusal of the key, when there was one — printed instead of the "key to come" sentence. */
    refusal?: string | null;
    caption?: string;
    className?: string;
}) {
    const sentence = refusal
        ? refusal
        : !configured
          ? "The map surface reads its key from the API; with the console on fixtures there is nothing to draw with."
          : provider === "MAPBOX"
            ? `${vendorSentence(provider)} The console has no Mapbox library yet; the phones draw it.`
            : vendorSentence(provider);
    return (
        <div
            className={cn("flex size-full flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center", className)}
            data-testid="map-placeholder"
            data-refused={refusal ? "true" : undefined}
        >
            <MapPinned className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">
                {points.length === 0 ? "Nothing to plot" : `${points.length} ${points.length === 1 ? "marker" : "markers"} would be drawn here`}
                {polygons && polygons.length > 0 ? ` · ${polygons.length} ${polygons.length === 1 ? "area" : "areas"}` : ""}
            </p>
            {caption && <p className="max-w-md text-xs text-muted-foreground">{caption}</p>}
            <p className="max-w-md text-xs text-muted-foreground">{sentence}</p>
        </div>
    );
}
