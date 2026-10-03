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

/** The search box's placeholder wherever an address is looked up — the publisher form's words, everywhere. */
export const ADDRESS_SEARCH_PLACEHOLDER = "Type a building, street or landmark";

/** The address box under the bar, everywhere an onboarding form asks for an address. */
export const ADDRESS_LINE_PLACEHOLDER = "Building, street, area";
/** The PIN code box, everywhere. */
export const PIN_CODE_PLACEHOLDER = "Six digits — 560001";
/** The backend's PIN rule: six digits, never starting with 0. */
export const PIN_CODE = /^[1-9][0-9]{5}$/;

/** A picked place's PIN — only when it names exactly a six-digit one; null otherwise, so the box keeps what it holds. */
export function pinCodeOf(place: Pick<GeocodedPlace, "postalCode">): string | null {
    const pin = place.postalCode?.replace(/\s+/g, "") ?? "";
    return PIN_CODE.test(pin) ? pin : null;
}

/**
 * What a pick fills on an onboarding form (the owner, 1 Oct 2026): the line,
 * the city, the state and the PIN — only what the place names, so a pick
 * never clears a box — and the coordinates, which the form keeps silently
 * and sends with the save where the API takes them.
 */
export function placeFill(
    place: GeocodedPlace,
    current: { address: string; city: string; state: string; postalCode: string },
): { address: string; city: string; state: string; postalCode: string; latitude: number; longitude: number } {
    return {
        address: place.formattedAddress || current.address,
        city: place.city || current.city,
        state: place.state || current.state,
        postalCode: pinCodeOf(place) ?? current.postalCode,
        latitude: place.latitude,
        longitude: place.longitude,
    };
}

export const FIXTURES_SEARCH_SENTENCE = "Address search reads the API; with the console on fixtures, type the coordinates.";
/** The bar alone (an onboarding address has no coordinate inputs): on fixtures, the boxes under it are typed. */
export const ADDRESS_FIXTURES_SENTENCE = "Address search reads the API; with the console on fixtures, type the address into the boxes below.";
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

/** The address search, as both the picker and the plain address box use it. */
export interface PlaceSearch {
    /** The console reads the API: with fixtures there is nothing to search. */
    live: boolean;
    open: boolean;
    setOpen: (open: boolean) => void;
    /** Open, live and long enough: the list is worth drawing. */
    showing: boolean;
    /** The settled text the predictions answer. */
    q: string;
    rows: PlacePrediction[];
    loading: boolean;
    error: string | null;
    /** A pick or an Enter is being resolved to a place. */
    looking: boolean;
    lookupError: string | null;
    clearLookupError: () => void;
    /** On focus: one billable autocomplete session per search. */
    begin: () => void;
    /** A prediction → its place (`GET /geo/places/:placeId`); false when the lookup failed. */
    pick: (prediction: PlacePrediction) => Promise<boolean>;
    /** The text as typed → its best match (`GET /geo/geocode`); false when too short or nothing matched. */
    geocode: (address: string) => Promise<boolean>;
}

/**
 * The one address search the console has (address search everywhere, the
 * owner, 1 Oct 2026): `GET /geo/autocomplete` once the keystrokes settle,
 * one session minted per focus, a pick resolved through
 * `GET /geo/places/:placeId` and handed to `onPlace`. The pin picker and the
 * search-only address box both sit on it, so the vendor calls live here once.
 */
export function usePlaceSearch(query: string, { near, onPlace }: { near?: GeoPoint | null; onPlace: (place: GeocodedPlace) => void }): PlaceSearch {
    const live = geoReadsApi();
    const [open, setOpen] = React.useState(false);
    const [session, setSession] = React.useState<string | null>(null);
    const [lookupError, setLookupError] = React.useState<string | null>(null);
    const [looking, setLooking] = React.useState(false);
    const q = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
    const searchable = live && q.length >= AUTOCOMPLETE_MIN_INPUT;
    const predictions = useApiResource<PlacePrediction[]>(`pin-autocomplete:${searchable}:${open}:${session ?? "-"}:${q}`, () =>
        searchable && open ? geoService.autocomplete(q, { ...(session ? { session } : {}), ...(near ? { near } : {}) }) : Promise.resolve([]),
    );

    async function lookup(run: () => Promise<GeocodedPlace>): Promise<boolean> {
        setLooking(true);
        setLookupError(null);
        setOpen(false);
        try {
            onPlace(await run());
            /* One search spent; the next focus starts a new session. */
            setSession(null);
            return true;
        } catch (cause) {
            setLookupError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "The address could not be looked up.");
            return false;
        } finally {
            setLooking(false);
        }
    }

    return {
        live,
        open,
        setOpen,
        showing: open && searchable,
        q,
        rows: predictions.data ?? [],
        loading: predictions.loading,
        error: predictions.error,
        looking,
        lookupError,
        clearLookupError: () => setLookupError(null),
        begin: () => setSession((current) => current ?? mintSessionToken()),
        pick: (prediction) => lookup(() => geoService.place(prediction.placeId, session ?? undefined)),
        geocode: (address) => {
            const trimmed = address.trim();
            if (trimmed.length < GEOCODE_MIN_ADDRESS) return Promise.resolve(false);
            return lookup(() => geoService.geocode(trimmed));
        },
    };
}

/**
 * The predictions under a search box. `quiet` draws only rows — the plain
 * address box says nothing while it searches or when the vendor is silent,
 * because there it is still just a box for the address.
 */
export function PlaceSuggestions({ id, search, onPick, quiet }: { id: string; search: PlaceSearch; onPick: (prediction: PlacePrediction) => void; quiet?: boolean }) {
    if (!search.showing) return null;
    if (quiet && search.rows.length === 0) return null;
    return (
        <div
            id={id}
            role="listbox"
            aria-label="Matching places"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover text-sm shadow-md"
            /* Mouse down, not click: the input blurs (and the list closes) before a click would land. */
            onMouseDown={(event) => event.preventDefault()}
        >
            {search.loading && search.rows.length === 0 ? (
                <p className="px-3 py-2 text-muted-foreground">Searching…</p>
            ) : search.error ? (
                <p className="px-3 py-2 text-danger">{search.error}</p>
            ) : search.rows.length === 0 ? (
                <p className="px-3 py-2 text-muted-foreground">Nothing matches &ldquo;{search.q}&rdquo; — press Enter to look the address up as typed.</p>
            ) : (
                search.rows.map((prediction) => (
                    <button
                        key={prediction.placeId}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => onPick(prediction)}
                        className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-muted/50"
                    >
                        <span className="block w-full truncate">{prediction.mainText}</span>
                        {prediction.secondaryText ? <span className="block w-full truncate text-xs text-muted-foreground">{prediction.secondaryText}</span> : null}
                    </button>
                ))
            )}
        </div>
    );
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

    /* ---- The address search: the one "Find the address" bar every console address form shares. ---- */
    const apply = (place: GeocodedPlace) => {
        followRef.current = true;
        setDropped(null);
        write({ latitude: place.latitude, longitude: place.longitude });
        onAddress?.(place);
    };
    const under = reverse.data;

    return (
        <div className={cn("space-y-3", className)} data-testid="pin-picker">
            <AddressFinder
                id={id}
                label={labels?.search ?? "Find the spot"}
                placeholder={placeholders?.search ?? "Search an address or a landmark"}
                near={point}
                disabled={disabled}
                onPlace={apply}
                offlineSentence={FIXTURES_SEARCH_SENTENCE}
            />

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

export interface AddressFinderProps {
    /** The bar's input is `${id}-search`, its list `${id}-predictions`. */
    id: string;
    label?: string;
    placeholder?: string;
    /** Where to bias the suggestions, when the form knows. */
    near?: GeoPoint | null;
    disabled?: boolean;
    /** A picked place — the form fills what it has from it (the line, the city, the state, the PIN; the pin, where it keeps one). */
    onPlace: (place: GeocodedPlace) => void;
    /** What the bar says on fixtures, where there is nothing to search — the boxes under it, by default. */
    offlineSentence?: string;
    className?: string;
}

/**
 * "Find the address" — the search bar with the map's suggestions under it,
 * the one every console address form shows above its address boxes (the
 * owner, 1 Oct 2026: the advertiser's billing reads like the publisher's).
 * The pin picker draws it over its map (a listing's spot needs an exact
 * pin); every onboarding address draws it alone, with the address, city,
 * state and PIN boxes under it and the coordinates kept silently (the
 * owner, 1 Oct 2026: no map and no latitude/longitude on onboarding).
 * Enter picks the first suggestion, or geocodes what was typed.
 */
export function AddressFinder({ id, label = "Find the address", placeholder = ADDRESS_SEARCH_PLACEHOLDER, near, disabled, onPlace, offlineSentence = ADDRESS_FIXTURES_SENTENCE, className }: AddressFinderProps) {
    const live = geoReadsApi();
    const [query, setQuery] = React.useState("");
    const search = usePlaceSearch(query, {
        near,
        onPlace: (place) => {
            setQuery(place.formattedAddress);
            onPlace(place);
        },
    });
    const { rows, open, looking, lookupError } = search;
    const listId = `${id}-predictions`;

    return (
        <div className={cn("space-y-1.5", className)} data-testid={`${id}-finder`}>
            <Label htmlFor={`${id}-search`}>{label}</Label>
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                    id={`${id}-search`}
                    role="combobox"
                    aria-expanded={search.showing}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    className="pl-8"
                    value={query}
                    disabled={disabled || !live}
                    placeholder={placeholder}
                    autoComplete="off"
                    onChange={(event) => {
                        setQuery(event.target.value);
                        search.clearLookupError();
                        search.setOpen(true);
                    }}
                    onFocus={() => {
                        search.begin();
                        search.setOpen(true);
                    }}
                    onBlur={() => search.setOpen(false)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") search.setOpen(false);
                        if (event.key === "Enter") {
                            event.preventDefault();
                            if (rows.length > 0 && open) void search.pick(rows[0]);
                            else void search.geocode(query);
                        }
                    }}
                />
                <PlaceSuggestions id={listId} search={search} onPick={(prediction) => void search.pick(prediction)} />
            </div>
            {!live ? (
                <p className="text-xs text-muted-foreground">{offlineSentence}</p>
            ) : looking ? (
                <p className="text-xs text-muted-foreground">Looking the place up…</p>
            ) : lookupError ? (
                <p className="text-xs text-danger" role="alert">
                    {lookupError}
                </p>
            ) : null}
        </div>
    );
}
