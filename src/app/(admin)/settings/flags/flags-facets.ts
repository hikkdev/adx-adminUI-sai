import {
    FLAG_KINDS,
    FLAG_SOURCES,
    FLAG_STATES,
    FLAG_SURFACES,
    flagStateOf,
    isFlagKind,
    isFlagSource,
    isFlagState,
    isFlagSurface,
    type FeatureFlag,
    type FlagKind,
    type FlagSource,
    type FlagState,
    type FlagSurface,
} from "@/services/flags";

/**
 * The desk's filters — package L-C.
 *
 * Every facet sits in the URL (`?surface=&kind=&source=&state=&owner=&q=`),
 * so a reload keeps the view and a link can land on "every dark launch on
 * the agent app". The vocabulary is the one `GET /flags` takes server-side
 * (L-B), and the rules below are the server's own — `filterFlags` here and
 * `matchesFilter` there must leave the same rows, or "Select all N
 * matching" would name keys the operator is not looking at.
 */
export interface FlagFacets {
    surface: "ALL" | FlagSurface;
    kind: "ALL" | FlagKind;
    source: "ALL" | FlagSource;
    state: "ALL" | FlagState;
    /** Exact, case-insensitive; empty for every owner. */
    owner: string;
    /** The search box: a substring over key, description, owner and aliases. */
    q: string;
}

export const DEFAULT_FLAG_FACETS: FlagFacets = { surface: "ALL", kind: "ALL", source: "ALL", state: "ALL", owner: "", q: "" };

/** The facets the URL names; anything outside the vocabulary is the default. */
export function readFlagFacets(params: URLSearchParams): FlagFacets {
    const surface = params.get("surface");
    const kind = params.get("kind");
    const source = params.get("source");
    const state = params.get("state");
    return {
        surface: isFlagSurface(surface) ? surface : "ALL",
        kind: isFlagKind(kind) ? kind : "ALL",
        source: isFlagSource(source) ? source : "ALL",
        state: isFlagState(state) ? state : "ALL",
        owner: params.get("owner")?.trim() ?? "",
        q: params.get("q") ?? "",
    };
}

/** The URL for a set of facets, with nothing written that is the default. */
export function flagFacetsHref(pathname: string, facets: FlagFacets): string {
    const query = new URLSearchParams();
    if (facets.surface !== "ALL") query.set("surface", facets.surface);
    if (facets.kind !== "ALL") query.set("kind", facets.kind);
    if (facets.source !== "ALL") query.set("source", facets.source);
    if (facets.state !== "ALL") query.set("state", facets.state);
    if (facets.owner.trim()) query.set("owner", facets.owner.trim());
    if (facets.q.trim()) query.set("q", facets.q.trim());
    const search = query.toString();
    return search ? `${pathname}?${search}` : pathname;
}

/** One string per distinct set of facets — the table remounts on it, so a selection never outlives the filter it was made under. */
export const flagFacetsKey = (facets: FlagFacets): string => flagFacetsHref("", facets);

export type FlagFacetName = keyof FlagFacets;

/** Whether one row passes the facets — optionally with one facet ignored, which is how a chip row counts. */
export function matchesFlagFacets(flag: FeatureFlag, facets: FlagFacets, ignore?: FlagFacetName): boolean {
    if (ignore !== "surface" && facets.surface !== "ALL" && !flag.surfaces.includes(facets.surface)) return false;
    if (ignore !== "kind" && facets.kind !== "ALL" && flag.kind !== facets.kind) return false;
    if (ignore !== "source" && facets.source !== "ALL" && flag.source !== facets.source) return false;
    if (ignore !== "state" && facets.state !== "ALL" && flagStateOf(flag) !== facets.state) return false;
    if (ignore !== "owner" && facets.owner.trim() && (flag.owner ?? "").toLowerCase() !== facets.owner.trim().toLowerCase()) return false;
    const query = ignore === "q" ? "" : facets.q.trim().toLowerCase();
    if (!query) return true;
    return [flag.key, flag.description ?? "", flag.owner ?? "", ...(flag.aliases ?? [])].some((text) => text.toLowerCase().includes(query));
}

/** The rows the facets leave — the same rows `GET /flags?surface=&kind=&source=&state=&owner=&q=` would answer. */
export function filterFlags(flags: readonly FeatureFlag[], facets: FlagFacets): FeatureFlag[] {
    return flags.filter((flag) => matchesFlagFacets(flag, facets));
}

/** The chip counts: each facet tallied with its own filter removed (shared/pagination's chip rule), so a chip row stays a way back out. */
export function flagFacetCounts(flags: readonly FeatureFlag[], facets: FlagFacets) {
    const without = (facet: FlagFacetName) => flags.filter((flag) => matchesFlagFacets(flag, facets, facet));
    const tally = <K extends string>(keys: readonly K[], rows: FeatureFlag[], of: (flag: FeatureFlag) => readonly K[]): Record<K, number> => {
        const out = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
        for (const flag of rows) for (const key of of(flag)) if (key in out) out[key] += 1;
        return out;
    };
    const bySurface = without("surface");
    const byKind = without("kind");
    const bySource = without("source");
    const byState = without("state");
    return {
        surface: { ALL: bySurface.length, ...tally(FLAG_SURFACES, bySurface, (flag) => flag.surfaces) },
        kind: { ALL: byKind.length, ...tally(FLAG_KINDS, byKind, (flag) => [flag.kind]) },
        source: { ALL: bySource.length, ...tally(FLAG_SOURCES, bySource, (flag) => [flag.source]) },
        state: { ALL: byState.length, ...tally(FLAG_STATES, byState, (flag) => [flagStateOf(flag)]) },
    };
}

/** The distinct owners the rows and the registry name, sorted case-insensitively — the Owner select's options. */
export function ownersOf(flags: readonly Pick<FeatureFlag, "owner">[], registryOwners: readonly string[] = []): string[] {
    const seen = new Map<string, string>();
    for (const owner of [...flags.map((flag) => flag.owner ?? ""), ...registryOwners]) {
        const trimmed = owner.trim();
        if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
