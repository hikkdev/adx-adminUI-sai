import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { MapsProvider } from "@/services/integrations";

/**
 * The maps seam's client half — G7 (Q101/132): `GET /app/maps` answers the
 * provider ops chose under Settings › Integrations › Maps and the one
 * credential a browser may hold: the Google browser key, or the Mapbox
 * public token. The server key and the secret token never leave through
 * here, and the key is `null` while it is still to come (Q128), which is
 * what the console's map surface draws its placeholder on.
 *
 * Z-C: OpenStreetMap is the third provider (the owner, 15 Sep 2026). It
 * has no key — the answer is the raster tile line: the template the tiles
 * are drawn from (a tile vendor's browser key already in it when the host
 * is one whose keys are browser keys by design), the attribution every
 * map must print, the deepest zoom the tiles go, and `publicTiles` — true
 * while the template still names tile.openstreetmap.org, whose policy
 * forbids heavy app use.
 *
 * The provider is the platform's choice, made once on the console, so this
 * file holds no default key and no vendor of its own; `components/adx/map.tsx`
 * is the one place that imports a map library.
 */
export type MapsClientConfig =
    | { provider: "GOOGLE"; googleBrowserKey: string | null }
    | { provider: "MAPBOX"; mapboxPublicToken: string | null }
    | { provider: "OSM"; tileUrlTemplate: string; tileAttribution: string; tileMaxZoom: number; publicTiles: boolean };

/**
 * What the browser draws tiles with, whichever vendor — the Google key, the
 * Mapbox token, or on OSM the tile template itself (no key: the template is
 * the credential's stand-in, and its presence is what the surface draws
 * on). Null while ops have not set one.
 */
export function browserKeyOf(config: MapsClientConfig | null | undefined): string | null {
    if (!config) return null;
    const key = config.provider === "OSM" ? config.tileUrlTemplate : config.provider === "MAPBOX" ? config.mapboxPublicToken : config.googleBrowserKey;
    return key?.trim() || null;
}

/** The placeholder's one sentence, the same words the phones print. */
export function vendorSentence(provider: MapsProvider | null | undefined): string {
    if (provider === "OSM") return "Tiles arrive from the OpenStreetMap tile server named under Settings › Integrations › Maps. Everything else on this screen works.";
    return provider === "MAPBOX"
        ? "Tiles arrive with the Mapbox token. Everything else on this screen works."
        : "Tiles arrive with the Google Maps key. Everything else on this screen works.";
}

export const mapsService = {
    /**
     * The client config, once per screen. Any signed-in operator may read
     * it (`authenticate`); a console running on fixtures answers null and
     * the surface says so instead of drawing an unauthorised grey map.
     */
    clientConfig: async (): Promise<MapsClientConfig | null> => {
        if (!apiConfig.live) return null;
        return (await http.get<MapsClientConfig | null>("/app/maps")) ?? null;
    },
};
