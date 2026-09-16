import { ApiError, api as http } from "@/lib/api-client";
import type {
    ComparableSet,
    FactorProposal,
    MarketDataImportResult,
    MarketDataRow,
    Material,
    MediaType,
    MediaTypeMatchLogRow,
    PriceIndicator,
    PricingFactor,
    PricingSettings,
    ScraperRun,
    ScraperSource,
    SizeClass,
    SuggestedRate,
    SurgeEventWindow,
    VenueType,
    VocabularyProposal,
} from "@/types/pricing-engine";

/**
 * The pricing engine, wired to the backend `pricing` module.
 *
 * No fixture fallback, deliberately. Every other domain keeps one so screens
 * render without a server, but the engine has nothing honest to fall back to:
 * a comparable range invented from seed data would put a made-up market rate in
 * front of ops, and the entire point of this subsystem is that its numbers come
 * from somewhere real. When the API is off, these screens say so.
 *
 * Ops-only endpoints are marked. `/evaluate` and `/comparables/summary` are the
 * two a publisher may call; everything else is ADMIN.
 */

const base = "/pricing";

export const pricingService = {
    /* ── Reference data ───────────────────────────────────────────── */

    sizeClassesAll: () => http.get<SizeClass[]>(`${base}/size-classes?includeInactive=true`),
    materialsAll: () => http.get<Material[]>(`${base}/materials?includeInactive=true`),

    mediaTypes: (includeMerged = false) =>
        http.get<MediaType[]>(`${base}/media-types?includeMerged=${includeMerged}`),

    sizeClasses: () => http.get<SizeClass[]>(`${base}/size-classes`),

    venueTypes: (includeInactive = false) =>
        http.get<VenueType[]>(`${base}/venue-types?includeInactive=${includeInactive}`),

    materials: () => http.get<Material[]>(`${base}/materials`),

    /* ── Vocabulary, ops only ─────────────────────────────────────── */

    createSizeClass: (body: {
        name: string;
        widthFt?: string | null;
        heightFt?: string | null;
    }) => http.post<SizeClass>(`${base}/size-classes`, body),

    updateSizeClass: (id: string, body: Record<string, unknown>) =>
        http.patch<SizeClass>(`${base}/size-classes/${id}`, body),

    createMaterial: (body: { name: string }) => http.post<Material>(`${base}/materials`, body),

    /**
     * A new venue splits every pool underneath it.
     *
     * Worth saying out loud at the call site: two venues that name one market
     * halve the comparables for every spot in it, and nothing reports that —
     * the range just quietly gets thinner.
     */
    createVenueType: (body: {
        name: string;
        category: string;
        description?: string | null;
        subVenues?: string[];
    }) => http.post<VenueType>(`${base}/venue-types`, body),

    updateVenueType: (id: string, body: Record<string, unknown>) =>
        http.patch<VenueType>(`${base}/venue-types/${id}`, body),

    updateMaterial: (id: string, body: Record<string, unknown>) =>
        http.patch<Material>(`${base}/materials/${id}`, body),

    /* ── Scraper sources ──────────────────────────────────────────── */

    scraperSources: () => http.get<ScraperSource[]>(`${base}/scraper-sources`),

    createScraperSource: (body: Record<string, unknown>) =>
        http.post<ScraperSource>(`${base}/scraper-sources`, body),

    updateScraperSource: (id: string, body: Record<string, unknown>) =>
        http.patch<ScraperSource>(`${base}/scraper-sources/${id}`, body),

    /** Stops a whole source, not just one window it produced. */
    setScraperSourceEnabled: (id: string, enabled: boolean, note: string | null) =>
        http.post<ScraperSource>(`${base}/scraper-sources/${id}/enabled`, { enabled, note }),

    scraperRuns: (id: string, limit = 50) =>
        http.get<ScraperRun[]>(`${base}/scraper-sources/${id}/runs?limit=${limit}`),

    /* ── Taxonomy, ops only ───────────────────────────────────────── */

    createMediaType: (body: {
        name: string;
        category: string;
        description?: string | null;
        sizeClassIds?: string[];
        materialIds?: string[];
    }) => http.post<MediaType>(`${base}/media-types`, body),

    /** Replaces the whole set, so unticking a size actually removes it. */
    setMediaTypeAttributes: (
        id: string,
        body: { sizeClassIds?: string[]; materialIds?: string[] }
    ) => http.put<MediaType>(`${base}/media-types/${id}/attributes`, body),

    /**
     * Name, category, description, venue and catalogue group.
     *
     * Re-filing a type under a different venue moves every listing on it into a
     * different comparable pool, which is why the screen says so before it lets
     * you do it.
     */
    updateMediaType: (
        id: string,
        body: Partial<{
            name: string;
            description: string | null;
            category: string;
            venueTypeId: string | null;
            formatGroup: string | null;
        }>
    ) => http.patch<MediaType>(`${base}/media-types/${id}`, body),

    /**
     * Folds one media type into another.
     *
     * The repair tool for when the similarity threshold gets it wrong, and the
     * reason matching can afford to be eager. Re-points listings and market
     * data in one transaction and leaves the source as a tombstone.
     */
    mergeMediaTypes: (sourceId: string, targetId: string) =>
        http.post<MediaType>(`${base}/media-types/merge`, { sourceId, targetId }),

    /** Every match decision. How taxonomy fragmentation gets noticed early. */
    matchLog: (limit = 100) =>
        http.get<MediaTypeMatchLogRow[]>(`${base}/media-types/match-log?limit=${limit}`),

    /* ── Vocabulary queue ─────────────────────────────────────────── */

    proposals: (resolved = false) =>
        http.get<VocabularyProposal[]>(`${base}/vocabulary/proposals?resolved=${resolved}`),

    resolveProposal: (id: string, resolvedTo: string | null) =>
        http.post<{ resolved: boolean }>(`${base}/vocabulary/proposals/${id}/resolve`, {
            resolvedTo,
        }),

    /* ── Factors ──────────────────────────────────────────────────── */

    factors: (mediaTypeId?: string) =>
        http.get<PricingFactor[]>(
            mediaTypeId ? `${base}/factors?mediaTypeId=${mediaTypeId}` : `${base}/factors`
        ),

    createFactor: (body: Record<string, unknown>) =>
        http.post<PricingFactor>(`${base}/factors`, body),

    updateFactor: (id: string, body: Record<string, unknown>) =>
        http.patch<PricingFactor>(`${base}/factors/${id}`, body),

    /** Refused when the factor has priced anything — retire it instead. */
    deleteFactor: (id: string) => http.delete<{ deleted: boolean }>(`${base}/factors/${id}`),

    /* ── One listing's pricing (Lot E, Q125) ──────────────────────── */

    /** The indicator for a listing that already exists: 400 when it has no media type, size or fix. */
    listingIndicator: (listingId: string) => http.get<PriceIndicator>(`${base}/listings/${listingId}/indicator`),

    /** Every candidate factor, with the ones the engine proposes and the ones a person applied. */
    listingFactors: (listingId: string) => http.get<FactorProposal[]>(`${base}/listings/${listingId}/factors`),

    /** Re-runs the predicates and records which are proposed; applies nothing. */
    refreshFactors: (listingId: string) => http.post<FactorProposal[]>(`${base}/listings/${listingId}/factors/refresh`),

    /**
     * A person's decision on one factor. ADVISORY records it and nothing
     * moves; BINDING reprices the listing through the listing module and
     * answers 409 `BINDING_CHANGE_TOO_LARGE` — with a price case raised —
     * when the move would exceed `maxBindingChangePct`. `bindingRefusal`
     * reads that refusal.
     */
    applyFactor: (listingId: string, factorId: string, applied: boolean) =>
        http.post<FactorProposal[]>(`${base}/listings/${listingId}/factors/apply`, { factorId, applied }),

    /** Base plus applied factors — the offer made to exclusive publishers. 409 with no comparables. */
    suggestedRate: (listingId: string) => http.get<SuggestedRate>(`${base}/listings/${listingId}/suggested-rate`),

    /* ── Surge ────────────────────────────────────────────────────── */

    surgeWindows: (includeDisabled = true) =>
        http.get<SurgeEventWindow[]>(`${base}/surge?includeDisabled=${includeDisabled}`),

    upsertSurgeWindow: (body: Record<string, unknown>) =>
        http.post<SurgeEventWindow>(`${base}/surge`, body),

    /**
     * The kill switch.
     *
     * A window ops switches off stays off when the scraper next sees the same
     * event — the upsert deliberately never touches `isEnabled`. That is the
     * whole reason this endpoint exists rather than an edit form.
     */
    setSurgeEnabled: (id: string, enabled: boolean, note: string | null) =>
        http.post<SurgeEventWindow>(`${base}/surge/${id}/enabled`, { enabled, note }),

    /* ── Market data ──────────────────────────────────────────────── */

    importMarketData: (body: {
        source: "RESEARCH" | "RATE_CARD";
        filename?: string | null;
        note?: string | null;
        publisherId?: string | null;
        rows: MarketDataRow[];
    }) => http.post<MarketDataImportResult>(`${base}/market-data/import`, body),

    /** Clears an import's rows without deleting them; the audit trail survives. */
    revokeImport: (id: string) =>
        http.post<{ deactivated: number }>(`${base}/market-data/imports/${id}/revoke`, {}),

    /* ── Evaluation ───────────────────────────────────────────────── */

    evaluate: (body: {
        /** Omitting this asks about the venue-less pool, not about every venue. */
        venueTypeId?: string | null;
        mediaTypeId: string;
        sizeClassId: string;
        latitude: number;
        longitude: number;
        ratePerDay: string;
        city?: string | null;
    }) => http.post<PriceIndicator>(`${base}/evaluate`, body),

    /** The full set, competitor names and coordinates included. Ops only. */
    comparables: (body: {
        venueTypeId?: string | null;
        mediaTypeId: string;
        sizeClassId: string;
        latitude: number;
        longitude: number;
        city?: string | null;
    }) => http.post<ComparableSet>(`${base}/comparables`, body),

    /* ── Settings ─────────────────────────────────────────────────── */

    settings: () => http.get<PricingSettings>(`${base}/settings`),

    updateSettings: (body: Partial<PricingSettings>) =>
        http.patch<PricingSettings>(`${base}/settings`, body),
};

/* ------------------------------------------------------------------ */
/* What applying a factor does — said before the button is pressed     */
/* ------------------------------------------------------------------ */

/**
 * The one sentence the Apply / Unapply confirmation must carry: what this
 * factor's mode does to the listing's rate the moment the button is pressed.
 * ADVISORY changes an offer; BINDING changes a price a publisher is being
 * paid, so the sentence says so — and names the cap the server enforces.
 */
export function applyConsequence(
    proposal: Pick<FactorProposal, "name" | "mode" | "bindingDuringSurgeOnly">,
    applied: boolean,
    maxBindingChangePct: string | null,
): string {
    const capPct = maxBindingChangePct === null ? null : Math.round(Number(maxBindingChangePct) * 100);
    const cap = capPct === null ? "the binding cap" : `${capPct}%`;
    if (proposal.mode === "ADVISORY") {
        return applied
            ? `"${proposal.name}" is advisory: applying it records the decision and changes the suggested rate the publisher is offered. The listing's own rate does not move.`
            : `Un-applying "${proposal.name}" takes it out of the suggested rate the publisher is offered. The listing's own rate does not move.`;
    }
    if (proposal.bindingDuringSurgeOnly) {
        return applied
            ? `"${proposal.name}" binds only while a surge window covers this listing. Inside one, applying it reprices the listing now — by at most ${cap} of the current rate, or a price case is raised instead. Outside one it is advisory today.`
            : `Un-applying "${proposal.name}" reprices the listing back without it while a surge window covers it — by at most ${cap}, or a price case is raised instead. Outside a window it only changes the offer.`;
    }
    return applied
        ? `"${proposal.name}" is binding: applying it reprices this listing now, through the listing module, and tells the publisher. The move may be at most ${cap} of the current rate — above that nothing is written and a price case is raised for a person to decide.`
        : `Un-applying "${proposal.name}" reprices the listing back without it, under the same ${cap} cap. A price that kept a factor nobody applied any more would be drift.`;
}

/** The 409 a binding apply answers above the cap, read for the screen. */
export interface BindingRefusal {
    message: string;
    priceApprovalId: string | null;
    from: string | null;
    to: string | null;
    capPct: number | null;
}

export function bindingRefusal(error: unknown): BindingRefusal | null {
    if (!(error instanceof ApiError) || error.code !== "BINDING_CHANGE_TOO_LARGE") return null;
    const details = (error.details ?? {}) as { priceApprovalId?: string; from?: string; to?: string; capPct?: number };
    return {
        message: error.message,
        priceApprovalId: details.priceApprovalId ?? null,
        from: details.from ?? null,
        to: details.to ?? null,
        capPct: typeof details.capPct === "number" ? details.capPct : null,
    };
}
