import { areaSqFtFrom } from "@/lib/rate-per-day";
import type { FlowScreen } from "@/types";
import type { MediaType } from "@/types/pricing-engine";
import { CONTENT_RULES_FIELD, collectedDocuments, fieldsOf, isBlank, type CollectedDocument, type ContentRule, type FlowAnswers, type GeoPoint } from "./flow-model";

/**
 * FL-3 (27 Sep 2026): flow answers, as the console's create request.
 *
 * The one place the flow's field ids meet the column names — the console's
 * twin of the apps' `toCreateBody`. The keys and values are exactly what
 * `listing-create.tsx` posted before the form was drawn from the flow
 * (`listing-body.test.ts` diffs the two), plus the keys the apps send for
 * the screens the desk form never had: the content rules, the rights term,
 * the rate card, the photographs, a vehicle's registration.
 *
 * The admin extras ride in beside the answers: whose spot this is, the
 * standard size an operator may pick instead of measuring, and the three
 * attributes the flow does not ask (elevation, visibility, traffic).
 *
 * LF-2 (28 Sep 2026): the flow asks what the website's wizard asked —
 * installation, the vehicle model, a broadcast outlet, the audience
 * profile and its reports, the booking terms, the rate card's validity and
 * the four photo angles — and every surface maps the answers the same way
 * (the table in the LF-2 brief; `listing-body.test.ts` pins every row).
 * Only an answered question sends its key.
 *
 * LD-1 (3 Oct 2026): the questions every listing form now asks — daily
 * footfall, how busy, how far it is seen, how high, a screen's resolution,
 * the kind of vehicle, available now, the area covered, the venue's own
 * hours — map to their columns; the select answers are the stable codes
 * (`HIGH`, `50_150M`, `ROOFTOP`, `CAB`). And no answer is dropped: with
 * the screens in play, every answered question that maps to no column
 * rides along as `extraAnswers`, `[{ key, label, value }]`.
 */

export interface ListingBodyExtras {
    publisherId: string;
    /** The spot type chosen, for its category — carried rather than asked twice, as the old form did. */
    mediaType: MediaType | null;
    /** The standard size picked instead of, or beside, the measurements. */
    sizeClassId?: string;
    /** The attributes the desk asks and the flow does not. */
    attributes?: Partial<Record<"illumination" | "facing" | "elevation" | "visibility" | "trafficGrade", string>>;
    /** LD-1: the screens in play — their labels name the answers that have no column, sent as `extraAnswers`. */
    screens?: FlowScreen[];
}

/** Plates are read with spaces and in any case; the server normalises the same way. */
export const normalisePlate = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** LF-2: the review's four angles, in the order they are posted, and the photo type each is filed as. */
export const PHOTO_ANGLES = [
    ["main_photo", "FRONT"],
    ["left_photo", "LEFT"],
    ["right_photo", "RIGHT"],
    ["wide_photo", "WIDE"],
] as const;

/** LF-2: the audience screen's six answers, as the keys of the listing's `audienceDemographics`. */
export const AUDIENCE_KEYS = [
    ["age_band", "ageBand"],
    ["gender_split", "genderSplit"],
    ["urban_rural", "urbanRural"],
    ["sec_profile", "secProfile"],
    ["income_bracket", "incomeBracket"],
    ["occupation", "occupation"],
] as const;

/** LF-2: the audience screen's two reports, filed as listing documents once the listing exists. */
export const REPORT_DOCUMENTS = [
    ["barc_report", "AUDIENCE_RATING"],
    ["footfall_report", "FOOTFALL_AUDIT"],
] as const;

/**
 * LD-1: every flow field id this file (or the documents step after it)
 * files somewhere. An answered field outside this set has no column and is
 * sent as an extra answer rather than dropped.
 */
export const MAPPED_FIELD_IDS: ReadonlySet<string> = new Set([
    "category",
    "title",
    "address",
    "city",
    "location",
    "venue_type_id",
    "media_type_id",
    "material_id",
    "placement",
    "width_ft",
    "height_ft",
    "area_sq_ft",
    "pricing_unit",
    "base_price",
    "description",
    "target_audience",
    "unique_selling_point",
    "footfall_note",
    "illumination",
    "facing",
    "min_booking_days",
    "available_from",
    "available_hours",
    "peak_period_note",
    "rate_card",
    "vehicle_number",
    "installation_by_adx",
    "vehicle_model",
    "broadcast_language",
    "content_format",
    "slot_duration",
    "available_year_round",
    "max_booking_days",
    "advance_booking_days",
    "cancellation_notice",
    "rate_card_valid_from",
    "rate_card_valid_to",
    "rate_card_seasonal",
    "rights_basis",
    "rights_valid_until",
    CONTENT_RULES_FIELD,
    "documents",
    "barc_report",
    "footfall_report",
    "terms",
    // LD-1's questions
    "estimated_daily_footfall",
    "traffic_grade",
    "visibility",
    "elevation",
    "width_px",
    "height_px",
    "vehicle_type",
    "available_now",
    "coverage",
    "operating_hours",
    ...AUDIENCE_KEYS.map(([id]) => id),
    ...PHOTO_ANGLES.map(([id]) => id),
]);

/** Kinds that hold no answer of their own, or file it through their own door. */
const NOT_AN_ANSWER = new Set(["section", "computed", "document-upload", "content-stance", "content-prohibited"]);

/** A whole number from what was typed ("45,000" reads as 45000); nothing for anything else. */
const wholeNumber = (value: string | undefined, min: number): number | undefined => {
    if (value === undefined) return undefined;
    const digits = value.replace(/[,\s]/g, "");
    if (!/^\d+$/.test(digits)) return undefined;
    const number = Number(digits);
    return Number.isSafeInteger(number) && number >= min ? number : undefined;
};

/**
 * LD-1: the answered questions on the screens in play that map to no
 * column, as the listing keeps them — the question's id, its label as
 * worded, and the answer.
 */
export function flowExtraAnswers(answers: FlowAnswers, screens: FlowScreen[]): { key: string; label: string; value: unknown }[] {
    const out: { key: string; label: string; value: unknown }[] = [];
    for (const field of fieldsOf(screens).values()) {
        if (MAPPED_FIELD_IDS.has(field.id) || NOT_AN_ANSWER.has(field.type)) continue;
        const value = answers[field.id];
        if (isBlank(value)) continue;
        out.push({ key: field.id, label: field.label?.trim() || field.id, value: typeof value === "string" ? value.trim() : value });
    }
    return out;
}

/** A select whose option ids are a number of days: the number, or nothing for an id that is not one. */
const daysOf = (id: string | undefined): number | undefined => {
    if (id === undefined || !/^\d+$/.test(id)) return undefined;
    return Number(id);
};

/**
 * LF-2: the cancellation select, as the pair of columns. `flexible` is free
 * up to 48 hours before; a number is that many days' notice; `none` is no
 * cancellation once confirmed.
 */
function cancellationOf(id: string | undefined): Record<string, unknown> {
    if (id === "flexible") return { cancellationPolicy: "FLEXIBLE" };
    if (id === "none") return { cancellationPolicy: "NONE" };
    const days = daysOf(id);
    return days !== undefined ? { cancellationPolicy: "NOTICE", cancellationNoticeDays: days } : {};
}

export function flowListingBody(answers: FlowAnswers, extras: ListingBodyExtras): Record<string, unknown> {
    const text = (id: string): string | undefined => {
        const value = answers[id];
        if (typeof value !== "string") return undefined;
        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed;
    };
    const point = answers.location as GeoPoint | undefined;
    const hours = answers.available_hours as { from?: string; to?: string } | undefined;
    const rules = answers[CONTENT_RULES_FIELD] as ContentRule[] | undefined;
    const photos = PHOTO_ANGLES.flatMap(([id, type]) => (text(id) ? [{ url: text(id)!, type }] : []));
    /* Measured means both halves make an area — the same test the old form gated the pair on. */
    const measured = areaSqFtFrom(String(answers.width_ft ?? ""), String(answers.height_ft ?? "")) !== null;
    const minDays = text("min_booking_days");
    const category = extras.mediaType?.category ?? String(answers.category ?? "").toUpperCase();
    const rightsBasis = text("rights_basis");
    const audience = Object.fromEntries(AUDIENCE_KEYS.flatMap(([id, key]) => (text(id) ? [[key, text(id)!]] : [])));
    const yearRound = text("available_year_round");
    const maxDays = daysOf(text("max_booking_days"));
    const advanceDays = daysOf(text("advance_booking_days"));
    const footfall = wholeNumber(text("estimated_daily_footfall"), 0);
    const widthPx = wholeNumber(text("width_px"), 1);
    const heightPx = wholeNumber(text("height_px"), 1);
    const operating = answers.operating_hours as { from?: string; to?: string } | undefined;
    const extraAnswers = extras.screens ? flowExtraAnswers(answers, extras.screens) : [];

    return {
        publisherId: extras.publisherId,
        title: text("title") ?? "",
        category,
        address: text("address") ?? "",
        ...(text("city") ? { city: text("city") } : {}),
        ...(point ? { latitude: point.latitude, longitude: point.longitude } : {}),
        ...(text("venue_type_id") ? { venueTypeId: text("venue_type_id") } : {}),
        mediaTypeId: text("media_type_id") ?? "",
        ...(extras.sizeClassId ? { sizeClassId: extras.sizeClassId } : {}),
        ...(measured ? { widthFt: text("width_ft"), heightFt: text("height_ft") } : {}),
        ...(text("material_id") ? { materialId: text("material_id") } : {}),
        ...(text("placement") ? { placement: text("placement") } : {}),
        pricingUnit: text("pricing_unit") ?? "PER_DAY",
        basePrice: text("base_price") ?? "",
        ...(text("description") ? { description: text("description") } : {}),
        ...(text("target_audience") ? { targetAudience: text("target_audience") } : {}),
        ...(text("unique_selling_point") ? { uniqueSellingPoint: text("unique_selling_point") } : {}),
        ...(text("footfall_note") ? { footfallNote: text("footfall_note") } : {}),
        ...(text("illumination") ? { illumination: text("illumination") } : {}),
        ...(text("facing") ? { facing: text("facing") } : {}),
        ...(extras.attributes ?? {}),
        ...(minDays ? { minBookingDays: Number(minDays) } : {}),
        ...(text("available_from") ? { availableFrom: text("available_from") } : {}),
        ...(hours?.from?.trim() ? { availableHoursFrom: hours.from.trim() } : {}),
        ...(hours?.to?.trim() ? { availableHoursTo: hours.to.trim() } : {}),
        ...(text("peak_period_note") ? { peakPeriodNote: text("peak_period_note") } : {}),
        ...(text("rate_card") ? { rateCardUrl: text("rate_card") } : {}),
        ...(text("vehicle_number") ? { vehicleNumber: normalisePlate(text("vehicle_number")!) } : {}),
        /* LF-2: the rows the website's wizard asked and the flow now asks everywhere. */
        ...(answers.installation_by_adx === true ? { installationByAdx: true } : {}),
        ...(text("vehicle_model") ? { vehicleModel: text("vehicle_model") } : {}),
        ...(text("broadcast_language") ? { broadcastLanguage: text("broadcast_language") } : {}),
        ...(text("content_format") ? { contentFormat: text("content_format") } : {}),
        ...(text("slot_duration") ? { size: text("slot_duration") } : {}),
        ...(Object.keys(audience).length > 0 ? { audienceDemographics: audience } : {}),
        // LF-2: its own column — `availableNow` is the live occupied flag the planner filters on and orders flip.
        ...(yearRound === "yes" ? { availableYearRound: true } : yearRound === "no" ? { availableYearRound: false } : {}),
        ...(maxDays !== undefined ? { maxBookingDays: maxDays } : {}),
        ...(advanceDays !== undefined ? { advanceBookingDays: advanceDays } : {}),
        ...cancellationOf(text("cancellation_notice")),
        ...(text("rate_card_valid_from") ? { rateCardValidFrom: text("rate_card_valid_from") } : {}),
        ...(text("rate_card_valid_to") ? { rateCardValidTo: text("rate_card_valid_to") } : {}),
        ...(text("rate_card_seasonal") ? { seasonalVariationNote: text("rate_card_seasonal") } : {}),
        ...(rightsBasis ? { rightsBasis } : {}),
        ...(rightsBasis && rightsBasis !== "OWNED" && text("rights_valid_until") ? { rightsValidUntil: text("rights_valid_until") } : {}),
        ...(rules && rules.length > 0 ? { contentRules: rules } : {}),
        ...(photos.length > 0 ? { photos } : {}),
        /* LD-1: the questions every listing form now asks. */
        ...(footfall !== undefined ? { estimatedDailyFootfall: footfall } : {}),
        ...(text("traffic_grade") ? { trafficGrade: text("traffic_grade") } : {}),
        ...(text("visibility") ? { visibility: text("visibility") } : {}),
        ...(text("elevation") ? { elevation: text("elevation") } : {}),
        ...(widthPx !== undefined ? { widthPx } : {}),
        ...(heightPx !== undefined ? { heightPx } : {}),
        ...(text("vehicle_type") ? { vehicleType: text("vehicle_type") } : {}),
        ...(typeof answers.available_now === "boolean" ? { availableNow: answers.available_now } : {}),
        ...(text("coverage") ? { coverage: text("coverage") } : {}),
        ...(operating?.from?.trim() ? { operatingHoursFrom: operating.from.trim() } : {}),
        ...(operating?.to?.trim() ? { operatingHoursTo: operating.to.trim() } : {}),
        ...(extraAnswers.length > 0 ? { extraAnswers } : {}),
    };
}

/**
 * Everything filed onto the listing once it exists, in the order it is
 * posted to `POST /supply/listings/:listingId/documents`: the venue proofs
 * the documents step collected, then (LF-2) the audience screen's two
 * reports — the BARC / TAM sheet as AUDIENCE_RATING, the footfall audit as
 * FOOTFALL_AUDIT.
 */
export function flowListingDocuments(answers: FlowAnswers): CollectedDocument[] {
    const reports = REPORT_DOCUMENTS.flatMap(([id, kind]) => {
        const url = answers[id];
        return typeof url === "string" && url.trim() !== "" ? [{ kind, url: url.trim() }] : [];
    });
    return [...collectedDocuments(answers), ...reports];
}
