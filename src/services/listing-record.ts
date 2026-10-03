import { api as http } from "@/lib/api-client";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { CONTENT_STANCE_META, DOCUMENT_KIND_LABEL, PRICING_UNIT_LABEL, type ContentStance, type ListingDocumentKind, type ListingDocumentStatus, type PricingUnit } from "@/services/listing-review";
import type { Figure, Money, MoneyFigure, MoneySeries, Series } from "@/services/section-overviews";
import { SCOPE_LABEL } from "@/services/suspension";
import type { StatusMeta, SuspensionScope } from "@/types";

/**
 * The console's listing page (3 Oct 2026) — the owner, looking at a
 * listing: "I don't see any analytical stats for every listing, there's no
 * description data, there's no data on footfall", and then: "I need to see
 * everything what we store on a listing."
 *
 * `GET /listings/:id` (ADMIN) now answers the whole record: every column of
 * the listing less the site QR's token (`hasSiteQr` says whether there is
 * one), and every row hanging off it. `LISTING_FIELDS` below is the page's
 * one register of those columns — the label each is shown under, the
 * section it sits in, and how its value reads — so a section draws what it
 * holds, an empty one says "Not stated", and the "All recorded data" fold
 * draws all of them. A test holds the register to the Prisma model, so a
 * column added to `Listing` without a label here fails.
 *
 * `GET /listings/:id/insights` is the Performance tab.
 */

/* ------------------------------------------------------------------ */
/* The record's related rows, as the read sends them                    */
/* ------------------------------------------------------------------ */

/** A person the record names: their id and their name, never more. */
export interface NamedPerson {
    id: string;
    name: string | null;
}

export interface ListingPhotoRecord {
    id: string;
    url: string;
    /** FRONT / LEFT / RIGHT / WIDE from the wizards, "main" from the photos door and imports. */
    type: string;
    createdAt: string;
    /** GC-1: when the camera took it, from the upload register; null when nothing was kept. */
    takenAt?: string | null;
    /** GC-1: where, only when the camera's GPS stamp was on. */
    gps?: { latitude: number; longitude: number; accuracyM: number | null } | null;
}

export interface ListingDocumentRecord {
    id: string;
    kind: ListingDocumentKind;
    url: string;
    status: ListingDocumentStatus;
    rejectionReason: string | null;
    expiresAt: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    reviewedBy: NamedPerson | null;
}

export interface ListingVerificationRecord {
    id: string;
    type: "AGENT_INITIAL" | "SELF_REVERIFICATION";
    status: "SUBMITTED" | "ACCEPTED" | "REJECTED";
    photoUrl: string;
    latitude: number;
    longitude: number;
    distanceMeters: number | null;
    qrScanned: boolean;
    capturedAt: string;
    orderId: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
    submittedBy: NamedPerson | null;
    reviewedBy: NamedPerson | null;
    photos: { id: string; url: string; label: string | null; order: number }[];
}

export interface ListingContentRuleRecord {
    stance: ContentStance;
    category: { id: string; name: string; slug: string; isSensitive: boolean };
}

export interface ListingPricingFactorRecord {
    id: string;
    suggested: boolean;
    applied: boolean;
    appliedRatePerDay: string | null;
    decidedAt: string | null;
    createdAt: string;
    decidedBy: NamedPerson | null;
    factor: { id: string; name: string; mode: string; kind: string };
}

export interface ListingPriceApprovalRecord {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    source: string;
    requestedRatePerDay: string;
    cardRatePerDay: string | null;
    floorRatePerDay: string | null;
    reason: string | null;
    decidedAt: string | null;
    decisionNote: string | null;
    graceUntil: string | null;
    heldByRunningOrder: boolean;
    createdAt: string;
    requestedBy: NamedPerson | null;
    decidedBy: NamedPerson | null;
}

export interface ListingPriceLockRecord {
    id: string;
    ratePerDay: string;
    expiresAt: string;
    consumedAt: string | null;
    createdAt: string;
    advertiser: { id: string; name: string; companyName: string | null } | null;
}

export interface ListingBlockedDateRecord {
    id: string;
    from: string;
    to: string;
    reason: string | null;
    createdAt: string;
    createdBy: NamedPerson | null;
}

export interface ListingClaimRecord {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
    decisionNote: string | null;
    decidedAt: string | null;
    createdAt: string;
    claimant: { id: string; name: string; displayId: string | null } | null;
}

export interface ListingComplianceCaseRecord {
    id: string;
    reason: string;
    status: string;
    openedAt: string;
    dueAt: string;
    resolvedAt: string | null;
    assignedTo: NamedPerson | null;
}

export interface ListingEarningsHoldRecord {
    id: string;
    amount: number;
    status: "HELD" | "RELEASED" | "FORFEITED";
    heldFrom: string;
    convertsAt: string;
    releasedAt: string | null;
    forfeitedAt: string | null;
    note: string | null;
}

export interface ListingDisputeRecord {
    id: string;
    displayId: string;
    reason: string;
    status: string;
    outcome: string | null;
    createdAt: string;
    resolvedAt: string | null;
}

/** LM-1: a sponsored placement bought for the spot — its own desk is Ads › Sponsored. */
export interface ListingBoostRecord {
    id: string;
    displayId: string | null;
    placements: string[];
    status: string;
    startDate: string;
    endDate: string;
    days: number;
    total: string;
    paidAt: string | null;
    createdAt: string;
}

export interface ListingCustomFieldRecord {
    key: string;
    label: string;
    kind: string;
    archived: boolean;
    value: unknown;
    updatedAt: string;
}

/** How many rows each history holds — the page draws the latest few beside the count. */
export interface ListingRecordCounts {
    orders: number;
    campaignSpots: number;
    photos: number;
    documents: number;
    verifications: number;
    claims: number;
    complianceCases: number;
    earningsHolds: number;
    disputes: number;
    priceLocks: number;
    priceApprovals: number;
    blockedDates: number;
    earningAccruals: number;
    boosts: number;
}

export const EMPTY_RECORD_COUNTS: ListingRecordCounts = {
    orders: 0,
    campaignSpots: 0,
    photos: 0,
    documents: 0,
    verifications: 0,
    claims: 0,
    complianceCases: 0,
    earningsHolds: 0,
    disputes: 0,
    priceLocks: 0,
    priceApprovals: 0,
    blockedDates: 0,
    earningAccruals: 0,
    boosts: 0,
};

/**
 * Everything the record read adds over the old detail. Every key optional:
 * a backend older than the record answers without them, and the page reads
 * the absence as "none".
 */
export interface WireListingRecordExtras {
    hasSiteQr?: boolean;
    coverPhotoUrl?: string | null;
    venueType?: { id: string; name: string; slug: string; category: string } | null;
    sizeClass?: { id: string; name: string; slug: string } | null;
    material?: { id: string; name: string; slug: string } | null;
    plan?: { id: string; name: string } | null;
    cityRef?: { id: string; name: string; slug: string; state: string | null } | null;
    attempt?: { id: string; origin: string; status: string; sourceFilename: string | null; note: string | null; createdAt: string; createdBy: NamedPerson | null } | null;
    suspendedBy?: NamedPerson | null;
    documents?: ListingDocumentRecord[];
    verifications?: ListingVerificationRecord[];
    contentRules?: ListingContentRuleRecord[];
    pricingFactors?: ListingPricingFactorRecord[];
    priceApprovals?: ListingPriceApprovalRecord[];
    priceLocks?: ListingPriceLockRecord[];
    blockedDates?: ListingBlockedDateRecord[];
    claims?: ListingClaimRecord[];
    complianceCases?: ListingComplianceCaseRecord[];
    earningsHolds?: ListingEarningsHoldRecord[];
    disputes?: ListingDisputeRecord[];
    customFields?: ListingCustomFieldRecord[];
    boosts?: ListingBoostRecord[];
    counts?: Partial<ListingRecordCounts>;
}

/** The record as the page holds it: the relations with their defaults, and every column as it came. */
export interface ListingRecord {
    /** Every column of the listing exactly as the read sent it — the "All recorded data" fold reads this. */
    columns: Record<string, unknown>;
    hasSiteQr: boolean;
    coverPhotoUrl: string | null;
    photos: ListingPhotoRecord[];
    /** The publisher's legal form and whether ADX counts them a partner — what the record's join adds to the name. */
    publisherType: string | null;
    isPartnerPublisher: boolean | null;
    /** The onboarding agent's own name, beside their reference. */
    agentName: string | null;
    venueType: WireListingRecordExtras["venueType"] | null;
    sizeClass: WireListingRecordExtras["sizeClass"] | null;
    material: WireListingRecordExtras["material"] | null;
    plan: WireListingRecordExtras["plan"] | null;
    cityRef: WireListingRecordExtras["cityRef"] | null;
    attempt: WireListingRecordExtras["attempt"] | null;
    suspendedBy: NamedPerson | null;
    documents: ListingDocumentRecord[];
    verifications: ListingVerificationRecord[];
    contentRules: ListingContentRuleRecord[];
    pricingFactors: ListingPricingFactorRecord[];
    priceApprovals: ListingPriceApprovalRecord[];
    priceLocks: ListingPriceLockRecord[];
    blockedDates: ListingBlockedDateRecord[];
    claims: ListingClaimRecord[];
    complianceCases: ListingComplianceCaseRecord[];
    earningsHolds: ListingEarningsHoldRecord[];
    disputes: ListingDisputeRecord[];
    customFields: ListingCustomFieldRecord[];
    boosts: ListingBoostRecord[];
    counts: ListingRecordCounts;
}

/** The relations the record carries, taken off the wire so `columns` is the listing's own. */
const RELATION_KEYS = new Set([
    "publisher",
    "agent",
    "attempt",
    "photos",
    "mediaType",
    "venueType",
    "sizeClass",
    "material",
    "plan",
    "cityRef",
    "documents",
    "verifications",
    "contentRules",
    "pricingFactors",
    "priceApprovals",
    "priceLocks",
    "blockedDates",
    "claims",
    "complianceCases",
    "earningsHolds",
    "disputes",
    "customFields",
    "boosts",
    "counts",
    "suspendedBy",
    "hasSiteQr",
    "coverPhotoUrl",
    "carriesLoop",
    "originals",
    "translatedTo",
]);

/** The wire record, shaped: every relation defaulted, every column kept as it came. */
export function shapeListingRecord(wire: Record<string, unknown> & WireListingRecordExtras & { photos?: ListingPhotoRecord[] }): ListingRecord {
    const columns: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(wire)) if (!RELATION_KEYS.has(key)) columns[key] = value;
    const photos = (wire.photos ?? []).map((photo) => ({ ...photo, takenAt: photo.takenAt ?? null, gps: photo.gps ?? null }));
    const publisher = (wire["publisher"] ?? null) as { type?: string; isPartnerPublisher?: boolean } | null;
    const agent = (wire["agent"] ?? null) as { user?: { name?: string | null } | null } | null;
    return {
        columns,
        hasSiteQr: wire.hasSiteQr ?? false,
        coverPhotoUrl: wire.coverPhotoUrl ?? photos[0]?.url ?? null,
        photos,
        publisherType: publisher?.type ?? null,
        isPartnerPublisher: typeof publisher?.isPartnerPublisher === "boolean" ? publisher.isPartnerPublisher : null,
        agentName: agent?.user?.name ?? null,
        venueType: wire.venueType ?? null,
        sizeClass: wire.sizeClass ?? null,
        material: wire.material ?? null,
        plan: wire.plan ?? null,
        cityRef: wire.cityRef ?? null,
        attempt: wire.attempt ?? null,
        suspendedBy: wire.suspendedBy ?? null,
        documents: wire.documents ?? [],
        verifications: wire.verifications ?? [],
        contentRules: wire.contentRules ?? [],
        pricingFactors: wire.pricingFactors ?? [],
        priceApprovals: wire.priceApprovals ?? [],
        priceLocks: wire.priceLocks ?? [],
        blockedDates: wire.blockedDates ?? [],
        claims: wire.claims ?? [],
        complianceCases: wire.complianceCases ?? [],
        earningsHolds: wire.earningsHolds ?? [],
        disputes: wire.disputes ?? [],
        customFields: wire.customFields ?? [],
        boosts: wire.boosts ?? [],
        counts: { ...EMPTY_RECORD_COUNTS, ...(wire.counts ?? {}) },
    };
}

/* ------------------------------------------------------------------ */
/* The register of columns                                              */
/* ------------------------------------------------------------------ */

/** Where a column is drawn on the page. */
export type ListingFieldSection =
    | "about"
    | "site"
    | "audience"
    | "location"
    | "slots"
    | "vehicle"
    | "rates"
    | "rateCard"
    | "booking"
    | "installation"
    | "availability"
    | "rights"
    | "trust"
    | "people"
    | "other"
    | "system";

export const LISTING_FIELD_SECTION_LABEL: Record<ListingFieldSection, string> = {
    about: "About",
    site: "Site",
    audience: "Footfall and audience",
    location: "Location",
    slots: "Slots and formats",
    vehicle: "Vehicle",
    rates: "Rates",
    rateCard: "Rate card",
    booking: "Booking terms",
    installation: "Installation",
    availability: "Availability",
    rights: "Rights",
    trust: "Trust and compliance",
    people: "People and provenance",
    other: "Other answers",
    system: "System",
};

/** How a column's value reads. */
export type ListingFieldFormat =
    | "text"
    | "longText"
    | "number"
    | "money"
    | "day"
    | "dateTime"
    | "yesNo"
    | "feet"
    | "metres"
    | "pixels"
    | "days"
    | "enum"
    | "demographics"
    | "scopes"
    | "file"
    | "ref"
    | "vehicleRc"
    | "waivers"
    | "extraAnswers"
    | "hidden";

export interface ListingField {
    key: string;
    label: string;
    section: ListingFieldSection;
    format: ListingFieldFormat;
}

/**
 * Every column of `Listing`, in the order the page reads them. `ref`
 * columns are ids printed as the thing they point at; `hidden` is the one
 * column the read never sends (the site QR's token) — it reads as whether
 * there is one.
 */
export const LISTING_FIELDS: readonly ListingField[] = [
    // About
    { key: "title", label: "Name", section: "about", format: "text" },
    { key: "description", label: "Description", section: "about", format: "longText" },
    { key: "uniqueSellingPoint", label: "Why advertisers pick it", section: "about", format: "longText" },
    { key: "category", label: "Category", section: "about", format: "enum" },
    { key: "venueTypeId", label: "Venue type", section: "about", format: "ref" },
    { key: "mediaTypeId", label: "Ad spot type", section: "about", format: "ref" },
    { key: "subType", label: "The publisher’s own type", section: "about", format: "text" },
    // Site
    { key: "size", label: "Size as stated", section: "site", format: "text" },
    { key: "widthFt", label: "Width", section: "site", format: "feet" },
    { key: "heightFt", label: "Height", section: "site", format: "feet" },
    { key: "areaSqFt", label: "Area", section: "site", format: "number" },
    { key: "sizeClassId", label: "Size class", section: "site", format: "ref" },
    { key: "materialId", label: "Material", section: "site", format: "ref" },
    { key: "illumination", label: "Illumination", section: "site", format: "text" },
    { key: "facing", label: "Facing", section: "site", format: "text" },
    { key: "placement", label: "Placement", section: "site", format: "text" },
    // 3 Oct 2026: asked on every listing form now and stored as codes; an older free-text answer prints as stored.
    { key: "elevation", label: "Elevation", section: "site", format: "enum" },
    { key: "visibility", label: "Viewing distance", section: "site", format: "enum" },
    { key: "trafficGrade", label: "How busy", section: "site", format: "enum" },
    // Footfall and audience
    { key: "estimatedDailyFootfall", label: "Daily footfall (stated)", section: "audience", format: "number" },
    { key: "footfallNote", label: "Footfall note", section: "audience", format: "longText" },
    { key: "targetAudience", label: "Target audience", section: "audience", format: "longText" },
    { key: "audienceDemographics", label: "Audience profile", section: "audience", format: "demographics" },
    // Location
    { key: "address", label: "Address", section: "location", format: "text" },
    { key: "city", label: "City as typed", section: "location", format: "text" },
    { key: "cityId", label: "Catalogue city", section: "location", format: "ref" },
    { key: "latitude", label: "Latitude", section: "location", format: "number" },
    { key: "longitude", label: "Longitude", section: "location", format: "number" },
    { key: "locationAccuracyM", label: "Pin accuracy", section: "location", format: "metres" },
    { key: "coverage", label: "Area covered", section: "location", format: "text" },
    // Slots and formats
    { key: "slotsTotal", label: "Slots", section: "slots", format: "number" },
    { key: "widthPx", label: "Screen width", section: "slots", format: "pixels" },
    { key: "heightPx", label: "Screen height", section: "slots", format: "pixels" },
    { key: "contentFormat", label: "Content format", section: "slots", format: "text" },
    { key: "broadcastLanguage", label: "Broadcast language", section: "slots", format: "text" },
    // Vehicle
    { key: "vehicleType", label: "Vehicle type", section: "vehicle", format: "enum" },
    { key: "vehicleModel", label: "Vehicle model", section: "vehicle", format: "text" },
    { key: "vehicleNumber", label: "Registration number", section: "vehicle", format: "text" },
    { key: "vehicleRcVerifiedAt", label: "RC last checked", section: "vehicle", format: "dateTime" },
    { key: "vehicleRcPayload", label: "RC check", section: "vehicle", format: "vehicleRc" },
    // Rates
    { key: "ratePerDay", label: "Rate per day", section: "rates", format: "money" },
    { key: "pricingUnit", label: "Priced", section: "rates", format: "enum" },
    { key: "basePrice", label: "Publisher’s own figure", section: "rates", format: "money" },
    { key: "monthlyPrice", label: "Monthly price (derived)", section: "rates", format: "money" },
    { key: "pricingModel", label: "Pricing model", section: "rates", format: "text" },
    { key: "rateGrade", label: "Locality grade", section: "rates", format: "enum" },
    { key: "ratePerDaySetAt", label: "Rate last set", section: "rates", format: "dateTime" },
    { key: "ratePerDaySurgeUntil", label: "Set during a surge until", section: "rates", format: "dateTime" },
    // Rate card
    { key: "rateCardUrl", label: "Rate card file", section: "rateCard", format: "file" },
    { key: "rateCardValidFrom", label: "Rate card valid from", section: "rateCard", format: "day" },
    { key: "rateCardValidTo", label: "Rate card valid to", section: "rateCard", format: "day" },
    { key: "seasonalVariationNote", label: "Seasonal variation", section: "rateCard", format: "longText" },
    { key: "peakPeriodNote", label: "Peak period", section: "rateCard", format: "longText" },
    // Booking terms
    { key: "minBookingDays", label: "Minimum booking", section: "booking", format: "days" },
    { key: "maxBookingDays", label: "Maximum booking", section: "booking", format: "days" },
    { key: "advanceBookingDays", label: "Advance booking needed", section: "booking", format: "days" },
    { key: "cancellationPolicy", label: "Cancellation", section: "booking", format: "enum" },
    { key: "cancellationNoticeDays", label: "Cancellation notice", section: "booking", format: "days" },
    { key: "instantBooking", label: "Instant booking", section: "booking", format: "yesNo" },
    // Installation
    { key: "installationByAdx", label: "Installation by ADX", section: "installation", format: "yesNo" },
    { key: "agentCanInstall", label: "An agent may install", section: "installation", format: "yesNo" },
    { key: "planId", label: "Milestone plan", section: "installation", format: "ref" },
    // Availability
    { key: "availableNow", label: "Free right now", section: "availability", format: "yesNo" },
    { key: "availableYearRound", label: "Available year-round", section: "availability", format: "yesNo" },
    { key: "availableFrom", label: "Available from", section: "availability", format: "day" },
    { key: "availableHoursFrom", label: "Visible from", section: "availability", format: "text" },
    { key: "availableHoursTo", label: "Visible until", section: "availability", format: "text" },
    // 3 Oct 2026: the venue's own hours, kept beside the visibility window rather than folded into it.
    { key: "operatingHoursFrom", label: "Open from", section: "availability", format: "text" },
    { key: "operatingHoursTo", label: "Open until", section: "availability", format: "text" },
    // Rights
    { key: "rightsBasis", label: "How the space is held", section: "rights", format: "enum" },
    { key: "rightsValidUntil", label: "Right runs out on", section: "rights", format: "day" },
    { key: "rightsLapsedAt", label: "Right lapsed on", section: "rights", format: "dateTime" },
    { key: "rightsRemindedAt", label: "Last renewal reminder", section: "rights", format: "dateTime" },
    // Trust and compliance
    { key: "status", label: "Status", section: "trust", format: "enum" },
    { key: "submittedAt", label: "Submitted for review", section: "trust", format: "dateTime" },
    { key: "publishedAt", label: "Went live", section: "trust", format: "dateTime" },
    { key: "rejectionReason", label: "Sent back because", section: "trust", format: "longText" },
    { key: "removability", label: "Removability", section: "trust", format: "enum" },
    { key: "verifiedAt", label: "Last verified", section: "trust", format: "dateTime" },
    { key: "verificationExpiresAt", label: "Verification due", section: "trust", format: "dateTime" },
    { key: "documentsClearedAt", label: "Documents cleared", section: "trust", format: "dateTime" },
    { key: "documentWaivers", label: "Documents marked not applicable", section: "trust", format: "waivers" },
    { key: "termsAcceptedAt", label: "Listing terms accepted", section: "trust", format: "dateTime" },
    { key: "termsVersion", label: "Terms version accepted", section: "trust", format: "text" },
    { key: "ownershipDeclaredAt", label: "Declared they own the venue", section: "trust", format: "dateTime" },
    { key: "qrToken", label: "Site QR", section: "trust", format: "hidden" },
    { key: "suspensionScopes", label: "Suspended sections", section: "trust", format: "scopes" },
    { key: "suspensionReason", label: "Suspension reason", section: "trust", format: "longText" },
    { key: "suspendedById", label: "Suspended by", section: "trust", format: "ref" },
    { key: "suspendedAt", label: "Suspended on", section: "trust", format: "dateTime" },
    { key: "ratingAvg", label: "Average rating", section: "trust", format: "text" },
    { key: "reviewCount", label: "Reviews", section: "trust", format: "number" },
    // People and provenance
    { key: "displayId", label: "Listing ID", section: "people", format: "text" },
    { key: "publisherId", label: "Publisher", section: "people", format: "ref" },
    { key: "agentId", label: "Onboarded by", section: "people", format: "ref" },
    { key: "attemptId", label: "Filed in batch", section: "people", format: "ref" },
    { key: "createdAt", label: "Created", section: "people", format: "dateTime" },
    { key: "updatedAt", label: "Last changed", section: "people", format: "dateTime" },
    // Other answers — what a listing form asked that has no column of its own
    { key: "extraAnswers", label: "Other answers", section: "other", format: "extraAnswers" },
    // System
    { key: "id", label: "Record id", section: "system", format: "text" },
] as const;

const FIELD_BY_KEY = new Map(LISTING_FIELDS.map((field) => [field.key, field]));

export const listingField = (key: string): ListingField | undefined => FIELD_BY_KEY.get(key);

export const fieldsIn = (section: ListingFieldSection): ListingField[] => LISTING_FIELDS.filter((field) => field.section === section);

/** A column with no label yet, in plain words: "someNewColumn" → "Some new column". */
export function plainLabel(key: string): string {
    const words = key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim()
        .toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What an empty field says — it was asked (or could have been) and nothing is on record. */
export const NOT_STATED = "Not stated";

/**
 * The listing questions of 3 Oct 2026, with their options worded as every
 * listing form words them — the website, both apps and the desk store the
 * code and print these. An answer from before the codes (free text such as
 * "Mid-rise") is not a code and prints as stored.
 */
export const SPOT_ATTRIBUTE_WORDS: Record<"trafficGrade" | "visibility" | "elevation" | "vehicleType", Record<string, string>> = {
    trafficGrade: { LOW: "Low", MEDIUM: "Medium", HIGH: "High", VERY_HIGH: "Very high" },
    visibility: { UNDER_50M: "Under 50 m", "50_150M": "50–150 m", "150_300M": "150–300 m", OVER_300M: "Over 300 m" },
    elevation: { GROUND: "Ground level", FIRST_FLOOR: "First floor", ROOFTOP: "Rooftop", ELEVATED: "Elevated structure" },
    vehicleType: { AUTO: "Auto", CAR: "Car", CAB: "Cab", BUS: "Bus", TRUCK: "Truck", OTHER: "Other" },
};

/** A stored code ("PER_MONTH", "50_150M") rather than words somebody typed. */
const CODE = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

/** A coded column's value in words: the register's words, a code read out plainly, anything else exactly as stored. */
export function codeText(key: string, value: string): string {
    return ENUM_WORDS[key]?.[value] ?? (CODE.test(value) ? plainLabel(value.toLowerCase()) : value);
}

const ENUM_WORDS: Record<string, Record<string, string>> = {
    category: { INDOOR: "Indoor", OUTDOOR: "Outdoor", TRANSIT: "Transit", MEDIA: "Media" },
    pricingUnit: PRICING_UNIT_LABEL as Record<PricingUnit, string>,
    rateGrade: { PREMIUM: "Premium", A: "Grade A", B: "Grade B", C: "Grade C" },
    cancellationPolicy: { FLEXIBLE: "Flexible — free up to 48 hours before", NOTICE: "With notice", NONE: "No cancellation once confirmed" },
    rightsBasis: { OWNED: "Owned", LEASED: "Leased", LICENSED: "Licensed", PERMIT: "On a permit" },
    removability: { PERMANENT: "Permanent", REMOVABLE: "Removable" },
    ...SPOT_ATTRIBUTE_WORDS,
    status: {
        UNCLAIMED: "Unclaimed",
        DRAFT: "Draft",
        AWAITING_AGREEMENT: "Awaiting agreement",
        AWAITING_DOCUMENTS: "Awaiting documents",
        PENDING_REVIEW: "Pending review",
        AWAITING_SITE_VERIFICATION: "Awaiting site check",
        ACTIVE: "Live",
        SUSPENDED: "Suspended",
        REJECTED: "Rejected",
        INACTIVE: "Inactive",
    },
};

/** "Primary age band" from `ageBand` — the six bands the wizard asks. */
export const DEMOGRAPHIC_LABEL: Record<string, string> = {
    ageBand: "Primary age band",
    genderSplit: "Gender split",
    urbanRural: "Urban / rural mix",
    secProfile: "SEC profile",
    incomeBracket: "Income bracket",
    occupation: "Top occupation",
};

/** The audience profile as label/value pairs — an object of bands, a list of them, or a plain value. */
export function demographicsRows(value: unknown): [string, string][] {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) {
        return value.map((entry, index) => {
            if (entry && typeof entry === "object") {
                const { label, share, value: v } = entry as { label?: unknown; share?: unknown; value?: unknown };
                return [String(label ?? `Band ${index + 1}`), String(share ?? v ?? "")];
            }
            return [`Band ${index + 1}`, String(entry)];
        });
    }
    if (typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([key, v]) => [DEMOGRAPHIC_LABEL[key] ?? plainLabel(key), typeof v === "object" ? JSON.stringify(v) : String(v)]);
    }
    return [["Profile", String(value)]];
}

const isEmpty = (value: unknown): boolean =>
    value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0);

const plural = (count: number, one: string): string => `${formatNumber(count)} ${count === 1 ? one : `${one}s`}`;

/**
 * A column's value as plain words — what the "All recorded data" fold and
 * every section print. `ref` columns need the record (the name behind the
 * id); everything else reads off the value alone. Never repairs stored
 * text: a title holding U+FFFD prints it as stored.
 */
export function fieldText(field: ListingField, record: ListingRecord, extra: { publisherName?: string | null; agentLabel?: string | null; mediaTypeName?: string | null } = {}): string {
    const value = record.columns[field.key];
    switch (field.format) {
        case "hidden":
            return record.hasSiteQr ? "Issued" : "None";
        case "ref":
            return refText(field.key, record, extra) ?? (isEmpty(value) ? NOT_STATED : String(value));
        default:
            break;
    }
    if (isEmpty(value)) return NOT_STATED;
    switch (field.format) {
        case "text":
        case "longText":
            return String(value);
        case "number":
            return typeof value === "number" ? value.toLocaleString("en-IN") : String(value);
        case "money":
            return formatMoney(String(value));
        case "day":
            return formatDate(String(value));
        case "dateTime":
            return formatDateTime(String(value));
        case "yesNo":
            return value === true ? "Yes" : value === false ? "No" : String(value);
        case "feet":
            return `${String(value)} ft`;
        case "metres":
            return `within ${typeof value === "number" ? Math.round(value).toLocaleString("en-IN") : String(value)} m`;
        case "pixels":
            return `${String(value)} px`;
        case "days":
            return typeof value === "number" ? plural(value, "day") : String(value);
        case "enum":
            return codeText(field.key, String(value));
        case "demographics":
            return demographicsRows(value)
                .map(([label, v]) => `${label}: ${v}`)
                .join(" · ");
        case "scopes":
            return (value as SuspensionScope[]).map((scope) => SCOPE_LABEL[scope] ?? scope).join(", ");
        case "file":
            return "On file";
        case "vehicleRc":
            return vehicleRcText(value);
        case "waivers": {
            const rows = documentWaiverRows(value);
            return rows.length ? rows.map(([label, detail]) => `${label} (${detail})`).join(" · ") : NOT_STATED;
        }
        case "extraAnswers": {
            const rows = extraAnswerRows(value);
            return rows.length ? rows.map(([label, answer]) => `${label}: ${answer}`).join(" · ") : NOT_STATED;
        }
    }
}

/** One answer as words: yes/no, a list joined, anything structured as its JSON. */
function answerText(value: unknown): string {
    if (value === null || value === undefined || value === "") return NOT_STATED;
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (Array.isArray(value)) return value.length ? value.map((item) => (item !== null && typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ") : NOT_STATED;
    if (typeof value === "object") return JSON.stringify(value);
    return typeof value === "number" ? value.toLocaleString("en-IN") : String(value);
}

/**
 * `extraAnswers` — `[{ key, label, value }]`, every answer a listing form
 * collected that has no column of its own — as question/answer rows: the
 * question's own label, else its key in plain words. Anything that is not
 * such a row is passed over rather than printed as a fragment.
 */
export function extraAnswerRows(value: unknown): [string, string][] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): [string, string][] => {
        if (!entry || typeof entry !== "object") return [];
        const { key, label, value: answer } = entry as { key?: unknown; label?: unknown; value?: unknown };
        const name = typeof label === "string" && label.trim() ? label.trim() : typeof key === "string" && key ? plainLabel(key) : null;
        return name ? [[name, answerText(answer)]] : [];
    });
}

/** `documentWaivers` — `[{ kind, reason?, at }]`, the papers marked "Not applicable" — as the paper, then why and when. */
export function documentWaiverRows(value: unknown): [string, string][] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): [string, string][] => {
        if (!entry || typeof entry !== "object") return [];
        const { kind, reason, at } = entry as { kind?: unknown; reason?: unknown; at?: unknown };
        if (typeof kind !== "string" || !kind) return [];
        const detail = [typeof reason === "string" && reason.trim() ? reason.trim() : "no reason given", typeof at === "string" && at ? formatDate(at) : null].filter(Boolean).join(", ");
        return [[documentKindLabel(kind as ListingDocumentKind), detail]];
    });
}

function refText(key: string, record: ListingRecord, extra: { publisherName?: string | null; agentLabel?: string | null; mediaTypeName?: string | null }): string | null {
    switch (key) {
        case "venueTypeId":
            return record.venueType?.name ?? null;
        case "mediaTypeId":
            return extra.mediaTypeName ?? null;
        case "sizeClassId":
            return record.sizeClass?.name ?? null;
        case "materialId":
            return record.material?.name ?? null;
        case "cityId":
            return record.cityRef ? [record.cityRef.name, record.cityRef.state].filter(Boolean).join(", ") : null;
        case "planId":
            return record.plan?.name ?? null;
        case "suspendedById":
            return record.suspendedBy ? (record.suspendedBy.name ?? "A colleague") : null;
        case "publisherId":
            return extra.publisherName ?? null;
        case "agentId":
            return extra.agentLabel ?? (record.columns["agentId"] ? null : "Self-serve");
        case "attemptId":
            return record.attempt ? `${ATTEMPT_ORIGIN_LABEL[record.attempt.origin] ?? plainLabel(record.attempt.origin.toLowerCase())} · ${formatDate(record.attempt.createdAt)}` : null;
        default:
            return null;
    }
}

export const ATTEMPT_ORIGIN_LABEL: Record<string, string> = {
    SELF: "Filed by the publisher",
    AGENT: "Filed by an agent",
    ADMIN_SINGLE: "Filed from the desk",
    ADMIN_BULK: "Desk import",
    SCRAPE: "Scraped",
    PUBLISHER_BULK: "Publisher’s bulk upload",
};

/** VH-1: the RC check in words — the owner's name match and validity, never the whole payload. */
export function vehicleRcText(value: unknown): string {
    if (!value || typeof value !== "object") return NOT_STATED;
    const rc = value as { status?: string; nameMatch?: number; insuranceUpto?: string; fitnessUpto?: string };
    const parts = [
        rc.status ? `RC ${rc.status.toLowerCase()}` : null,
        typeof rc.nameMatch === "number" ? `owner name match ${rc.nameMatch}%` : null,
        rc.insuranceUpto ? `insured to ${rc.insuranceUpto}` : null,
        rc.fitnessUpto ? `fit to ${rc.fitnessUpto}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Checked";
}

/** The photograph's angle in words. */
export function photoTypeLabel(type: string): string {
    const upper = type.toUpperCase();
    return (
        { FRONT: "Front", LEFT: "Left angle", RIGHT: "Right angle", WIDE: "Wide angle", MAIN: "Main", COVER: "Cover" } as Record<string, string>
    )[upper] ?? plainLabel(type.toLowerCase());
}

export const contentStanceMeta = (stance: ContentStance): StatusMeta => CONTENT_STANCE_META[stance] ?? { label: plainLabel(String(stance).toLowerCase()), tone: "neutral" };
export const documentKindLabel = (kind: ListingDocumentKind): string => DOCUMENT_KIND_LABEL[kind] ?? plainLabel(String(kind).toLowerCase());

/* ------------------------------------------------------------------ */
/* Performance — `GET /listings/:id/insights`                            */
/* ------------------------------------------------------------------ */

/** Booked slot-days over the slot-days on the market and not blocked; `rate` 0..1, null with nothing available. */
export interface Occupancy {
    bookedSlotDays: number;
    availableSlotDays: number;
    rate: number | null;
}

export interface RatingOver {
    average: string | null;
    count: number;
}

export interface ListingInsights {
    listingId: string;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    slotsTotal: number;
    /** The Indian day the spot went live; null for one never published. */
    onMarketFrom: string | null;
    window: {
        saves: Figure;
        bookings: Figure;
        enquiries: Figure;
        scans: Figure;
        clicks: Figure;
        landingViews: Figure;
        bookedValue: MoneyFigure;
        gmv: MoneyFigure;
        occupancy: { current: Occupancy; previous: Occupancy };
        rating: { current: RatingOver; previous: RatingOver };
        /** 3 Oct 2026: views of the spot's own page on the website and in the apps; absent from a backend that does not count them yet. */
        views?: Figure;
        /** Visitors counted once a listing a day — summed over the window's days. */
        uniqueVisitors?: Figure;
    };
    lifetime: {
        saves: number;
        bookings: number;
        enquiries: number;
        scans: number;
        clicks: number;
        landingViews: number;
        bookedValue: Money;
        gmv: Money;
        occupancy: Occupancy;
        rating: RatingOver;
        views?: number;
        uniqueVisitors?: number;
    };
    series: {
        saves: Series;
        bookings: Series;
        enquiries: Series;
        scans: Series;
        clicks: Series;
        landingViews: Series;
        reviews: Series;
        occupiedSlots: Series;
        bookedValue: MoneySeries;
        gmv: MoneySeries;
        views?: Series;
        uniqueVisitors?: Series;
    };
    /** What the platform does not record — said, never drawn as a zero. */
    untracked: { metric: string; label: string; reason: string }[];
}

/** "42%" — the occupancy, or a dash with nothing available to book. */
export function occupancyText(occupancy: Occupancy): string {
    return occupancy.rate === null ? "—" : `${Math.round(occupancy.rate * 1000) / 10}%`;
}

export const listingRecordService = {
    /** The Performance tab: the window against the days before it, the whole life, the day series. ADMIN, `supply.view`. */
    insights: (id: string, window: { from: string; to: string }): Promise<ListingInsights> =>
        http.get<ListingInsights>(
            `/listings/${encodeURIComponent(id)}/insights?from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}`,
        ),
};
