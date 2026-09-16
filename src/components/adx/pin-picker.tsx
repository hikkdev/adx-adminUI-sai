"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapSurface, type MapPoint } from "@/components/adx/map";
import { ApiError } from "@/lib/api-client";
import type { Camera } from "@/lib/map-geometry";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { useMapsConfig } from "@/lib/use-maps-config";
import { AUTOCOMPLETE_MIN_INPUT, GEOCODE_MIN_ADDRESS, geoReadsApi, geoService, type GeocodedPlace, type GeoPoint, type PlacePrediction } from "@/services/geo";

export interface PinPickerProps {
    /** The prefix of the three inputs' ids: `${id}-search`, `${id}-latitude`, `${id}-longitude`. */
    id: string;
    /** The coordinates as typed — strings, so the form's own payload logic is unchanged. */
    latitude: string;
    longitude: string;
    onChange: (next: { latitude: string; longitude: string }) => void;
    /**
     * Given, a pick and the reverse-geocoded line under a dragged pin offer
     * the address to the form ("Use this address"). Left out, the picker
     * only writes coordinates.
     */
    onAddress?: (place: GeocodedPlace) => void;
    /** The marker's title on the map. */
    title?: string;
    labels?: { search?: string; latitude?: string; longitude?: string };
    placeholders?: { search?: string; latitude?: string; longitude?: string };
    /** Where the map rests while there is no point yet: the country, by default. */
    restCamera?: Camera;
    disabled?: boolean;
    className?: string;
}

/** The camera's rest: India, wide. */
export const INDIA_CAMERA: Camera = { latitude: 21.5, longitude: 79, zoom: 4 };
/** The zoom the camera lands at over a point that was typed, picked or geocoded. */
export const PIN_ZOOM = 16;
/** Keystrokes settle for this long before the autocomplete is asked. */
export const SEARCH_DEBOUNCE_MS = 300;
/** A dragged pin rests this long before its address is looked up. */
export const REVERSE_DEBOUNCE_MS = 600;
/** How the two numeric inputs print a point the map or a pick produced. */
export const COORDINATE_DECIMALS = 6;

export const FIXTURES_SEARCH_SENTENCE = "Address search reads the API; with the console on fixtures, type the coordinates.";
export const NO_MAP_CAPTION = "The pin would be drawn here to drag onto the spot. Until the map draws, the address search and the two coordinates do the same job.";

/** A typed coordinate, or null while it is not one: blank, not a number, or off the planet. */
export function parseCoordinate(text: string, limit: 90 | 180): number | null {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const value = Number(trimmed);
    return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

/** A point as the inputs print it — never exponent notation, never fifteen decimals from a drag. */
export const formatCoordinate = (value: number): string => value.toFixed(COORDINATE_DECIMALS).replace(/\.?0+$/, "");

/** An autocomplete session token: one per search, 8–64 characters as the backend's schema asks. */
export function mintSessionToken(): string {
    const scope = globalThis.crypto as Crypto | undefined;
    if (scope && typeof scope.randomUUID === "function") return scope.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * AD-C: a coordinate wherever the console asks for one.
 *
 * Every form that wanted a point used to ask for two decimals typed from
 * memory. This is the one picker they share: an address search over
 * `GET /geo/autocomplete` (debounced, one billable session per focus, a
 * pick resolved to its point through `GET /geo/places/:placeId`), the map
 * seam with ONE draggable marker whose drop is written back, a line under
 * the dragged pin saying what address the vendor knows for it
 * (`GET /geo/reverse`), and the two numeric inputs kept in sync — typing
 * moves the pin. The coordinates stay the caller's strings, so a form's
 * payload is exactly what it was before the map arrived.
 *
 * It degrades on purpose: with no vendor to draw with, the seam's
 * placeholder explains and the search and inputs keep working; on
 * fixtures, with no API to search, the inputs alone do. Enter in the
 * search box with no prediction to pick falls back to `GET /geo/geocode`.
 */
export function PinPicker({
    id,
    latitude,
    longitude,
    onChange,
    onAddress,
    title = "The spot",
    labels,
    placeholders,
    restCamera = INDIA_CAMERA,
    disabled,
    className,
}: PinPickerProps) {
    const live = geoReadsApi();
    const { config } = useMapsConfig();
    const lat = parseCoordinate(latitude, 90);
    const lng = parseCoordinate(longitude, 180);
    const point: GeoPoint | null = lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null;

    /* ---- The camera follows the point; the operator's own pans are kept until the point moves. ---- */
    const [camera, setCamera] = React.useState<Camera>(() => (point ? { ...point, zoom: PIN_ZOOM } : restCamera));
    /* A drop already sits where the operator wants the view; only a typed or picked point recentres. */
    const followRef = React.useRef(true);
    React.useEffect(() => {
        if (lat === null || lng === null) return;
        if (!followRef.current) {
            followRef.current = true;
            return;
        }
        setCamera((current) => ({ latitude: lat, longitude: lng, zoom: Math.max(current.zoom, PIN_ZOOM) }));
    }, [lat, lng]);

    const points = React.useMemo<MapPoint[]>(() => (lat !== null && lng !== null ? [{ id: "pin", latitude: lat, longitude: lng, tone: "info", title }] : []), [lat, lng, title]);

    const write = (next: GeoPoint) => onChange({ latitude: formatCoordinate(next.latitude), longitude: formatCoordinate(next.longitude) });
    /* Typing is a request to look there: the camera follows, whatever the last drag left behind. */
    const type = (next: { latitude: string; longitude: string }) => {
        followRef.current = true;
        onChange(next);
    };

    /* ---- The dragged pin: written back, and its address looked up once it rests. ---- */
    const [dropped, setDropped] = React.useState<GeoPoint | null>(null);
    const settledDrop = useDebounced(dropped, REVERSE_DEBOUNCE_MS);
    const reverse = useApiResource<GeocodedPlace | null>(`pin-reverse:${live}:${settledDrop ? `${settledDrop.latitude},${settledDrop.longitude}` : "-"}`, () =>
        live && settledDrop ? geoService.reverse(settledDrop) : Promise.resolve(null),
    );
    const onDragEnd = (_pin: MapPoint, at: GeoPoint) => {
        followRef.current = false;
        setDropped(at);
        write(at);
    };

    /* ---- The address search. ---- */
    const [query, setQuery] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [session, setSession] = React.useState<string | null>(null);
    const [lookupError, setLookupError] = React.useState<string | null>(null);
    const [looking, setLooking] = React.useState(false);
    const q = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
    const searchable = live && q.length >= AUTOCOMPLETE_MIN_INPUT;
    const predictions = useApiResource<PlacePrediction[]>(`pin-autocomplete:${searchable}:${open}:${session ?? "-"}:${q}`, () =>
        searchable && open ? geoService.autocomplete(q, { ...(session ? { session } : {}), ...(point ? { near: point } : {}) }) : Promise.resolve([]),
    );
    const rows = predictions.data ?? [];
    const under = reverse.data;
    const listId = `${id}-predictions`;

    const apply = (place: GeocodedPlace) => {
        followRef.current = true;
        setDropped(null);
        write({ latitude: place.latitude, longitude: place.longitude });
        setQuery(place.formattedAddress);
        onAddress?.(place);
    };

    async function lookup(run: () => Promise<GeocodedPlace>) {
        setLooking(true);
        setLookupError(null);
        setOpen(false);
        try {
            apply(await run());
            /* One search spent; the next focus starts a new session. */
            setSession(null);
        } catch (cause) {
            setLookupError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "The address could not be looked up.");
        } finally {
            setLooking(false);
        }
    }

    const pick = (prediction: PlacePrediction) => lookup(() => geoService.place(prediction.placeId, session ?? undefined));
    const geocode = () => {
        const address = query.trim();
        if (address.length < GEOCODE_MIN_ADDRESS) return;
        void lookup(() => geoService.geocode(address));
    };

    return (
        <div className={cn("space-y-3", className)} data-testid="pin-picker">
            <div className="space-y-1.5">
                <Label htmlFor={`${id}-search`}>{labels?.search ?? "Find the spot"}</Label>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                        id={`${id}-search`}
                        role="combobox"
                        aria-expanded={open && searchable}
                        aria-controls={listId}
                        aria-autocomplete="list"
                        className="pl-8"
                        value={query}
                        disabled={disabled || !live}
                        placeholder={placeholders?.search ?? "Search an address or a landmark"}
                        autoComplete="off"
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setLookupError(null);
                            setOpen(true);
                        }}
                        onFocus={() => {
                            setSession((current) => current ?? mintSessionToken());
                            setOpen(true);
                        }}
                        onBlur={() => setOpen(false)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") setOpen(false);
                            if (event.key === "Enter") {
                                event.preventDefault();
                                if (rows.length > 0 && open) void pick(rows[0]);
                                else geocode();
                            }
                        }}
                    />
                    {open && searchable && (
                        <div
                            id={listId}
                            role="listbox"
                            aria-label="Matching places"
                            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover text-sm shadow-md"
                            /* Mouse down, not click: the input blurs (and the list closes) before a click would land. */
                            onMouseDown={(event) => event.preventDefault()}
                        >
                            {predictions.loading && rows.length === 0 ? (
                                <p className="px-3 py-2 text-muted-foreground">Searching…</p>
                            ) : predictions.error ? (
                                <p className="px-3 py-2 text-danger">{predictions.error}</p>
                            ) : rows.length === 0 ? (
                                <p className="px-3 py-2 text-muted-foreground">Nothing matches &ldquo;{q}&rdquo; — press Enter to look the address up as typed.</p>
                            ) : (
                                rows.map((prediction) => (
                                    <button
                                        key={prediction.placeId}
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onClick={() => void pick(prediction)}
                                        className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-muted/50"
                                    >
                                        <span className="block w-full truncate">{prediction.mainText}</span>
                                        {prediction.secondaryText ? <span className="block w-full truncate text-xs text-muted-foreground">{prediction.secondaryText}</span> : null}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
                {!live ? (
                    <p className="text-xs text-muted-foreground">{FIXTURES_SEARCH_SENTENCE}</p>
                ) : looking ? (
                    <p className="text-xs text-muted-foreground">Looking the place up…</p>
                ) : lookupError ? (
                    <p className="text-xs text-danger" role="alert">
                        {lookupError}
                    </p>
                ) : null}
            </div>

            <div className="h-56 w-full overflow-hidden rounded-md border border-border" data-testid="pin-picker-map">
                <MapSurface config={config} points={points} camera={camera} onCameraChange={setCamera} caption={NO_MAP_CAPTION} onPointDragEnd={disabled ? undefined : onDragEnd} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-latitude`}>{labels?.latitude ?? "Latitude"}</Label>
                    <Input
                        id={`${id}-latitude`}
                        inputMode="decimal"
                        value={latitude}
                        disabled={disabled}
                        onChange={(event) => type({ latitude: event.target.value, longitude })}
                        placeholder={placeholders?.latitude ?? "19.0760"}
                        className="tabular-nums"
                        aria-invalid={latitude.trim() !== "" && lat === null ? true : undefined}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-longitude`}>{labels?.longitude ?? "Longitude"}</Label>
                    <Input
                        id={`${id}-longitude`}
                        inputMode="decimal"
                        value={longitude}
                        disabled={disabled}
                        onChange={(event) => type({ latitude, longitude: event.target.value })}
                        placeholder={placeholders?.longitude ?? "72.8777"}
                        className="tabular-nums"
                        aria-invalid={longitude.trim() !== "" && lng === null ? true : undefined}
                    />
                </div>
            </div>

            {settledDrop && live && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="pin-picker-reverse">
                    {reverse.loading ? (
                        <span className="text-muted-foreground">Finding the address under the pin…</span>
                    ) : reverse.error ? (
                        <span className="text-muted-foreground">{reverse.error}</span>
                    ) : under ? (
                        <>
                            <span className="text-muted-foreground">
                                Under the pin: <span className="text-foreground">{under.formattedAddress}</span>
                            </span>
                            {onAddress && (
                                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onAddress(under)}>
                                    Use this address
                                </Button>
                            )}
                        </>
                    ) : null}
                </div>
            )}
        </div>
    );
}
