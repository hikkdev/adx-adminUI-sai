"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapSurface, type MapPoint, type MarkerTone } from "@/components/adx/map";
import type { Camera } from "@/lib/map-geometry";
import { mapsLink, mapsLinkLabel } from "@/lib/maps-links";
import { useMapsConfig } from "@/lib/use-maps-config";

export interface MiniMapProps {
    latitude: number;
    longitude: number;
    /** The marker's title: what the spot is. */
    title?: string;
    tone?: MarkerTone;
    /** The camera's zoom over the pin: a street, by default. */
    zoom?: number;
    className?: string;
}

/** Street level: a block or two around the pin. */
export const MINI_MAP_ZOOM = 15;

/**
 * AD-C: a coordinate printed as text is a coordinate nobody can read. This
 * is the small map beside one — a listing under review, a verification's
 * filing point, where an agent stood when they raised a safety alert —
 * drawn through the one seam (`map.tsx`) with one marker, and a link that
 * opens the same point in the vendor's own web map (`lib/maps-links`), so
 * the link follows the provider ops chose rather than always going to
 * Google. Read-only: the operator may pan and zoom, and nothing is written
 * anywhere. Without a vendor to draw with, the surface's own placeholder
 * stands in and the link still works.
 */
export function MiniMap({ latitude, longitude, title = "The spot", tone = "info", zoom = MINI_MAP_ZOOM, className }: MiniMapProps) {
    const { config } = useMapsConfig();
    const [camera, setCamera] = React.useState<Camera>({ latitude, longitude, zoom });
    /* A new point is a new camera; the operator's pans over the old one do not carry (state reset during render, the way React documents it). */
    const [anchor, setAnchor] = React.useState({ latitude, longitude, zoom });
    if (anchor.latitude !== latitude || anchor.longitude !== longitude || anchor.zoom !== zoom) {
        setAnchor({ latitude, longitude, zoom });
        setCamera({ latitude, longitude, zoom });
    }

    const points = React.useMemo<MapPoint[]>(() => [{ id: "spot", latitude, longitude, tone, title }], [latitude, longitude, tone, title]);
    const provider = config?.provider ?? null;
    const href = mapsLink({ lat: latitude, lng: longitude, label: title }, provider);

    return (
        <div className={cn("overflow-hidden rounded-md border border-border", className)} data-testid="mini-map">
            <div className="h-40 w-full">
                <MapSurface config={config} points={points} camera={camera} onCameraChange={setCamera} caption={title} />
            </div>
            <div className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-1.5 text-xs">
                <span className="truncate tabular-nums text-muted-foreground">
                    {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </span>
                <a
                    className="inline-flex shrink-0 items-center gap-1 text-primary underline-offset-2 hover:underline"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="mini-map-link"
                    aria-label={`${mapsLinkLabel(provider)}: ${title}`}
                >
                    Open in maps
                    <ExternalLink className="size-3" aria-hidden />
                </a>
            </div>
        </div>
    );
}
