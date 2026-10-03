import { describe, expect, it } from "vitest";
import type { MediaType } from "@/types/pricing-engine";
import { MAPPED_FIELD_IDS, flowExtraAnswers, flowListingBody, flowListingDocuments, normalisePlate } from "./listing-body";
import { CONTENT_RULES_FIELD, answersInPlay, screensInPlay } from "./flow-model";
import { LISTING_FLOW_FIXTURE, VOCAB_FIXTURE } from "./test-fixtures";

/**
 * FL-3: payload parity. `legacyBody` is the submit builder `listing-create
 * .tsx` carried before the form was drawn from the flow, copied verbatim
 * with its state spelled out; `flowListingBody` must produce the same keys
 * and the same values for the same facts, and only then the keys the apps
 * send for the screens the desk gained.
 */

interface LegacyState {
    publisherId: string;
    title: string;
    mediaType: MediaType;
    address: string;
    city: string;
    lat: number;
    lng: number;
    venueTypeId: string | null;
    effectiveTypeId: string;
    effectiveSizeId: string;
    measured: boolean;
    widthFt: string;
    heightFt: string;
    effectiveMaterialId: string;
    effectivePlacement: string;
    unit: string;
    basePrice: string;
    description: string;
    targetAudience: string;
    uniqueSellingPoint: string;
    footfallNote: string;
    attributes: Partial<Record<"illumination" | "facing" | "elevation" | "visibility" | "trafficGrade", string>>;
    minBookingDays: string;
    availableFrom: string;
    hoursFrom: string;
    hoursTo: string;
    peakPeriodNote: string;
}

/** The old form's `submit()` body, verbatim. */
function legacyBody(s: LegacyState): Record<string, unknown> {
    return {
        publisherId: s.publisherId,
        title: s.title.trim(),
        category: s.mediaType.category,
        address: s.address.trim(),
        city: s.city.trim() || undefined,
        latitude: s.lat,
        longitude: s.lng,
        ...(s.venueTypeId ? { venueTypeId: s.venueTypeId } : {}),
        mediaTypeId: s.effectiveTypeId,
        ...(s.effectiveSizeId ? { sizeClassId: s.effectiveSizeId } : {}),
        ...(s.measured ? { widthFt: s.widthFt.trim(), heightFt: s.heightFt.trim() } : {}),
        ...(s.effectiveMaterialId ? { materialId: s.effectiveMaterialId } : {}),
        ...(s.effectivePlacement.trim() ? { placement: s.effectivePlacement.trim() } : {}),
        pricingUnit: s.unit,
        basePrice: s.basePrice.trim(),
        ...(s.description.trim() ? { description: s.description.trim() } : {}),
        ...(s.targetAudience.trim() ? { targetAudience: s.targetAudience.trim() } : {}),
        ...(s.uniqueSellingPoint.trim() ? { uniqueSellingPoint: s.uniqueSellingPoint.trim() } : {}),
        ...(s.footfallNote.trim() ? { footfallNote: s.footfallNote.trim() } : {}),
        ...s.attributes,
        ...(s.minBookingDays.trim() ? { minBookingDays: Number(s.minBookingDays) } : {}),
        ...(s.availableFrom ? { availableFrom: s.availableFrom } : {}),
        ...(s.hoursFrom.trim() ? { availableHoursFrom: s.hoursFrom.trim() } : {}),
        ...(s.hoursTo.trim() ? { availableHoursTo: s.hoursTo.trim() } : {}),
        ...(s.peakPeriodNote.trim() ? { peakPeriodNote: s.peakPeriodNote.trim() } : {}),
    };
}

const atrium = VOCAB_FIXTURE.mediaTypes.find((type) => type.id === "mt_atrium")!;

/** Every fact the old form could hold, once. */
const full: LegacyState = {
    publisherId: "pub_1",
    title: "  Atrium wall  ",
    mediaType: atrium,
    address: " Phoenix Mall, Whitefield ",
    city: " Bengaluru ",
    lat: 12.9956,
    lng: 77.6969,
    venueTypeId: "vt_mall",
    effectiveTypeId: "mt_atrium",
    effectiveSizeId: "sc_10x6",
    measured: true,
    widthFt: "10 ",
    heightFt: " 6",
    effectiveMaterialId: "mat_led",
    effectivePlacement: " Atrium ",
    unit: "PER_SQFT_PER_MONTH",
    basePrice: " 150.50 ",
    description: " Faces the escalators ",
    targetAudience: "Shoppers 25-40 ",
    uniqueSellingPoint: " Eye level ",
    footfallNote: "~8,000 a day",
    attributes: { illumination: "Digital", facing: "Single", elevation: "Mid-rise", visibility: "Clear", trafficGrade: "Prime" },
    minBookingDays: "30",
    availableFrom: "2026-10-01",
    hoursFrom: " 10 AM",
    hoursTo: "10 PM ",
    peakPeriodNote: " Weekends ",
};

/** The same facts, as the flow's answers plus the desk's extras. */
const fullAnswers = {
    category: "indoor",
    venue_type_id: "vt_mall",
    media_type_id: "mt_atrium",
    material_id: "mat_led",
    title: full.title,
    placement: full.effectivePlacement,
    address: full.address,
    city: full.city,
    location: { latitude: full.lat, longitude: full.lng },
    width_ft: full.widthFt,
    height_ft: full.heightFt,
    illumination: "Digital",
    facing: "Single",
    description: full.description,
    target_audience: full.targetAudience,
    unique_selling_point: full.uniqueSellingPoint,
    footfall_note: full.footfallNote,
    pricing_unit: full.unit,
    base_price: full.basePrice,
    min_booking_days: full.minBookingDays,
    available_from: full.availableFrom,
    available_hours: { from: full.hoursFrom, to: full.hoursTo },
    peak_period_note: full.peakPeriodNote,
};
const fullExtras = { publisherId: "pub_1", mediaType: atrium, sizeClassId: "sc_10x6", attributes: { elevation: "Mid-rise", visibility: "Clear", trafficGrade: "Prime" } as const };

describe("flowListingBody — parity with the old form's builder", () => {
    it("sends the same keys and values for a full answer set", () => {
        const expected = legacyBody(full);
        const actual = flowListingBody(fullAnswers, fullExtras);
        expect(actual).toEqual(expected);
        expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    });

    it("sends the same minimum: a measured outdoor spot with no venue, no size class, nothing optional", () => {
        const billboard = VOCAB_FIXTURE.mediaTypes.find((type) => type.id === "mt_billboard")!;
        const minimal: LegacyState = {
            ...full,
            title: "MG Road Billboard",
            mediaType: billboard,
            address: "Western Express Highway",
            city: "Mumbai",
            lat: 19.076,
            lng: 72.8777,
            venueTypeId: null,
            effectiveTypeId: "mt_billboard",
            effectiveSizeId: "",
            widthFt: "40",
            heightFt: "20",
            effectiveMaterialId: "",
            effectivePlacement: "",
            unit: "PER_DAY",
            basePrice: "12500",
            description: "",
            targetAudience: "",
            uniqueSellingPoint: "",
            footfallNote: "",
            attributes: {},
            minBookingDays: "",
            availableFrom: "",
            hoursFrom: "",
            hoursTo: "",
            peakPeriodNote: "",
        };
        const answers = {
            category: "outdoor",
            title: "MG Road Billboard",
            media_type_id: "mt_billboard",
            address: "Western Express Highway",
            city: "Mumbai",
            location: { latitude: 19.076, longitude: 72.8777 },
            width_ft: "40",
            height_ft: "20",
            pricing_unit: "PER_DAY",
            base_price: "12500",
        };
        expect(flowListingBody(answers, { publisherId: "pub_1", mediaType: billboard })).toEqual(legacyBody(minimal));
        expect(flowListingBody(answers, { publisherId: "pub_1", mediaType: billboard })).toEqual({
            publisherId: "pub_1",
            title: "MG Road Billboard",
            category: "OUTDOOR",
            address: "Western Express Highway",
            city: "Mumbai",
            latitude: 19.076,
            longitude: 72.8777,
            mediaTypeId: "mt_billboard",
            widthFt: "40",
            heightFt: "20",
            pricingUnit: "PER_DAY",
            basePrice: "12500",
        });
    });

    it("sends the measurements only when both halves make an area, the way the old form gated the pair", () => {
        const body = flowListingBody({ ...fullAnswers, height_ft: "" }, fullExtras);
        expect(body).not.toHaveProperty("widthFt");
        expect(body).not.toHaveProperty("heightFt");
        expect(body).toHaveProperty("sizeClassId", "sc_10x6");
    });

    it("carries the category from the spot type as the old form did, and from the branch when none is chosen yet", () => {
        expect(flowListingBody({ category: "media" }, { publisherId: "pub_1", mediaType: null })).toMatchObject({ category: "MEDIA", pricingUnit: "PER_DAY" });
    });
});

describe("flowListingBody — what the apps send that the old form never had", () => {
    it("adds the rights term, the rate card, the vehicle, the content rules and the photographs", () => {
        const body = flowListingBody(
            {
                ...fullAnswers,
                rate_card: "https://files/rate.pdf",
                vehicle_number: "ka 01 ab 1234",
                rights_basis: "PERMIT",
                rights_valid_until: "2027-03-31",
                [CONTENT_RULES_FIELD]: [{ contentCategoryId: "cc_tobacco", stance: "PROHIBITED" }],
                main_photo: "https://files/main.jpg",
                wide_photo: "https://files/wide.jpg",
            },
            fullExtras,
        );
        expect(body).toMatchObject({
            rateCardUrl: "https://files/rate.pdf",
            vehicleNumber: "KA01AB1234",
            rightsBasis: "PERMIT",
            rightsValidUntil: "2027-03-31",
            contentRules: [{ contentCategoryId: "cc_tobacco", stance: "PROHIBITED" }],
            /* LF-2: typed by angle, as the website always sent them. */
            photos: [
                { url: "https://files/main.jpg", type: "FRONT" },
                { url: "https://files/wide.jpg", type: "WIDE" },
            ],
        });
    });

    it("sends the end date only with a lease, licence or permit, and no rules or photos keys when there are none", () => {
        const owned = flowListingBody({ ...fullAnswers, rights_basis: "OWNED", rights_valid_until: "2027-03-31", [CONTENT_RULES_FIELD]: [] }, fullExtras);
        expect(owned).toHaveProperty("rightsBasis", "OWNED");
        expect(owned).not.toHaveProperty("rightsValidUntil");
        expect(owned).not.toHaveProperty("contentRules");
        expect(owned).not.toHaveProperty("photos");
        expect(normalisePlate("mh-12 de 1433")).toBe("MH12DE1433");
    });
});

/**
 * LF-2 (28 Sep 2026): the one mapping the website, the user app, the agent
 * app and the console share — every row of the brief's table, answered at
 * once, and the exact body and document posts they make.
 */
describe("flowListingBody — LF-2, the mapping every surface shares", () => {
    const lf2Answers = {
        ...fullAnswers,
        installation_by_adx: true,
        vehicle_number: "ka 01 ab 1234",
        vehicle_model: "Taxi / cab",
        broadcast_language: "Hindi · English",
        content_format: "News and current affairs",
        slot_duration: "30 seconds",
        age_band: "25–34",
        gender_split: "Balanced",
        urban_rural: "Urban",
        sec_profile: "SEC A / B",
        income_bracket: "₹6 – 12 lakh",
        occupation: "Office workers",
        barc_report: "https://files/barc.pdf",
        footfall_report: "https://files/footfall.xlsx",
        available_year_round: "yes",
        max_booking_days: "90",
        advance_booking_days: "0",
        cancellation_notice: "14",
        rate_card: "https://files/rate.pdf",
        rate_card_valid_from: "2026-10-01",
        rate_card_valid_to: "2027-03-31",
        rate_card_seasonal: "Higher in the festive season (Oct – Dec)",
        rights_basis: "LEASED",
        rights_valid_until: "2027-09-30",
        [CONTENT_RULES_FIELD]: [{ contentCategoryId: "cc_tobacco", stance: "PROHIBITED" }],
        main_photo: "https://files/front.jpg",
        left_photo: "https://files/left.jpg",
        right_photo: "https://files/right.jpg",
        wide_photo: "https://files/wide.jpg",
        documents: [{ kind: "OWNER_NOC", url: "https://files/noc.pdf" }],
    };

    it("sends exactly the body of the table for a full answer set", () => {
        expect(flowListingBody(lf2Answers, fullExtras)).toStrictEqual({
            /* What the old form sent, unchanged. */
            publisherId: "pub_1",
            title: "Atrium wall",
            category: "INDOOR",
            address: "Phoenix Mall, Whitefield",
            city: "Bengaluru",
            latitude: 12.9956,
            longitude: 77.6969,
            venueTypeId: "vt_mall",
            mediaTypeId: "mt_atrium",
            sizeClassId: "sc_10x6",
            widthFt: "10",
            heightFt: "6",
            materialId: "mat_led",
            placement: "Atrium",
            pricingUnit: "PER_SQFT_PER_MONTH",
            basePrice: "150.50",
            description: "Faces the escalators",
            targetAudience: "Shoppers 25-40",
            uniqueSellingPoint: "Eye level",
            footfallNote: "~8,000 a day",
            illumination: "Digital",
            facing: "Single",
            elevation: "Mid-rise",
            visibility: "Clear",
            trafficGrade: "Prime",
            minBookingDays: 30,
            availableFrom: "2026-10-01",
            availableHoursFrom: "10 AM",
            availableHoursTo: "10 PM",
            peakPeriodNote: "Weekends",
            /* FL-3's keys. */
            rateCardUrl: "https://files/rate.pdf",
            vehicleNumber: "KA01AB1234",
            rightsBasis: "LEASED",
            rightsValidUntil: "2027-09-30",
            contentRules: [{ contentCategoryId: "cc_tobacco", stance: "PROHIBITED" }],
            /* LF-2's rows, one by one. */
            installationByAdx: true,
            vehicleModel: "Taxi / cab",
            broadcastLanguage: "Hindi · English",
            contentFormat: "News and current affairs",
            size: "30 seconds",
            audienceDemographics: { ageBand: "25–34", genderSplit: "Balanced", urbanRural: "Urban", secProfile: "SEC A / B", incomeBracket: "₹6 – 12 lakh", occupation: "Office workers" },
            availableYearRound: true,
            maxBookingDays: 90,
            advanceBookingDays: 0,
            cancellationPolicy: "NOTICE",
            cancellationNoticeDays: 14,
            rateCardValidFrom: "2026-10-01",
            rateCardValidTo: "2027-03-31",
            seasonalVariationNote: "Higher in the festive season (Oct – Dec)",
            photos: [
                { url: "https://files/front.jpg", type: "FRONT" },
                { url: "https://files/left.jpg", type: "LEFT" },
                { url: "https://files/right.jpg", type: "RIGHT" },
                { url: "https://files/wide.jpg", type: "WIDE" },
            ],
        });
    });

    it("files the venue proofs, then the BARC sheet as AUDIENCE_RATING and the footfall audit as FOOTFALL_AUDIT", () => {
        expect(flowListingDocuments(lf2Answers)).toStrictEqual([
            { kind: "OWNER_NOC", url: "https://files/noc.pdf" },
            { kind: "AUDIENCE_RATING", url: "https://files/barc.pdf" },
            { kind: "FOOTFALL_AUDIT", url: "https://files/footfall.xlsx" },
        ]);
        expect(flowListingDocuments({ ...lf2Answers, documents: [], barc_report: " ", footfall_report: undefined })).toStrictEqual([]);
        expect(flowListingDocuments({ footfall_report: "https://files/footfall.pdf" })).toStrictEqual([{ kind: "FOOTFALL_AUDIT", url: "https://files/footfall.pdf" }]);
    });

    it("maps the cancellation select onto the policy and the days, and the year-round select onto availableYearRound (never the live availableNow)", () => {
        const terms = (answers: Record<string, unknown>) => {
            const body = flowListingBody(answers, { publisherId: "pub_1", mediaType: null });
            return Object.fromEntries(Object.entries(body).filter(([key]) => ["cancellationPolicy", "cancellationNoticeDays", "availableYearRound", "availableNow", "maxBookingDays", "advanceBookingDays"].includes(key)));
        };
        expect(terms({ cancellation_notice: "flexible" })).toStrictEqual({ cancellationPolicy: "FLEXIBLE" });
        expect(terms({ cancellation_notice: "7" })).toStrictEqual({ cancellationPolicy: "NOTICE", cancellationNoticeDays: 7 });
        expect(terms({ cancellation_notice: "30" })).toStrictEqual({ cancellationPolicy: "NOTICE", cancellationNoticeDays: 30 });
        expect(terms({ cancellation_notice: "none" })).toStrictEqual({ cancellationPolicy: "NONE" });
        expect(terms({ available_year_round: "no", max_booking_days: "365", advance_booking_days: "30" })).toStrictEqual({ availableYearRound: false, maxBookingDays: 365, advanceBookingDays: 30 });
        /* Unanswered is no key at all — not false, not zero. */
        expect(terms({ cancellation_notice: "", available_year_round: undefined, max_booking_days: "" })).toStrictEqual({});
    });

    it("sends only the answered audience keys, no audienceDemographics when none is answered, and no installation key without the tick", () => {
        const body = flowListingBody({ age_band: "18–24", occupation: "Students", gender_split: " ", installation_by_adx: false }, { publisherId: "pub_1", mediaType: null });
        expect(body.audienceDemographics).toStrictEqual({ ageBand: "18–24", occupation: "Students" });
        expect(body).not.toHaveProperty("installationByAdx");
        const none = flowListingBody({ gender_split: "", title: "X" }, { publisherId: "pub_1", mediaType: null });
        expect(none).not.toHaveProperty("audienceDemographics");
        expect(none).not.toHaveProperty("photos");
    });

    it("posts what the branch in play asked: a media outlet's slot, never an installation tick left from an indoor walk", () => {
        const answers = { ...lf2Answers, category: "media" };
        const body = flowListingBody(answersInPlay(answers, screensInPlay(LISTING_FLOW_FIXTURE, answers)), { publisherId: "pub_1", mediaType: null });
        expect(body).toMatchObject({ category: "MEDIA", broadcastLanguage: "Hindi · English", contentFormat: "News and current affairs", size: "30 seconds", cancellationPolicy: "NOTICE" });
        expect(body).not.toHaveProperty("installationByAdx");
        expect(body).not.toHaveProperty("vehicleNumber");
        expect(body).not.toHaveProperty("vehicleModel");
        expect(body).not.toHaveProperty("illumination");
    });
});

/**
 * LD-1 (3 Oct 2026): the questions every listing form now asks, as their
 * columns with the select answers as codes — and no answer dropped: an
 * answered question that maps to no column rides along as `extraAnswers`.
 */
describe("flowListingBody — LD-1, the new questions and the answers with no column", () => {
    const ld1 = (answers: Record<string, unknown>) => {
        const body = flowListingBody(answers, { publisherId: "pub_1", mediaType: null });
        const keys = ["estimatedDailyFootfall", "trafficGrade", "visibility", "elevation", "widthPx", "heightPx", "vehicleType", "availableNow", "coverage", "operatingHoursFrom", "operatingHoursTo"];
        return Object.fromEntries(Object.entries(body).filter(([key]) => keys.includes(key)));
    };

    it("maps each question onto its column, the selects as the codes chosen", () => {
        expect(
            ld1({
                estimated_daily_footfall: "45,000",
                traffic_grade: "VERY_HIGH",
                visibility: "50_150M",
                elevation: "ROOFTOP",
                width_px: "1920",
                height_px: "1080",
                vehicle_type: "CAB",
                available_now: false,
                coverage: " Route 500D ",
                operating_hours: { from: "6 AM", to: " 11 PM" },
            }),
        ).toStrictEqual({
            estimatedDailyFootfall: 45000,
            trafficGrade: "VERY_HIGH",
            visibility: "50_150M",
            elevation: "ROOFTOP",
            widthPx: 1920,
            heightPx: 1080,
            vehicleType: "CAB",
            availableNow: false,
            coverage: "Route 500D",
            operatingHoursFrom: "6 AM",
            operatingHoursTo: "11 PM",
        });
    });

    it("sends nothing for an unanswered or unreadable number, a zero-pixel screen, or a switch never touched", () => {
        expect(ld1({ estimated_daily_footfall: "lots", width_px: "0", height_px: "", available_now: undefined })).toStrictEqual({});
        expect(ld1({ estimated_daily_footfall: "0" })).toStrictEqual({ estimatedDailyFootfall: 0 });
    });

    it("keeps an answered question that has no column as an extra answer, with its label as worded", () => {
        const screens = [
            {
                key: "spot-details",
                title: "Spot details",
                step: 1,
                totalSteps: 1,
                ctaLabel: "Next",
                fields: [
                    { id: "title", type: "text", label: "Ad spot name" },
                    { id: "sec_extra", type: "section", label: "More" },
                    { id: "parking", type: "switch", label: "Is there parking nearby?" },
                    { id: "nearest_landmark", type: "text", label: "Nearest landmark" },
                    { id: "unanswered", type: "text", label: "Left blank" },
                ],
            },
        ];
        const answers = { title: "Atrium wall", parking: true, nearest_landmark: " Opposite the metro ", unanswered: "  " };
        expect(flowExtraAnswers(answers, screens)).toStrictEqual([
            { key: "parking", label: "Is there parking nearby?", value: true },
            { key: "nearest_landmark", label: "Nearest landmark", value: "Opposite the metro" },
        ]);
        expect(flowListingBody(answers, { publisherId: "pub_1", mediaType: null, screens }).extraAnswers).toStrictEqual(flowExtraAnswers(answers, screens));
        /* Without the screens there are no labels to name them by, and nothing is sent. */
        expect(flowListingBody(answers, { publisherId: "pub_1", mediaType: null })).not.toHaveProperty("extraAnswers");
    });

    it("counts every question of the shipped flow as mapped, so none of them is sent twice", () => {
        const ids = [...LISTING_FLOW_FIXTURE.screens, ...Object.values(LISTING_FLOW_FIXTURE.branches).flatMap((branch) => branch.screens)]
            .flatMap((screen) => screen.fields)
            .filter((field) => !["section", "computed", "document-upload", "content-stance", "content-prohibited"].includes(field.type))
            .map((field) => field.id);
        expect(ids.filter((id) => !MAPPED_FIELD_IDS.has(id))).toEqual([]);
    });
});
