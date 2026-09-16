/**
 * Pricing engine types, mirroring the backend `pricing` module.
 *
 * Deliberately **not** re-exported from `@/types`. The existing `pricing.ts`
 * describes the rate-card and rules model these replace, and both sets are on
 * screen at once while the old screens are retired — putting them in one
 * namespace would collide (`SurgeWindow` in particular means two different
 * things). Screens on the engine import from here by path.
 *
 * The engine is a price-range **suggester**, not a quoter: it reports what
 * comparable spots within 200 m are listed at, and whether a typed price sits
 * inside that. Nothing here is a price the platform intends to charge.
 *
 * Money is a decimal string throughout, never a number. `Decimal(14,2)` in the
 * column and a JS float in the browser is how a rate becomes 1249.9999999998
 * somewhere between the two.
 */

export type Money = string;

export type EngineCategory = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";

export const ENGINE_CATEGORIES: EngineCategory[] = ["OUTDOOR", "TRANSIT", "INDOOR", "MEDIA"];

/* ── The indicator ──────────────────────────────────────────────────── */

export type IndicatorState = "NO_DATA" | "TOO_LOW" | "LOW_SIDE" | "GOOD" | "TOO_HIGH";

/**
 * Descending order of trust.
 *
 * VALIDATED is an ADX listing that drew orders at its asking price. LISTED is
 * an untested ask, ours or a competitor's. PROVISIONAL is a publisher's own
 * rate card, used only when nothing better exists. A mixed set is labelled by
 * its *weakest* member, so this is a floor rather than a highlight.
 */
export type ComparableTier = "VALIDATED" | "LISTED" | "PROVISIONAL";

export interface ActiveSurge {
    /** Null when the caller is not entitled to identify the window. */
    id: string | null;
    /**
     * Null for a window that is not public.
     *
     * The effect is still reported — a publisher must be able to see why their
     * ceiling moved — but a confidential event does not announce itself by name
     * to anyone who can call the endpoint.
     */
    name: string | null;
    upliftPct: string;
    /** When this event ends — what an advertiser is told. */
    endsAt: string;
    /** When the last overlapping window closes. Governs pool exclusion. */
    coverUntil: string;
    isPublic: boolean;
}

export interface PriceIndicator {
    state: IndicatorState;
    message: string;
    range: { low: Money; high: Money } | null;
    /** The ceiling after surge — what TOO_HIGH is actually measured against. */
    effectiveHigh: Money | null;
    contributorCount: number;
    /** Below the comfortable count; the message says what it stands on. */
    thin: boolean;
    staleContributors: number;
    tier: ComparableTier | null;
    surge: ActiveSurge | null;
}

export interface Comparable {
    id: string;
    contributorKey: string;
    contributorName: string | null;
    ratePerDay: Money;
    latitude: number;
    longitude: number;
    distanceMeters: number;
    observedAt: string;
    tier: ComparableTier;
    origin: "LISTING" | "MARKET_DATA";
    label: string | null;
    stale: boolean;
}

export interface Contributor {
    key: string;
    name: string | null;
    ratePerDay: Money;
    count: number;
    stale: boolean;
}

export interface ComparableSet {
    comparables: Comparable[];
    contributors: Contributor[];
    tier: ComparableTier | null;
    low: Money | null;
    high: Money | null;
    staleContributors: number;
}

/* ── Taxonomy ───────────────────────────────────────────────────────── */

export type MediaTypeStatus = "ACTIVE" | "MERGED";
export type MediaTypeOrigin = "SEEDED" | "OPS" | "AUTO_MATCHED";

/**
 * The level between a category and a spot type.
 *
 * Part of the comparable match key, and the coarsest thing it divides on: a gym
 * mirror decal and a hospital one are different markets even though they are
 * the same object. Adding a venue splits a pool; nothing downstream will report
 * that two venues describe one market, so the list is a real decision.
 */
export interface VenueType {
    id: string;
    name: string;
    slug: string;
    category: EngineCategory;
    description: string | null;
    /** Named areas inside the venue — a mall's atrium, its food court. */
    subVenues: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface MediaType {
    id: string;
    name: string;
    slug: string;
    category: EngineCategory;
    description: string | null;
    status: MediaTypeStatus;
    origin: MediaTypeOrigin;
    /** The venue this format lives in. Null for outdoor, which has no venue. */
    venueTypeId: string | null;
    /** Catalogue heading — "Digital Displays". Presentation, not match key. */
    formatGroup: string | null;
    mergedIntoId: string | null;
    mergedAt: string | null;
    createdAt: string;
    updatedAt: string;
    /**
     * Sizes this type is actually built in, and what it is made of.
     *
     * Empty means unconstrained, not "none" — a type nobody has pinned down yet
     * still accepts listings, or adding one would block the catalogue until
     * somebody finished the paperwork.
     */
    sizeClassIds: string[];
    materialIds: string[];
}

export interface MediaTypeMatchLogRow {
    id: string;
    proposedName: string;
    mediaTypeId: string | null;
    similarity: string | null;
    outcome: "MATCHED" | "CREATED";
    createdAt: string;
}

export interface SizeClass {
    id: string;
    name: string;
    slug: string;
    widthFt: string | null;
    heightFt: string | null;
    areaSqFt: string | null;
    isActive: boolean;
}

export interface Material {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
}

export type VocabularyKind = "MEDIA_TYPE" | "SIZE_CLASS" | "MATERIAL";

export interface VocabularyProposal {
    id: string;
    kind: VocabularyKind;
    rawValue: string;
    occurrences: number;
    createdAt: string;
}

/* ── Factors ────────────────────────────────────────────────────────── */

export type PricingFactorKind = "BASE_ADJUST" | "MULTIPLIER";

/**
 * Lot E (Q59/Q125). ADVISORY proposes a rate the publisher may accept at
 * `GET /listings/me/:id/suggested-rate`; BINDING reprices the listing the
 * moment a person applies it, within `PricingSettings.maxBindingChangePct`
 * of the current rate — above that the apply is refused and a price case is
 * raised instead. `bindingDuringSurgeOnly` makes a BINDING factor advisory
 * outside a surge window.
 */
export type PricingFactorMode = "ADVISORY" | "BINDING";

export const FACTOR_MODE_META: Record<PricingFactorMode, { label: string; tone: "info" | "warning" }> = {
    ADVISORY: { label: "Advisory", tone: "info" },
    BINDING: { label: "Binding", tone: "warning" },
};

export interface PricingFactor {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    kind: PricingFactorKind;
    mediaTypeId: string;
    multiplier: string | null;
    baseAdjust: Money | null;
    suggestWhen: unknown;
    mode: PricingFactorMode;
    bindingDuringSurgeOnly: boolean;
    isActive: boolean;
}

/** One candidate factor for a listing — `GET /pricing/listings/:id/factors`. */
export interface FactorProposal {
    factorId: string;
    name: string;
    kind: PricingFactorKind;
    multiplier: string | null;
    baseAdjust: Money | null;
    description: string | null;
    mode: PricingFactorMode;
    bindingDuringSurgeOnly: boolean;
    /** The engine's opinion: the listing's facts match `suggestWhen`. */
    suggested: boolean;
    /** A person's decision. */
    applied: boolean;
    /** The rate a BINDING apply wrote, for the trail. Null on an advisory apply. */
    appliedRatePerDay: Money | null;
}

/** Base plus applied factors — `GET /pricing/listings/:id/suggested-rate`. */
export interface SuggestedRate {
    base: Money;
    ratePerDay: Money;
    compoundMultiplier: string;
    /** True when the compounded multipliers hit the ceiling. Flagged, not clamped. */
    cappedOut: boolean;
    applied: { name: string; kind: PricingFactorKind; value: string; mode: PricingFactorMode }[];
}

/* ── Surge ──────────────────────────────────────────────────────────── */

export type SurgeScope = "CITY" | "NATIONAL" | "INTERNATIONAL";
export type SurgeSource = "SCRAPER" | "OPS" | "AI_AGENT";

/**
 * Named `SurgeEventWindow` rather than `SurgeWindow` because the fixture type
 * of that name still exists and means something else — a band on a twelve-week
 * strip rather than a row in the event calendar.
 */
export interface SurgeEventWindow {
    id: string;
    name: string;
    scope: SurgeScope;
    source: SurgeSource;
    externalRef: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number | null;
    startsAt: string;
    endsAt: string;
    upliftPct: string;
    /** The kill switch. A scraper that invents an event is stopped here. */
    isEnabled: boolean;
    disabledById: string | null;
    disabledAt: string | null;
    disabledNote: string | null;
    isPublic: boolean;
}

/* ── Market data ────────────────────────────────────────────────────── */

export interface MarketDataRow {
    /** The venue the observed spot sits in. Omitted means none, not "any". */
    venueTypeSlug?: string | null;
    contributorName: string;
    publisherId?: string | null;
    mediaTypeSlug: string;
    sizeClassSlug: string;
    materialSlug?: string | null;
    latitude: number;
    longitude: number;
    city?: string | null;
    locality?: string | null;
    ratePerDay: string;
    observedAt: string;
}

export interface MarketDataImportResult {
    importId: string;
    rowCount: number;
    acceptedCount: number;
    rejectedCount: number;
    rejections: { row: number; reason: string }[];
}

/* ── Settings ───────────────────────────────────────────────────────── */

export interface PricingSettings {
    radiusMeters: number;
    highEdgePct: string;
    lowEdgePct: string;
    /** Below this the indicator still shows, but says what it stands on. */
    thinEvidenceCount: number;
    /** Distinct ADX contributors with a sale before research is dropped. */
    validatedTakeoverCount: number;
    minContributors: number;
    stalenessMonths: number;
    mediaTypeMatchThreshold: string;
    maxCompoundMultiplier: string;
    /** How far a measurement may sit from a size class and still be filed as it. */
    sizeTolerancePct: string;
    /**
     * Lot E (Q125): the most a BINDING factor may move a rate, as a fraction
     * of what it found. Above it the apply answers 409 and raises a price
     * case for a person.
     */
    maxBindingChangePct: string;
}

/* ── Scraper sources ────────────────────────────────────────────────── */

export type ScraperSourceKind = "HTML" | "FEED" | "JSON" | "MANUAL";
export type ScraperRunStatus = "OK" | "NO_MATCHES" | "FETCH_FAILED" | "PARSE_FAILED";

/**
 * Where the surge calendar comes from.
 *
 * The scraper runs headless. This is the part ops has to be able to change: what
 * is watched, how a fetched record becomes a window, and how to stop a source
 * that has started inventing events.
 */
export interface ScraperSource {
    id: string;
    name: string;
    url: string;
    kind: ScraperSourceKind;
    /** Canonical city slugs. Empty means national. */
    citySlugs: string[];
    /** Selectors for HTML, paths for JSON. Shape follows `kind`. */
    fieldMap: Record<string, unknown> | null;
    defaultUpliftPct: string;
    intervalMinutes: number;
    /** Off means the source proposes windows rather than enabling them. */
    autoEnableWindows: boolean;
    isEnabled: boolean;
    disabledAt: string | null;
    disabledNote: string | null;
    lastRunAt: string | null;
    lastRunStatus: ScraperRunStatus | null;
    lastRunMessage: string | null;
    lastRunFound: number | null;
}

export interface ScraperRun {
    id: string;
    sourceId: string;
    status: ScraperRunStatus;
    message: string | null;
    found: number;
    windowsUpserted: number;
    startedAt: string;
    finishedAt: string | null;
}
