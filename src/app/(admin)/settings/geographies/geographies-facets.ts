import { CITY_KINDS, CITY_STAGES, type CityKind, type CityListQuery, type CityStage } from "@/services/geo";

/**
 * The desk's URL — V-C. The tab and, on the Cities tab, every facet the
 * list is cut on, so a filtered view is a link and the resource key names
 * the whole request.
 */

export const GEO_TABS = ["overview", "map", "cities", "states"] as const;
export type GeoTab = (typeof GEO_TABS)[number];

export const GEO_TAB_LABEL: Record<GeoTab, string> = { overview: "Overview", map: "Map", cities: "Cities", states: "States" };

export interface CityFacets {
    state: string | null;
    district: string | null;
    stage: CityStage[];
    kind: CityKind[];
    minPopulation: number | null;
    q: string;
    sort: "population" | "name";
    page: number;
}

export const DEFAULT_CITY_FACETS: CityFacets = { state: null, district: null, stage: [], kind: [], minPopulation: null, q: "", sort: "population", page: 1 };

export const CITY_PAGE_SIZE = 50;

const isStage = (value: string): value is CityStage => (CITY_STAGES as readonly string[]).includes(value);
const isKind = (value: string): value is CityKind => (CITY_KINDS as readonly string[]).includes(value);

export function tabOf(params: URLSearchParams): GeoTab {
    const tab = params.get("tab");
    return (GEO_TABS as readonly string[]).includes(tab ?? "") ? (tab as GeoTab) : "overview";
}

export function cityFacetsOf(params: URLSearchParams): CityFacets {
    const page = Number(params.get("page") ?? "1");
    const minPopulation = Number(params.get("minPopulation") ?? "");
    const sort = params.get("sort");
    return {
        state: params.get("state")?.trim() || null,
        district: params.get("district")?.trim() || null,
        stage: (params.get("stage") ?? "").split(",").map((value) => value.trim()).filter(isStage),
        kind: (params.get("kind") ?? "").split(",").map((value) => value.trim()).filter(isKind),
        minPopulation: Number.isInteger(minPopulation) && minPopulation > 0 ? minPopulation : null,
        q: params.get("q")?.trim() ?? "",
        sort: sort === "name" ? "name" : "population",
        page: Number.isInteger(page) && page > 0 ? page : 1,
    };
}

/** The desk's query string: the tab, then the Cities facets when that tab is open. */
export function geoQuery(tab: GeoTab, facets: CityFacets = DEFAULT_CITY_FACETS): string {
    const next = new URLSearchParams();
    if (tab !== "overview") next.set("tab", tab);
    if (tab === "cities") {
        if (facets.state) next.set("state", facets.state);
        if (facets.district) next.set("district", facets.district);
        if (facets.stage.length) next.set("stage", facets.stage.join(","));
        if (facets.kind.length) next.set("kind", facets.kind.join(","));
        if (facets.minPopulation !== null) next.set("minPopulation", String(facets.minPopulation));
        if (facets.q) next.set("q", facets.q);
        if (facets.sort !== "population") next.set("sort", facets.sort);
        if (facets.page > 1) next.set("page", String(facets.page));
    }
    return next.toString();
}

/** A link into the desk — `/settings/geographies?tab=cities&stage=SEEDING`. */
export function geoHref(tab: GeoTab, facets: Partial<CityFacets> = {}): string {
    const qs = geoQuery(tab, { ...DEFAULT_CITY_FACETS, ...facets });
    return qs ? `/settings/geographies?${qs}` : "/settings/geographies";
}

/** The facets as `GET /geo/cities` takes them. */
export function cityQueryOf(facets: CityFacets): CityListQuery {
    return {
        ...(facets.state ? { state: facets.state } : {}),
        ...(facets.district ? { district: facets.district } : {}),
        ...(facets.stage.length ? { stage: facets.stage } : {}),
        ...(facets.kind.length ? { kind: facets.kind } : {}),
        ...(facets.minPopulation !== null ? { minPopulation: facets.minPopulation } : {}),
        ...(facets.q ? { q: facets.q } : {}),
        sort: facets.sort,
        page: facets.page,
        pageSize: CITY_PAGE_SIZE,
    };
}

/** The resource key — every facet the server cuts on. */
export const cityFacetsKey = (facets: CityFacets): string =>
    [facets.state ?? "-", facets.district ?? "-", facets.stage.join("+") || "-", facets.kind.join("+") || "-", facets.minPopulation ?? "-", facets.q || "-", facets.sort, facets.page].join(":");
