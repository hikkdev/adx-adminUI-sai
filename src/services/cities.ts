import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * The resolver's side of a city — `GET /pricing/cities` and
 * `PATCH /pricing/cities/:slug` (Lot A, Q31).
 *
 * `City` lives under pricing on the server because the resolver does: the
 * same table that turns "Bangalore" into `bengaluru` for a rate card is the
 * one that says whether a listing may be created there at all. What ops can
 * do through this file is teach the resolver another spelling. Since Lot V
 * the table is the country (`services/geo.ts` — the catalogue, the stages
 * and the six switches), and whether a city is open is a stage move on the
 * Geographies desk, not a flag here: the backend answers 400 to `isActive`
 * on this PATCH and points at `/geo/cities/:slug/rollout`. `isActive` stays
 * on the read as the mirror of the stage for the readers that predate it.
 *
 * Name and state are not editable through the PATCH — a city is renamed by
 * the seed. No fixtures: the six chips the old Settings page drew were
 * strings, not rows.
 */

export interface City {
    /** Canonical key — and the only identity the wire carries (`GET /pricing/cities` selects slug, name, state, aliases, isActive; no id). */
    slug: string;
    /** How it is written on screen: "Bengaluru". */
    name: string;
    state: string | null;
    /** Every other spelling that resolves here, already normalised. */
    aliases: string[];
    isActive: boolean;
    updatedAt?: string;
}

export interface UpdateCityInput {
    aliases?: string[];
}

export const CITY_ALIAS_MAX = 25;
export const CITY_ALIAS_LENGTH_MAX = 80;

/**
 * One alias per line or comma, trimmed, emptied and de-duplicated — the
 * shape the textarea hands the PATCH. The server slugifies each one on the
 * way in, so "Bangalore" and "bangalore" are one alias to it; this only
 * stops the obvious doubles from being sent twice.
 */
export function parseAliases(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of text.split(/[\n,]/)) {
        const alias = raw.trim().slice(0, CITY_ALIAS_LENGTH_MAX);
        const key = alias.toLowerCase();
        if (!alias || seen.has(key)) continue;
        seen.add(key);
        out.push(alias);
        if (out.length >= CITY_ALIAS_MAX) break;
    }
    return out;
}

/** "Bengaluru, Karnataka" or just the name. */
export function cityLabel(city: Pick<City, "name" | "state">): string {
    return city.state ? `${city.name}, ${city.state}` : city.name;
}

/** Open ones first, then by name — the order a list of markets reads in. */
export function sortCities(cities: City[]): City[] {
    return [...cities].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
}

/** This screen reads the API or says it cannot; there is no seeded stand-in. */
export const citiesReadApi = (): boolean => apiConfig.live;

export const citiesService = {
    /** Every row of the table — the whole catalogue once seeded (~6,500); prefer `geoService.cities` for anything paged or searched. */
    list: async (): Promise<City[]> => sortCities((await http.get<City[]>("/pricing/cities")) ?? []),

    /** Replaces a city's aliases. Audited `CITY_UPDATED`. The stage is `geoService.rollout`. */
    update: (slug: string, input: UpdateCityInput): Promise<City> =>
        http.patch<City>(`/pricing/cities/${encodeURIComponent(slug)}`, input),
};
