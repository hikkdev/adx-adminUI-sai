import type { MapsProvider } from "@/services/integrations";

/**
 * AD-C: the external "open in maps" links, provider-aware.
 *
 * Every screen that prints a coordinate used to hand out a google.com/maps
 * link whatever vendor ops had chosen. Now the link follows the provider
 * `GET /app/maps` answers: OpenStreetMap opens openstreetmap.org with the
 * pin marked, Google opens Google Maps, and Mapbox — which has no public
 * web map to send anyone to — opens Google Maps too. An unknown provider
 * (the config not read yet, the console on fixtures) is Google, the
 * platform's default (Q101).
 *
 * `label` is carried for the caller's link text and aria; neither vendor's
 * URL takes a free-text label beside a coordinate pair, so it never
 * reaches the URL.
 */

export interface MapsLinkTarget {
    lat: number;
    lng: number;
    label?: string;
}

/** Six decimals — about a decimetre — and never exponent notation in a URL. */
const coord = (value: number): string => value.toFixed(6).replace(/\.?0+$/, "");

export function mapsLink({ lat, lng }: MapsLinkTarget, provider: MapsProvider | null | undefined): string {
    if (provider === "OSM") return `https://www.openstreetmap.org/?mlat=${coord(lat)}&mlon=${coord(lng)}#map=17/${coord(lat)}/${coord(lng)}`;
    return `https://www.google.com/maps/search/?api=1&query=${coord(lat)},${coord(lng)}`;
}

export function directionsLink({ lat, lng }: MapsLinkTarget, provider: MapsProvider | null | undefined): string {
    if (provider === "OSM") return `https://www.openstreetmap.org/directions?to=${coord(lat)}%2C${coord(lng)}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${coord(lat)},${coord(lng)}`;
}

/** The vendor's name for the link text: "Open in OpenStreetMap" / "Open in Google Maps". */
export function mapsLinkLabel(provider: MapsProvider | null | undefined): string {
    return provider === "OSM" ? "Open in OpenStreetMap" : "Open in Google Maps";
}
