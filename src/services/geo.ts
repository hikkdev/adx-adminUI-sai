import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { AudiencePolicy, AudienceProvenanceByField, AudienceShare, AudienceVendor } from "@/services/audience";
import type { ListPage } from "@/services/section-overviews";
import type { Tone } from "@/types";

/**
 * The geography catalogue and the city rollout — Lot V (the owner, 15 Sep
 * 2026): "the geographical section should be free of any restrictions.
 * Instead there should be better control features so we can select what
 * city to go into and launch ADX or what city to pull our business out of,
 * what city to gather our listing from."
 *
 * So the catalogue is the country (GeoNames, ~6,500 towns under 763
 * districts and 36 states, seeded from `POST /geo/seed`) and control is a
 * stage per city plus six function switches, changed from the console
 * without a deploy. Everything here is `/geo/*` on the backend's geo
 * module; `City` stays pricing's table — `services/cities.ts` keeps the
 * alias editor over `PATCH /pricing/cities/:slug`, and the open / closed
 * switch that used to live there is now a stage move here (the backend
 * answers 400 to `isActive` and points at the rollout route).
 *
 * A name the catalogue does not know is still allowed everywhere — free
 * text stays free; only a catalogued city whose stage says no refuses. That
 * is why the shared city combobox (`components/adx/city-combobox.tsx`) hands
 * back a string, never an id.
 */

/* ------------------------------------------------------------------ */
/* The stages                                                           */
/* ------------------------------------------------------------------ */

export const CITY_STAGES = ["PLANNED", "SEEDING", "LAUNCHED", "PAUSED", "WITHDRAWN"] as const;
export type CityStage = (typeof CITY_STAGES)[number];

/** The Prisma `CityStage` enum, as the desk prints it. */
export const CITY_STAGE_LABEL: Record<CityStage, string> = {
    PLANNED: "Planned",
    SEEDING: "Seeding",
    LAUNCHED: "Launched",
    PAUSED: "Paused",
    WITHDRAWN: "Withdrawn",
};

export const CITY_STAGE_TONE: Record<CityStage, Tone> = {
    PLANNED: "neutral",
    SEEDING: "info",
    LAUNCHED: "success",
    PAUSED: "warning",
    WITHDRAWN: "danger",
};

/** What each stage means, in the words the README uses. */
export const CITY_STAGE_MEANING: Record<CityStage, string> = {
    PLANNED: "In the catalogue, nothing on.",
    SEEDING: "Gathering supply: listings created, imported and verified, agents onboarded, leads fed; nothing published, nothing sold.",
    LAUNCHED: "Open for business.",
    PAUSED: "Nothing new; what runs, runs — orders and campaigns already placed complete.",
    WITHDRAWN: "Out. The hourly wind-down takes the live listings down.",
};

/**
 * The moves the backend's stage table allows (`rollout.rules.ts`; anything
 * else is a 409). WITHDRAWN → SEEDING or LAUNCHED is re-entry: nothing is
 * republished, each publisher relists what they still have.
 */
export const ALLOWED_MOVES: Record<CityStage, readonly CityStage[]> = {
    PLANNED: ["SEEDING", "LAUNCHED"],
    SEEDING: ["LAUNCHED", "PAUSED", "WITHDRAWN"],
    LAUNCHED: ["PAUSED", "WITHDRAWN"],
    PAUSED: ["LAUNCHED", "WITHDRAWN"],
    WITHDRAWN: ["SEEDING", "LAUNCHED"],
};

export const canMove = (from: CityStage, to: CityStage): boolean => ALLOWED_MOVES[from].includes(to);

/* ------------------------------------------------------------------ */
/* The switches                                                         */
/* ------------------------------------------------------------------ */

export const CITY_SWITCHES = ["supplyIntake", "publishing", "demand", "agentOnboarding", "printPartners", "leadFeeds"] as const;
export type CitySwitch = (typeof CITY_SWITCHES)[number];
export type CitySwitches = Record<CitySwitch, boolean>;

/** The label the toggle carries and what the switch gates — who refuses when it is off. */
export const CITY_SWITCH_META: Record<CitySwitch, { label: string; gates: string }> = {
    supplyIntake: { label: "Gather listings", gates: "New inventory: creating a listing, and the listing importer's new spots." },
    publishing: { label: "Publish listings", gates: "A listing going live — publish, and a cleared site visit holds the listing instead of auto-publishing." },
    demand: { label: "Take bookings", gates: "Campaigns targeting the city, and the browse answers 'coming soon' instead of rows." },
    agentOnboarding: { label: "Onboard agents", gates: "Signing an agent for the city — the create dialog and the party importer's agent rows." },
    printPartners: { label: "Print partners", gates: "Signing and switching on a print shop in the city." },
    leadFeeds: { label: "Lead feeds", gates: "Filling the lead pool — a lead import row in a closed city is CITY_NOT_OPEN on its report." },
};

/** The switches each stage starts from on entry (the body may override any of them). */
export const STAGE_DEFAULT_SWITCHES: Record<CityStage, CitySwitches> = {
    PLANNED: { supplyIntake: false, publishing: false, demand: false, agentOnboarding: false, printPartners: false, leadFeeds: false },
    SEEDING: { supplyIntake: true, publishing: false, demand: false, agentOnboarding: true, printPartners: false, leadFeeds: true },
    LAUNCHED: { supplyIntake: true, publishing: true, demand: true, agentOnboarding: true, printPartners: true, leadFeeds: true },
    PAUSED: { supplyIntake: false, publishing: false, demand: false, agentOnboarding: false, printPartners: false, leadFeeds: false },
    WITHDRAWN: { supplyIntake: false, publishing: false, demand: false, agentOnboarding: false, printPartners: false, leadFeeds: false },
};

/** "Gather listings, Onboard agents and Lead feeds on; the rest off" — what the confirm says a stage sets. */
export function defaultSwitchesSentence(stage: CityStage): string {
    const on = CITY_SWITCHES.filter((key) => STAGE_DEFAULT_SWITCHES[stage][key]).map((key) => CITY_SWITCH_META[key].label);
    if (on.length === 0) return "Every switch off.";
    if (on.length === CITY_SWITCHES.length) return "Every switch on.";
    const list = on.length === 1 ? on[0] : `${on.slice(0, -1).join(", ")} and ${on[on.length - 1]}`;
    return `${list} on; the rest off.`;
}

/**
 * What entering a stage does beyond the switches — the consequences the
 * confirm must name. WITHDRAWN is the one with teeth: the hourly wind-down
 * (`jobs/city-winddown.job.ts`) does the four things listed.
 */
export const STAGE_CONSEQUENCES: Record<CityStage, readonly string[]> = {
    PLANNED: [],
    SEEDING: ["Nothing is published and nothing sells until the city is launched."],
    LAUNCHED: ["Open for business: every gated function answers yes from now."],
    PAUSED: ["Nothing new is taken; orders and campaigns already placed run to completion. There is no wind-down."],
    WITHDRAWN: [
        "Every live listing in the city is unpublished within the hour, and each publisher is told once.",
        "Running campaigns are left to complete; no new booking is taken.",
        "Every open lead in the city is closed as lost, with 'city withdrawn' on its thread.",
        "Every active agent in the city is told once.",
        "Coming back later republishes nothing — each publisher relists what they still have.",
    ],
};

/* ------------------------------------------------------------------ */
/* The wire                                                             */
/* ------------------------------------------------------------------ */

export const CITY_KINDS = ["NATIONAL_CAPITAL", "STATE_CAPITAL", "DISTRICT_HQ", "SUBDISTRICT_HQ", "TOWN"] as const;
export type CityKind = (typeof CITY_KINDS)[number];

export const CITY_KIND_LABEL: Record<CityKind, string> = {
    NATIONAL_CAPITAL: "National capital",
    STATE_CAPITAL: "State capital",
    DISTRICT_HQ: "District HQ",
    SUBDISTRICT_HQ: "Sub-district HQ",
    TOWN: "Town",
};

export type CitySource = "SEED" | "GEONAMES" | "MANUAL";

export type StageCounts = Record<CityStage, number>;

/** A city as the catalogue holds it — `GET /geo/cities` rows, `PATCH …/rollout` and `POST /geo/cities` answers. */
export interface GeoCity {
    id: string;
    slug: string;
    name: string;
    /** The free-text state the Lot A seed carried; `geoState` is the catalogue relation. */
    state: string | null;
    aliases: string[];
    /** The mirror of the stage: SEEDING, LAUNCHED and PAUSED are active. */
    isActive: boolean;
    stateId: string | null;
    districtId: string | null;
    latitude: number | null;
    longitude: number | null;
    population: number | null;
    kind: CityKind | null;
    geonameId: number | null;
    source: CitySource;
    stage: CityStage;
    switches: CitySwitches;
    launchedAt: string | null;
    pausedAt: string | null;
    withdrawnAt: string | null;
    rolloutNote: string | null;
    geoState: { code: string; name: string } | null;
    geoDistrict: { code: string; name: string } | null;
}

/** The seven counts beside the stage — Lot X-B: exact by the city key, with the typed spellings as the fallback for rows that carry none. */
export interface CityCounts {
    publishers: number;
    listingsLive: number;
    listingsTotal: number;
    advertisers: number;
    agents: number;
    printPartners: number;
    openLeads: number;
}

export interface RolloutEvent {
    id: string;
    cityId: string;
    fromStage: CityStage;
    toStage: CityStage;
    /** `{ switches, flipped }` on a move; `{ marker: 'WIND_DOWN_DONE', … }` on the wind-down's own event. */
    flags: unknown;
    byUserId: string;
    /** The actor's label, resolved by the backend; absent when the user no longer exists. */
    byUser?: { id: string; name: string } | null;
    note: string | null;
    at: string;
}

/** Who moved the city — the resolved name, falling back to the raw user id. */
export const rolloutActorLabel = (event: Pick<RolloutEvent, "byUserId" | "byUser">): string =>
    event.byUser?.name?.trim() || event.byUserId;

/** `GET /geo/cities/:slug` — the row, its last 50 events and its counts. */
export interface GeoCityDetail extends GeoCity {
    counts: CityCounts;
    events: RolloutEvent[];
}

export type ReadinessKey = "rateCard" | "agents" | "listings" | "printPartner" | "vocabulary" | "audience";

export const READINESS_LABEL: Record<ReadinessKey, string> = {
    rateCard: "Rate card in force",
    agents: "An agent on each side",
    listings: "Enough live listings",
    printPartner: "A print partner",
    vocabulary: "Pricing vocabulary",
    audience: "Audience data",
};

export interface ReadinessCheck {
    key: ReadinessKey;
    ok: boolean;
    detail: string;
    /** Y-B: a soft check — `audience`, whether a panel backs the city — is printed but never counted in `ready`. */
    soft?: true;
}

/** `GET /geo/cities/:slug/readiness` — advisory, never a gate on the server. */
export interface CityReadiness {
    city: string;
    stage: CityStage;
    ready: boolean;
    checks: ReadinessCheck[];
}

/** The checks that count: not ok, and not soft. */
export const failingChecks = (readiness: Pick<CityReadiness, "checks">): ReadinessCheck[] => readiness.checks.filter((check) => !check.ok && !check.soft);

/**
 * Y-B: the city audience profile — `GET /geo/cities/:slug/audience?period=`.
 * The blend over the city's live spots' stored panels for a month: the
 * MEAN daily footfall per catchment (a city's spots overlap; a sum would
 * count the same street twice), the mixes weighted by footfall, how much
 * of the supply the panels cover, the vendors in force and how far they
 * agree. It calls no vendor unless `audience.cityProfileSamplePoints` is
 * on in the platform settings, and then reports the grid it asked.
 */
export interface CityAudienceProfile {
    city: string;
    /** YYYY-MM. */
    period: string;
    provenance: "PANEL";
    /** The legacy one-vendor label; NONE when nothing backs a figure. */
    provider: "NONE" | AudienceVendor;
    vendors: AudienceVendor[];
    /** The policy the rows were blended by; null with no vendor. */
    policy: AudiencePolicy | null;
    provenanceByField: AudienceProvenanceByField;
    agreement: { footfall: number | null };
    /** Live spots in the city; those with a panel for the period; the share (null with no spots). */
    coverage: { spots: number; withSnapshot: number; ratio: number | null };
    /** The sample grid when the setting is on; null when off. */
    samplePoints: { configured: number; asked: number; withSnapshot: number } | null;
    footfall: { daily: number | null; byHour: number[] | null; byWeekday: number[] | null };
    demographics: {
        ageBands: AudienceShare[] | null;
        gender: AudienceShare[] | null;
        incomeBands: AudienceShare[] | null;
        affinities: AudienceShare[] | null;
    };
    /** Says what the figures rest on, in words a screen can print. */
    basis: string;
    computedAt: string;
}

/** "3 of 5 spots have data" — the coverage line; "no live spots" when there is nothing to cover. */
export function coverageSentence(coverage: CityAudienceProfile["coverage"]): string {
    if (coverage.spots === 0) return "No live spot to read a panel for";
    return `${coverage.withSnapshot} of ${coverage.spots} live spot${coverage.spots === 1 ? "" : "s"} ${coverage.withSnapshot === 1 ? "has" : "have"} data`;
}

export interface GeoStateRow {
    id: string;
    /** GeoNames admin1 code — "19" is Karnataka. */
    code: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    counts: StageCounts;
    cities: number;
}

export interface GeoDistrictRow {
    id: string;
    code: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    counts: StageCounts;
    cities: number;
}

export interface GeoDistricts {
    state: { id: string; code: string; name: string };
    items: GeoDistrictRow[];
}

export interface GeoSummary {
    stages: StageCounts;
    cities: number;
    statesWithActivity: number;
    /** The states with any non-PLANNED city. */
    states: { code: string; name: string; counts: StageCounts }[];
}

/** One pin on the map — `GET /geo/map`. */
export interface GeoMapPoint {
    slug: string;
    name: string;
    stage: CityStage;
    latitude: number | null;
    longitude: number | null;
    population: number | null;
    kind: CityKind | null;
    /** 0 for a PLANNED pin — a city that could not have any. */
    listingsLive: number;
}

/**
 * Lot X-B: the eight party tables that carry the city key beside the typed
 * `city` — `pricing.repository`'s `CITY_KEYED_TABLES`, in its order.
 */
export const CITY_KEYED_TABLES = ["publishers", "advertisers", "agents", "printPartners", "listings", "leads", "fieldVisits", "campaigns"] as const;
export type CityKeyedTable = (typeof CITY_KEYED_TABLES)[number];

export const CITY_KEYED_TABLE_LABEL: Record<CityKeyedTable, string> = {
    publishers: "Publishers",
    advertisers: "Advertisers",
    agents: "Agents",
    printPartners: "Print partners",
    listings: "Listings",
    leads: "Leads",
    fieldVisits: "Field visits",
    campaigns: "Campaigns",
};

/** One typed city string no catalogue row answers to, folded case-insensitively, with its rows per table. */
export interface UnresolvedCity {
    city: string;
    total: number;
    tables: Partial<Record<CityKeyedTable, number>>;
}

/** `GET /geo/unresolved` — the strings, how many of them, how many rows they hold between them. */
export interface GeoUnresolved {
    items: UnresolvedCity[];
    total: number;
    rows: number;
}

/**
 * Lot X-L: `POST /geo/backfill-city-keys` — the console's run of what
 * `npm run backfill:city-keys` does: the resolver over every null city key
 * across the eight party tables, one table at a time. 409 while another run
 * holds the lock.
 */
export interface CityKeyBackfillReport {
    tables: { table: CityKeyedTable; resolved: number; stillNull: number }[];
}

/** "12 rows keyed, 3 still typed" — the report's one-line total. */
export function backfillSummary(report: CityKeyBackfillReport): string {
    const resolved = report.tables.reduce((sum, row) => sum + row.resolved, 0);
    const stillNull = report.tables.reduce((sum, row) => sum + row.stillNull, 0);
    return `${resolved} ${resolved === 1 ? "row" : "rows"} keyed, ${stillNull} still typed`;
}

export interface BulkRolloutResult {
    changed: { slug: string; from: CityStage; to: CityStage }[];
    unchanged: string[];
    /** The cities the stage table refused from where they stand — named, never the batch failed. */
    skipped: { slug: string; reason: string }[];
}

export interface GeoSeedResult {
    states: { created: number; updated: number; total: number };
    districts: { created: number; updated: number; total: number };
    cities: { created: number; matched: number; updated: number; unchanged: number; unmatchedSeed: string[]; total: number };
    source: string;
    generatedOn: string;
}

/* ------------------------------------------------------------------ */
/* Queries and bodies                                                   */
/* ------------------------------------------------------------------ */

export interface CityListQuery {
    state?: string;
    district?: string;
    stage?: CityStage[];
    q?: string;
    kind?: CityKind[];
    minPopulation?: number;
    sort?: "population" | "name";
    page?: number;
    pageSize?: number;
}

export type GeoCityPage = ListPage<GeoCity>;

/** `PATCH /geo/cities/:slug/rollout` — the stage, any switch, the note; at least one of them. */
export type RolloutPatch = Partial<CitySwitches> & { stage?: CityStage; note?: string };

/** `POST /geo/rollout` — exactly one scope. */
export type BulkRolloutBody = { stage: CityStage; switches?: Partial<CitySwitches>; note?: string } & (
    | { citySlugs: string[] }
    | { stateCode: string }
    | { districtId: string }
);

export interface AddCityBody {
    name: string;
    stateCode: string;
    districtCode?: string;
    lat: number;
    lng: number;
    aliases?: string[];
    population?: number;
    kind?: CityKind;
}

export const ROLLOUT_NOTE_MAX = 500;

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** "Bengaluru, Karnataka" — the catalogue's state first, the seed's free text otherwise. */
export function geoCityLabel(city: Pick<GeoCity, "name" | "state" | "geoState">): string {
    const state = city.geoState?.name ?? city.state;
    return state ? `${city.name}, ${state}` : city.name;
}

export const stateNameOf = (city: Pick<GeoCity, "state" | "geoState">): string | null => city.geoState?.name ?? city.state;

export function emptyStageCounts(): StageCounts {
    return { PLANNED: 0, SEEDING: 0, LAUNCHED: 0, PAUSED: 0, WITHDRAWN: 0 };
}

/** The list contract's `counts` (a string map) as the five stages, missing ones 0. */
export function stageCountsOf(counts: Record<string, number> | StageCounts | null | undefined): StageCounts {
    const out = emptyStageCounts();
    for (const stage of CITY_STAGES) out[stage] = counts?.[stage] ?? 0;
    return out;
}

/** The cities of a state or a district that are not PLANNED — "with activity". */
export const activeCityCount = (counts: StageCounts): number => counts.SEEDING + counts.LAUNCHED + counts.PAUSED + counts.WITHDRAWN;

/** Whether the catalogue has been seeded: more than the handful of Lot A rows. */
export const SEEDED_THRESHOLD = 1000;
export const isSeeded = (summary: Pick<GeoSummary, "cities">): boolean => summary.cities >= SEEDED_THRESHOLD;

function cityQuery(query: CityListQuery): string {
    const params = new URLSearchParams();
    if (query.state) params.set("state", query.state);
    if (query.district) params.set("district", query.district);
    if (query.stage?.length) params.set("stage", query.stage.join(","));
    if (query.q) params.set("q", query.q);
    if (query.kind?.length) params.set("kind", query.kind.join(","));
    if (query.minPopulation !== undefined) params.set("minPopulation", String(query.minPopulation));
    if (query.sort) params.set("sort", query.sort);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

/** "minLng,minLat,maxLng,maxLat" — the map read's bbox. */
export type MapBbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** These screens read the API or say they cannot; a seeded stand-in would be a market ADX had not opened. */
/* ------------------------------------------------------------------ */
/* AD-C: the provider-neutral lookups                                    */
/* ------------------------------------------------------------------ */

/** A point on the ground, the way the backend's maps port spells it. */
export type GeoPoint = { latitude: number; longitude: number };

/** An address resolved to a point — `GET /geo/geocode`, `GET /geo/reverse`, `GET /geo/places/:placeId`. */
export interface GeocodedPlace {
    formattedAddress: string;
    latitude: number;
    longitude: number;
    placeId: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
}

/** A place a typed fragment might mean — `GET /geo/autocomplete`. No coordinates by design: the pick fetches them. */
export interface PlacePrediction {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string | null;
}

export interface PlaceDetails extends GeocodedPlace {
    name: string | null;
}

export type DirectionsMode = "driving" | "two_wheeler";

export interface DirectionsStep {
    instruction: string | null;
    distanceM: number;
    durationS: number;
    polyline: string | null;
}

/** A route between two points — `GET /geo/directions`. */
export interface Directions {
    polyline: string;
    distanceM: number;
    durationS: number;
    steps: DirectionsStep[];
    mode: DirectionsMode;
    modeUsed: DirectionsMode;
    provider: "GOOGLE" | "MAPBOX" | "OSM";
}

export interface AutocompleteOptions {
    /** One search box, one session, one bill: minted when the box is focused, spent by the pick. 8–64 characters. */
    session?: string;
    /** Bias the predictions toward here. */
    near?: GeoPoint;
    radiusM?: number;
}

/** The shortest input the backend's schema accepts. */
export const AUTOCOMPLETE_MIN_INPUT = 2;
/** The shortest address the backend's geocode schema accepts. */
export const GEOCODE_MIN_ADDRESS = 3;

export const geoReadsApi = (): boolean => apiConfig.live;

export const geoService = {
    /** Cities per stage, the states with any activity. */
    summary: (): Promise<GeoSummary> => http.get<GeoSummary>("/geo/summary"),

    /** The 36 states with counts per stage. */
    states: (): Promise<GeoStateRow[]> => http.get<GeoStateRow[]>("/geo/states"),

    /** A state's districts with counts per stage. */
    districts: (stateCode: string): Promise<GeoDistricts> => http.get<GeoDistricts>(`/geo/states/${encodeURIComponent(stateCode)}/districts`),

    /** The list contract: `counts` per stage with the stage facet removed. */
    cities: (query: CityListQuery = {}): Promise<GeoCityPage> => http.get<GeoCityPage>(`/geo/cities${cityQuery(query)}`),

    /** The row, its last 50 events, its seven counts. */
    city: (slug: string): Promise<GeoCityDetail> => http.get<GeoCityDetail>(`/geo/cities/${encodeURIComponent(slug)}`),

    /** What ops look at before launching. Advisory. */
    readiness: (slug: string): Promise<CityReadiness> => http.get<CityReadiness>(`/geo/cities/${encodeURIComponent(slug)}/readiness`),

    /** The pins — every city, or those in a bbox, at the stages asked (a PLANNED pin reads 0 live listings). */
    map: (input: { bbox?: MapBbox; stage?: CityStage[] } = {}): Promise<GeoMapPoint[]> => {
        const params = new URLSearchParams();
        if (input.bbox) params.set("bbox", [input.bbox.minLng, input.bbox.minLat, input.bbox.maxLng, input.bbox.maxLat].join(","));
        if (input.stage?.length) params.set("stage", input.stage.join(","));
        const qs = params.toString();
        return http.get<GeoMapPoint[]>(`/geo/map${qs ? `?${qs}` : ""}`);
    },

    /** One city, one patch. 409 on a move the table refuses. Audited `CITY_ROLLOUT_CHANGED`. */
    rollout: (slug: string, patch: RolloutPatch): Promise<GeoCity> => http.patch<GeoCity>(`/geo/cities/${encodeURIComponent(slug)}/rollout`, patch),

    /** Many cities to one stage; the refused ones named in `skipped`. Audited `CITY_ROLLOUT_BULK`. */
    bulkRollout: (body: BulkRolloutBody): Promise<BulkRolloutResult> => http.post<BulkRolloutResult>("/geo/rollout", body),

    /** A place the dataset lacks — MANUAL, PLANNED. 409 when the name is already under the state. Audited `CITY_ADDED`. */
    addCity: (body: AddCityBody): Promise<GeoCity> => http.post<GeoCity>("/geo/cities", body),

    /**
     * Lot X-B: the typed city strings with no key across the eight party
     * tables, biggest first — what the overview's "Unresolved spellings"
     * card draws so ops can add an alias or a city and fold them in.
     */
    unresolved: (): Promise<GeoUnresolved> => http.get<GeoUnresolved>("/geo/unresolved"),

    /** The same run as `npm run seed:geo`, from the console. `system.roles`. Audited `GEO_SEEDED`. */
    seed: (): Promise<GeoSeedResult> => http.post<GeoSeedResult>("/geo/seed"),

    /** Lot X-L: the resolver over every null city key, from the console. `settings.edit`. 409 while a run is on. Audited `GEO_CITY_KEYS_BACKFILLED`. */
    backfillCityKeys: (): Promise<CityKeyBackfillReport> => http.post<CityKeyBackfillReport>("/geo/backfill-city-keys"),

    /** Y-B: the city's audience profile for a month (this one when none is given). Cached a minute on the server. */
    cityAudience: (slug: string, period?: string): Promise<CityAudienceProfile> =>
        http.get<CityAudienceProfile>(`/geo/cities/${encodeURIComponent(slug)}/audience${period ? `?period=${encodeURIComponent(period)}` : ""}`),

    /* ---- AD-C: the lookups. All provider-neutral; the vendor is the one ops chose under Settings › Integrations › Maps. ---- */

    /** A typed fragment → candidate places (India). 400 under two characters; `[]` when nothing matches. */
    autocomplete: (input: string, options: AutocompleteOptions = {}): Promise<PlacePrediction[]> => {
        const params = new URLSearchParams({ input });
        if (options.session) params.set("session", options.session);
        if (options.near) {
            params.set("latitude", String(options.near.latitude));
            params.set("longitude", String(options.near.longitude));
        }
        if (options.radiusM !== undefined) params.set("radiusM", String(options.radiusM));
        return http.get<PlacePrediction[]>(`/geo/autocomplete?${params.toString()}`);
    },

    /** A chosen prediction → its point and address. 404 for a dead id. */
    place: (placeId: string, session?: string): Promise<PlaceDetails> =>
        http.get<PlaceDetails>(`/geo/places/${encodeURIComponent(placeId)}${session ? `?session=${encodeURIComponent(session)}` : ""}`),

    /** An address as typed → the best match. 404 when nothing matches. */
    geocode: (address: string): Promise<GeocodedPlace> => http.get<GeocodedPlace>(`/geo/geocode?address=${encodeURIComponent(address)}`),

    /** A point → the most specific address known for it. 404 when none is. */
    reverse: (point: GeoPoint): Promise<GeocodedPlace> =>
        http.get<GeocodedPlace>(`/geo/reverse?latitude=${encodeURIComponent(String(point.latitude))}&longitude=${encodeURIComponent(String(point.longitude))}`),

    /** Q137: a route between two points, `from` and `to` as "lat,lng". 404 when the vendor finds none. */
    directions: (from: GeoPoint, to: GeoPoint, mode: DirectionsMode = "driving"): Promise<Directions> =>
        http.get<Directions>(`/geo/directions?from=${from.latitude},${from.longitude}&to=${to.latitude},${to.longitude}&mode=${mode}`),
};
