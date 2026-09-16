import { api as http } from "@/lib/api-client";

/**
 * The manual pricing model, wired to the backend `price-model` module.
 *
 * These screens were fixtures for months — size bands, illumination
 * multipliers, category rules, a rule builder — and looked exactly like
 * configuration while changing nothing. They write to the database now.
 *
 * Live in every mode with no fixture fallback, the same as the rest of the
 * pricing section: a seeded multiplier is indistinguishable from a real one on
 * screen, and these decide what an advertiser is charged.
 */

const base = "/price-model";

/* ── Dimensions ──────────────────────────────────────────────────────── */

export interface DimensionValue {
    id: string;
    dimensionId: string;
    label: string;
    multiplier: string;
    /** Set only on size bands, which are chosen by area rather than by hand. */
    minAreaSqFt: string | null;
    maxAreaSqFt: string | null;
    sortOrder: number;
    isActive: boolean;
}

export interface PriceDimension {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    sortOrder: number;
    isActive: boolean;
    values: DimensionValue[];
}

/* ── Category rules ──────────────────────────────────────────────────── */

export type CategoryRuleEffect = "MULTIPLIER" | "BLOCKED" | "LEGAL_APPROVAL";

export const CATEGORY_EFFECT_META: Record<
    CategoryRuleEffect,
    { label: string; tone: "info" | "danger" | "warning" }
> = {
    MULTIPLIER: { label: "Priced", tone: "info" },
    BLOCKED: { label: "May not book", tone: "danger" },
    LEGAL_APPROVAL: { label: "Needs sign-off", tone: "warning" },
};

export interface PricingCategoryRule {
    id: string;
    sector: string;
    mediaTypeId: string | null;
    mediaTypeName: string | null;
    effect: CategoryRuleEffect;
    multiplier: string | null;
    note: string | null;
    isActive: boolean;
}

/* ── Rules ───────────────────────────────────────────────────────────── */

export type RuleAdjustment = "MULTIPLIER" | "BASE_ADJUST" | "OVERRIDE";

export const OPERATORS = ["eq", "ne", "in", "gt", "gte", "lt", "lte"] as const;
export type RuleOperator = (typeof OPERATORS)[number];

export const OPERATOR_LABEL: Record<RuleOperator, string> = {
    eq: "is",
    ne: "is not",
    in: "is one of",
    gt: "is more than",
    gte: "is at least",
    lt: "is less than",
    lte: "is at most",
};

/** The facts a condition may test. Anything else never matches. */
export const RULE_FIELDS = [
    { value: "mediaTypeId", label: "Media type" },
    { value: "grade", label: "Locality grade" },
    { value: "city", label: "City" },
    { value: "sector", label: "Advertiser sector" },
    { value: "areaSqFt", label: "Area (sq ft)" },
    { value: "days", label: "Flight length (days)" },
] as const;

export interface RuleCondition {
    id?: string;
    field: string;
    operator: RuleOperator;
    value: string;
}

export interface PriceRule {
    id: string;
    name: string;
    description: string | null;
    priority: number;
    /** Match ANY when true; Match ALL otherwise. */
    matchAny: boolean;
    adjustment: RuleAdjustment;
    value: string;
    startsAt: string | null;
    endsAt: string | null;
    isActive: boolean;
    conditions: RuleCondition[];
}

/* ── Quotes ──────────────────────────────────────────────────────────── */

export type RateGrade = "PREMIUM" | "A" | "B" | "C";
export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "EXPIRED" | "WITHDRAWN";

export const QUOTE_STATUS_META: Record<
    QuoteStatus,
    { label: string; tone: "neutral" | "info" | "success" | "warning" }
> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    SENT: { label: "Sent", tone: "info" },
    ACCEPTED: { label: "Accepted", tone: "success" },
    EXPIRED: { label: "Expired", tone: "warning" },
    WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

export interface QuoteStep {
    step: string;
    rule: string;
    factor: string;
    running: string;
}

export interface QuoteLineInput {
    mediaTypeId: string;
    grade: RateGrade;
    cityId?: string | null;
    label?: string | null;
    quantity?: number;
    days?: number;
    dimensionValueIds?: string[];
    areaSqFt?: string | null;
}

export interface PricedLine {
    label: string | null;
    mediaTypeId: string;
    grade: string;
    quantity: number;
    days: number;
    cardRatePerDay: string | null;
    floorPerDay: string | null;
    ratePerDay: string;
    lineTotal: string;
    belowFloor: boolean;
    steps: QuoteStep[];
}

export interface PricedQuote {
    lines: PricedLine[];
    subtotalPerDay: string;
    discountPct: string | null;
    totalPerDay: string;
    grandTotal: string;
    belowFloor: boolean;
    blocked: string[];
    needsLegalApproval: string[];
}

export interface SavedQuote {
    id: string;
    reference: string;
    status: QuoteStatus;
    advertiserId: string | null;
    advertiserName: string | null;
    sector: string | null;
    notes: string | null;
    discountPct: string | null;
    subtotalPerDay: string;
    totalPerDay: string;
    grandTotal: string;
    belowFloor: boolean;
    createdAt: string;
    expiresAt: string | null;
    lines?: (PricedLine & { id: string; mediaTypeName?: string; trace: QuoteStep[] })[];
}

export interface QuoteInput {
    advertiserId?: string | null;
    sector?: string | null;
    notes?: string | null;
    /** A percentage — "10" is ten per cent. */
    discountPct?: string | null;
    expiresAt?: string | null;
    lines: QuoteLineInput[];
}

/* ── Settings (the General tab) ──────────────────────────────────────── */

export interface DurationTier {
    minDays: number;
    pct: number;
}

export interface PriceModelSettings {
    roundingRupees: number;
    minimumRatePerDay: string;
    minimumBookingDays: number;
    floorProtection: boolean;
    durationDiscounts: DurationTier[];
    approvalThresholdPct: string;
    discountCeilingPct: string;
    maxStackedUplift: string;
    blockBelowFloor: boolean;
}

/* ── Simulator ───────────────────────────────────────────────────────── */

export interface TraceRow {
    step: string;
    rule: string;
    factor: string;
    running: string;
    emphasis?: boolean;
}

export interface Simulation {
    listing: {
        id: string;
        title: string;
        city: string | null;
        cityId: string | null;
        mediaTypeId: string;
        mediaTypeName: string;
    };
    ratePerDay: string;
    cardId: string | null;
    cardName: string | null;
    floorPerDay: string | null;
    belowFloor: boolean;
    needsApproval: boolean;
    netToPublisher: string;
    rows: TraceRow[];
}

export interface SimulateInput {
    listingId: string;
    days: number;
    spots?: number;
    sector?: string | null;
    grade?: RateGrade | null;
    dimensionValueIds?: string[];
    discountPct?: string | null;
    previewRule?: {
        name: string;
        matchAny: boolean;
        adjustment: RuleAdjustment;
        value: string;
        conditions: { field: string; operator: string; value: string }[];
    } | null;
}

/** The admin listing list, as much of it as the simulator's site picker needs. */
export interface SiteOption {
    id: string;
    title: string;
    city: string | null;
    mediaTypeId: string | null;
    areaSqFt: string | null;
    widthFt: string | null;
    heightFt: string | null;
    rateGrade: RateGrade | null;
    illumination: string | null;
    facing: string | null;
    elevation: string | null;
    visibility: string | null;
    ratePerDay: string | null;
}

/** Advertiser sectors, as category rules and the simulator name them. */
export const SECTORS = [
    "General",
    "Alcohol",
    "Tobacco",
    "Gambling",
    "Pharma",
    "Political",
    "Financial",
    "Real estate",
    "Education",
    "Healthcare",
    "Infant nutrition",
] as const;

/**
 * The dimension set DR 10 draws, with the multipliers the old fixture screen
 * carried (`docs/pricing-engine.md` keeps the same table). Offered once, when a
 * deployment has no dimensions at all, so the General tab is not a blank page.
 */
export const STANDARD_DIMENSIONS: {
    name: string;
    slug: string;
    description: string;
    values: { label: string; multiplier: string; minAreaSqFt?: string; maxAreaSqFt?: string }[];
}[] = [
    {
        name: "Size bands",
        slug: "size-band",
        description: "Chosen by the measured face area, not by hand.",
        values: [
            { label: "Compact", multiplier: "0.80", maxAreaSqFt: "72" },
            { label: "Standard", multiplier: "1.00", minAreaSqFt: "72.01", maxAreaSqFt: "200" },
            { label: "Large", multiplier: "1.15", minAreaSqFt: "200.01", maxAreaSqFt: "450" },
            { label: "Super", multiplier: "1.30", minAreaSqFt: "450.01", maxAreaSqFt: "800" },
            { label: "Landmark", multiplier: "1.50", minAreaSqFt: "800.01" },
        ],
    },
    {
        name: "Illumination",
        slug: "illumination",
        description: "How the face is lit after dark.",
        values: [
            { label: "Non-lit", multiplier: "0.85" },
            { label: "Front-lit", multiplier: "1.00" },
            { label: "Back-lit", multiplier: "1.15" },
            { label: "Digital / LED", multiplier: "1.60" },
        ],
    },
    {
        name: "Facing",
        slug: "facing",
        description: "Which way the face points relative to traffic.",
        values: [
            { label: "Towards oncoming traffic", multiplier: "1.10" },
            { label: "Parallel to road", multiplier: "0.95" },
            { label: "Junction / multi-face", multiplier: "1.20" },
        ],
    },
    {
        name: "Elevation",
        slug: "elevation",
        description: "Height of the face above the road.",
        values: [
            { label: "Eye level (≤ 20 ft)", multiplier: "1.05" },
            { label: "Mid rise (20-40 ft)", multiplier: "1.00" },
            { label: "High rise (> 40 ft)", multiplier: "0.90" },
        ],
    },
    {
        name: "Visibility",
        slug: "visibility",
        description: "How long an approaching viewer has it in sight.",
        values: [
            { label: "Clear 100 m+ approach", multiplier: "1.10" },
            { label: "Partial obstruction", multiplier: "0.90" },
            { label: "Signal wait zone", multiplier: "1.15" },
            { label: "Flyover shadow", multiplier: "0.85" },
        ],
    },
];

const str = (value: unknown): string | null =>
    value === null || value === undefined ? null : String(value);

export const priceModelService = {
    settings: () => http.get<PriceModelSettings>(`${base}/settings`),
    saveSettings: (patch: Partial<PriceModelSettings>) =>
        http.put<PriceModelSettings>(`${base}/settings`, patch),

    simulate: (body: SimulateInput) => http.post<Simulation>(`${base}/simulate`, body),

    /** Sites the simulator can trace. The admin listing list, trimmed.
     *
     *  `GET /listings` is a page now, not a bare array — it grew a search,
     *  filter, sort and total so the DR 10 table could be built. This asks for
     *  one full page; the picker is a dropdown over recent spots, not the
     *  catalogue, and a simulator that silently traced only the first 20 of
     *  1,092 sites would be worse than one that says what it is showing. When
     *  the picker needs the whole inventory it should send `?q=` and search
     *  server-side rather than page through it here. */
    sites: async (): Promise<SiteOption[]> => {
        const page = await http.get<{ items: Record<string, unknown>[] }>(
            "/listings?pageSize=100&sort=NEWEST"
        );
        return (page.items ?? []).map((row) => ({
            id: String(row.id),
            title: String(row.title),
            city: str(row.city),
            mediaTypeId: str(row.mediaTypeId),
            areaSqFt: str(row.areaSqFt),
            widthFt: str(row.widthFt),
            heightFt: str(row.heightFt),
            rateGrade: (str(row.rateGrade) as RateGrade | null) ?? null,
            illumination: str(row.illumination),
            facing: str(row.facing),
            elevation: str(row.elevation),
            visibility: str(row.visibility),
            ratePerDay: str(row.ratePerDay),
        }));
    },

    /** Creates the DR 10 dimension set. Only offered when there are none. */
    seedStandardDimensions: async (): Promise<void> => {
        for (const dimension of STANDARD_DIMENSIONS) {
            const created = await priceModelService.createDimension({
                name: dimension.name,
                slug: dimension.slug,
                description: dimension.description,
            });
            await priceModelService.setDimensionValues(
                created.id,
                dimension.values.map((value) => ({
                    label: value.label,
                    multiplier: value.multiplier,
                    minAreaSqFt: value.minAreaSqFt ?? null,
                    maxAreaSqFt: value.maxAreaSqFt ?? null,
                }))
            );
        }
    },

    dimensions: (includeInactive = false) =>
        http.get<PriceDimension[]>(`${base}/dimensions?all=${includeInactive}`),
    createDimension: (body: { name: string; slug: string; description?: string | null }) =>
        http.post<PriceDimension>(`${base}/dimensions`, body),
    updateDimension: (id: string, patch: Record<string, unknown>) =>
        http.patch<PriceDimension>(`${base}/dimensions/${id}`, patch),
    deleteDimension: (id: string) =>
        http.delete<{ deleted: boolean }>(`${base}/dimensions/${id}`),
    /** The option set is saved whole, because it is edited whole. */
    setDimensionValues: (
        id: string,
        values: {
            label: string;
            multiplier: string;
            minAreaSqFt?: string | null;
            maxAreaSqFt?: string | null;
        }[]
    ) => http.put<PriceDimension>(`${base}/dimensions/${id}/values`, { values }),

    categoryRules: () => http.get<PricingCategoryRule[]>(`${base}/category-rules`),
    createCategoryRule: (body: {
        sector: string;
        mediaTypeId?: string | null;
        effect: CategoryRuleEffect;
        multiplier?: string | null;
        note?: string | null;
    }) => http.post<PricingCategoryRule>(`${base}/category-rules`, body),
    updateCategoryRule: (id: string, patch: Record<string, unknown>) =>
        http.patch<PricingCategoryRule>(`${base}/category-rules/${id}`, patch),
    deleteCategoryRule: (id: string) =>
        http.delete<{ deleted: boolean }>(`${base}/category-rules/${id}`),

    rules: (includeInactive = true) => http.get<PriceRule[]>(`${base}/rules?all=${includeInactive}`),
    createRule: (body: {
        name: string;
        description?: string | null;
        priority?: number;
        matchAny?: boolean;
        adjustment: RuleAdjustment;
        value: string;
        startsAt?: string | null;
        endsAt?: string | null;
    }) => http.post<PriceRule>(`${base}/rules`, body),
    updateRule: (id: string, patch: Record<string, unknown>) =>
        http.patch<PriceRule>(`${base}/rules/${id}`, patch),
    deleteRule: (id: string) => http.delete<{ deleted: boolean }>(`${base}/rules/${id}`),
    setConditions: (id: string, conditions: RuleCondition[]) =>
        http.put<PriceRule>(`${base}/rules/${id}/conditions`, {
            conditions: conditions.map(({ field, operator, value }) => ({ field, operator, value })),
        }),

    /** Prices without saving — negotiation is iterative. */
    priceQuote: (body: QuoteInput) => http.post<PricedQuote>(`${base}/quotes/price`, body),
    saveQuote: (body: QuoteInput) => http.post<SavedQuote>(`${base}/quotes`, body),
    quotes: (status?: QuoteStatus) =>
        http.get<SavedQuote[]>(`${base}/quotes${status ? `?status=${status}` : ""}`),
    quote: (id: string) => http.get<SavedQuote>(`${base}/quotes/${id}`),
    setQuoteStatus: (id: string, status: Exclude<QuoteStatus, "DRAFT">) =>
        http.patch<SavedQuote>(`${base}/quotes/${id}/status`, { status }),
};
