import type { FlowScreen, OnboardingTemplate, WizardFlow } from "@/types";
import type { FlowVocabularies } from "./vocabulary";

/**
 * FL-2/FL-3 (27 Sep 2026): the listing wizard as the backend's config seed
 * writes it (`ADX-backendv1/src/scripts/data/listing-flow.ts`), trimmed to
 * what the tests read — every field id, kind and branch, so the renderer
 * and the desk form are tested against the ids the apps and the API agree
 * on rather than ones a test made up. Test-only; nothing under `src/data`.
 *
 * LF-2 (28 Sep 2026): the flow as it now stands — ten numbered steps (the
 * audience evidence after "More info", the booking terms before the price,
 * the rate card after it), installation / the vehicle model / a broadcast
 * outlet on the spot details, and the review's four photo angles. Option
 * ids are the words stored in the columns, except the day counts, whose
 * ids are the number.
 */

const opts = (words: readonly string[]) => words.map((word) => ({ id: word, title: word }));

const VEHICLE_TYPES = ["City bus", "Auto-rickshaw", "E-rickshaw", "Taxi / cab", "Delivery van", "Truck", "Private car", "Two-wheeler", "School bus", "Office shuttle", "Other"];
const LANGUAGES = ["Hindi", "English", "Hindi · English", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Other"];
const CONTENT_FORMATS = ["Music and entertainment", "News and current affairs", "Talk and interviews", "Sports", "Regional programming", "Business", "Lifestyle", "Other"];
const SLOT_DURATIONS = ["10 seconds", "15 seconds", "20 seconds", "30 seconds", "60 seconds", "Quarter page", "Half page", "Full page", "Other"];

const AGE_BANDS = ["18–24", "25–34", "35–44", "45–54", "55+", "Mixed"];
const GENDER_SPLITS = ["Mostly men", "Mostly women", "Balanced"];
const URBAN_RURAL = ["Urban", "Semi-urban", "Rural", "Mixed"];
const SEC_PROFILES = ["SEC A", "SEC A / B", "SEC B", "SEC B / C", "SEC C", "Mixed"];
const INCOME_BRACKETS = ["Under ₹3 lakh a year", "₹3 – 6 lakh", "₹6 – 12 lakh", "₹12 – 25 lakh", "Over ₹25 lakh", "Mixed"];
const OCCUPATIONS = ["Office workers", "Students", "Shoppers", "Commuters", "Business owners", "Families", "Tourists", "Mixed"];

const YEAR_ROUND = [
    { id: "yes", title: "Yes, all year" },
    { id: "no", title: "No — only in some seasons" },
];
const MAX_BOOKING = [
    { id: "7", title: "7 days" },
    { id: "14", title: "14 days" },
    { id: "30", title: "30 days" },
    { id: "90", title: "90 days" },
    { id: "180", title: "180 days" },
    { id: "365", title: "1 year" },
];
const ADVANCE_BOOKING = [
    { id: "0", title: "No notice needed" },
    { id: "3", title: "3 days ahead" },
    { id: "7", title: "7 days ahead" },
    { id: "14", title: "14 days ahead" },
    { id: "30", title: "30 days ahead" },
];
const CANCELLATION_NOTICE = [
    { id: "flexible", title: "Flexible · free up to 48 hours before" },
    { id: "7", title: "7 days' notice" },
    { id: "14", title: "14 days' notice" },
    { id: "30", title: "30 days' notice" },
    { id: "none", title: "No cancellation once confirmed" },
];
const SEASONAL_VARIATIONS = opts([
    "No seasonal change",
    "Higher in the festive season (Oct – Dec)",
    "Higher in the wedding season",
    "Lower in summer",
    "Lower in the monsoon",
    "Premium in event weeks",
    "Other — noted on the card",
]);

/** The numbered steps; the documents (11) and the review (12) sit past it. */
const TOTAL = 10;

function branchScreens(id: string): FlowScreen[] {
    const media = id === "media";
    return [
        {
            key: "venue",
            title: "Venue selection",
            subtitle: "Where the spot lives. This decides which spots yours is priced against.",
            step: 2,
            totalSteps: TOTAL,
            ctaLabel: "Continue",
            fields: [{ type: "venue-type", id: "venue_type_id", label: media ? "Medium" : "Venue", required: id !== "outdoor", filterByCategory: true }],
        },
        {
            key: "spot-type",
            title: "Ad spot type",
            subtitle: "What kind of spot it is. Only the formats this venue actually has.",
            step: 3,
            totalSteps: TOTAL,
            ctaLabel: "Continue",
            fields: [
                { type: "media-type", id: "media_type_id", label: "Ad spot type", required: true, dependsOn: "venue_type_id", groupBy: "formatGroup" },
                { type: "material", id: "material_id", label: "Material", required: false, dependsOn: "media_type_id" },
            ],
        },
        {
            key: "spot-details",
            title: "Spot details",
            subtitle: "Add core info for the selected ad spot.",
            step: 4,
            totalSteps: TOTAL,
            ctaLabel: "Save spot details",
            fields: [
                { type: "section", id: "sec_spot", label: "Ad spot", from: ["media_type_id"] },
                { type: "text", id: "title", label: "Ad spot name", placeholder: "Gym mirror decal - reception wall", required: true },
                { type: "sub-venue", id: "placement", label: media ? "Channel or publication" : "Placement area", required: media, dependsOn: "venue_type_id" },
                { type: "text", id: "address", label: media ? "Channel, station or publication" : "Full address", placeholder: media ? "e.g. Radio Mirchi 98.3 FM, Mumbai" : "Street, area, landmark", required: true },
                { type: "city", id: "city", label: "City", placeholder: "Bengaluru", required: !media },
                ...(id === "transit"
                    ? [
                          { type: "section", id: "sec_vehicle", label: "Vehicle" },
                          { type: "text", id: "vehicle_number", label: "Vehicle registration number", placeholder: "KA 01 AB 1234", hint: "If this spot is a vehicle. Leave it blank for a station, a platform or a shelter.", required: false },
                          { type: "select", id: "vehicle_model", label: "Vehicle type / model", required: false, options: opts(VEHICLE_TYPES) },
                      ]
                    : []),
                ...(media
                    ? [
                          { type: "section", id: "sec_outlet", label: "Outlet" },
                          { type: "select", id: "broadcast_language", label: "Broadcast language", required: false, options: opts(LANGUAGES) },
                          { type: "select", id: "content_format", label: "Content format", required: false, options: opts(CONTENT_FORMATS) },
                          { type: "select", id: "slot_duration", label: "Slot duration", required: false, options: opts(SLOT_DURATIONS) },
                      ]
                    : []),
                { type: "section", id: "sec_location", label: "Location Pin" },
                { type: "geo-point", id: "location", label: "Location pin", hint: "Drag pin to verify exact location", required: !media },
                { type: "section", id: "sec_dimensions", label: "Dimensions & Visibility" },
                { type: "number", id: "width_ft", label: "Width (ft)", required: !media },
                { type: "number", id: "height_ft", label: "Height (ft)", required: !media },
                { type: "computed", id: "area_sq_ft", label: "Total area (sq ft)", from: ["width_ft", "height_ft"], op: "multiply", readOnly: true },
                ...(media
                    ? []
                    : [
                          { type: "select", id: "illumination", label: "Illumination", required: false, options: [{ id: "Non-lit", title: "Non-lit" }, { id: "Front-lit", title: "Front-lit" }, { id: "Back-lit", title: "Back-lit" }, { id: "Digital", title: "Digital" }] },
                          { type: "select", id: "facing", label: "Facing", required: false, options: [{ id: "Single", title: "Single" }, { id: "Double", title: "Double" }, { id: "Junction", title: "Junction" }, { id: "Multi-facing", title: "Multi-facing" }] },
                      ]),
                ...(id === "indoor" || id === "outdoor"
                    ? [{ type: "checkbox", id: "installation_by_adx", label: "Installation by ADX", description: "ADX installs the creative on this spot. Special pricing applies.", required: false }]
                    : []),
            ],
        },
        {
            key: "more-info",
            title: "More info",
            subtitle: "Add the selling story for this ad spot.",
            step: 5,
            totalSteps: TOTAL,
            ctaLabel: "Save listing details",
            fields: [
                { type: "textarea", id: "description", label: "Advertising space description", placeholder: "High-visibility mirror decal placement.", aiAssist: true },
                { type: "text", id: "target_audience", label: "Target audience", placeholder: "Walk-in fitness and wellness customers" },
                { type: "text", id: "unique_selling_point", label: "Unique selling point", placeholder: "Eye-level visibility near reception" },
                { type: "text", id: "footfall_note", label: "Past success or footfall", placeholder: "Average footfall: 350+ daily visitors" },
            ],
        },
        {
            key: "audience",
            title: "Audience evidence",
            subtitle: "Who sees this space, if you know. All optional.",
            step: 6,
            totalSteps: TOTAL,
            ctaLabel: "Save audience evidence",
            fields: [
                { type: "section", id: "sec_audience", label: "Audience profile" },
                { type: "select", id: "age_band", label: "Primary age band", required: false, options: opts(AGE_BANDS) },
                { type: "select", id: "gender_split", label: "Gender split", required: false, options: opts(GENDER_SPLITS) },
                { type: "select", id: "urban_rural", label: "Urban / rural mix", required: false, options: opts(URBAN_RURAL) },
                { type: "select", id: "sec_profile", label: "SEC profile", required: false, options: opts(SEC_PROFILES) },
                { type: "section", id: "sec_income", label: "Income & occupation" },
                { type: "select", id: "income_bracket", label: "Income bracket", required: false, options: opts(INCOME_BRACKETS) },
                { type: "select", id: "occupation", label: "Top occupation", required: false, options: opts(OCCUPATIONS) },
                { type: "section", id: "sec_reports", label: "Supporting reports" },
                { type: "file-upload", id: "barc_report", label: "BARC / TAM rating sheet", hint: "PDF or image · the latest quarter", required: false },
                { type: "file-upload", id: "footfall_report", label: "Footfall audit report", hint: "PDF or image", required: false },
            ],
        },
        {
            key: "content-rules",
            title: "Content rules",
            subtitle: "Set the brand safety limits for this inventory.",
            step: 7,
            totalSteps: TOTAL,
            ctaLabel: "Save content rules",
            fields: [
                { type: "content-stance", id: "restricted_categories", label: "Restricted categories", hint: "These require owner approval before publishing.", scope: "RESTRICTED" },
                { type: "content-prohibited", id: "prohibited_content", label: "Prohibited content", hint: "These are never allowed on this venue.", scope: "PROHIBITED" },
            ],
        },
        {
            key: "terms",
            title: "Availability & booking terms",
            subtitle: "When the space can be booked, and on what terms.",
            step: 8,
            totalSteps: TOTAL,
            ctaLabel: "Save booking terms",
            fields: [
                { type: "select", id: "available_year_round", label: "Available year-round?", required: false, options: YEAR_ROUND },
                { type: "select", id: "max_booking_days", label: "Maximum booking period", required: false, options: MAX_BOOKING },
                { type: "select", id: "advance_booking_days", label: "Advance booking required", required: false, options: ADVANCE_BOOKING },
                { type: "select", id: "cancellation_notice", label: "Cancellation notice", required: false, options: CANCELLATION_NOTICE },
            ],
        },
        {
            key: "pricing",
            title: "Pricing & availability",
            subtitle: "You set this. ADX only tells you how it compares to spots nearby.",
            step: 9,
            totalSteps: TOTAL,
            ctaLabel: "Save price & availability",
            fields: [
                {
                    type: "select",
                    id: "pricing_unit",
                    label: "Rate basis",
                    required: true,
                    options: [
                        { id: "PER_DAY", title: "Per day" },
                        { id: "PER_WEEK", title: "Per week" },
                        { id: "PER_MONTH", title: "Per month" },
                        { id: "PER_SQFT_PER_DAY", title: "Per sq.ft / day" },
                        { id: "PER_SQFT_PER_MONTH", title: "Per sq.ft / month" },
                    ],
                },
                { type: "base-price", id: "base_price", label: "Base price (Rs)", required: true, showIndicator: true },
                { type: "number", id: "min_booking_days", label: "Min. booking (days)" },
                { type: "date", id: "available_from", label: "Available from" },
                { type: "time-range", id: "available_hours", label: "Visibility hours", placeholder: "10 AM - 10 PM" },
                { type: "text", id: "peak_period_note", label: "Peak period note", placeholder: "Evenings and weekends" },
            ],
        },
        {
            key: "rate-card",
            title: "Rate card",
            subtitle: "Your published rates, if you have them. All optional.",
            step: 10,
            totalSteps: TOTAL,
            ctaLabel: "Save rate card",
            fields: [
                { type: "file-upload", id: "rate_card", label: "Upload rate card", hint: "PDF or image, optional" },
                { type: "date", id: "rate_card_valid_from", label: "Validity start", required: false },
                { type: "date", id: "rate_card_valid_to", label: "Validity end", required: false },
                { type: "select", id: "rate_card_seasonal", label: "Seasonal variation", required: false, options: SEASONAL_VARIATIONS },
            ],
        },
        {
            key: "documents",
            title: "Documents & permits",
            subtitle: "Upload venue proof for this spot.",
            step: 11,
            totalSteps: TOTAL,
            badge: "Verification",
            ctaLabel: "Save proofs",
            fields: [
                {
                    type: "select",
                    id: "rights_basis",
                    label: "How do you hold this space?",
                    required: true,
                    options: [
                        { id: "OWNED", title: "I own it" },
                        { id: "LEASED", title: "On a lease" },
                        { id: "LICENSED", title: "On a licence" },
                        { id: "PERMIT", title: "On a permit" },
                    ],
                },
                { type: "date", id: "rights_valid_until", label: "Right runs out on", hint: "The end date on the lease, licence or permit." },
                {
                    type: "document-upload",
                    id: "documents",
                    label: "Venue proof",
                    hint: "ADX checks these at a desk before an agent is sent out.",
                    options: media
                        ? [
                              { id: "DISPLAY_AGREEMENT", title: "Display agreement", description: "The signed agreement covering this spot" },
                              { id: "OTHER", title: "Anything else" },
                          ]
                        : [
                              { id: "OWNER_NOC", title: "Owner NOC", description: "The venue owner's permission to display" },
                              { id: "ADDRESS_PROOF", title: "Address proof", description: "A recent utility bill or rent receipt for the venue" },
                              { id: "DISPLAY_AGREEMENT", title: "Display agreement", description: "The signed agreement covering this spot" },
                              ...(id === "outdoor" || id === "transit" ? [{ id: "MUNICIPAL_PERMIT", title: "Municipal permit", description: "The civic or highway authority permit for this site" }] : []),
                          ],
                },
            ],
        },
        {
            key: "review",
            title: "Review & submit",
            subtitle: "Check everything before it goes for approval.",
            step: 12,
            totalSteps: TOTAL,
            ctaLabel: "Submit listing",
            fields: [
                { type: "image-upload", id: "main_photo", label: "Main photo (front)", required: true },
                { type: "image-upload", id: "left_photo", label: "Left angle" },
                { type: "image-upload", id: "right_photo", label: "Right angle" },
                { type: "image-upload", id: "wide_photo", label: "Wide angle shot" },
                { type: "checkbox", id: "terms", label: "Terms agreement", description: "I confirm that all information provided is accurate and I agree to ADX listing guidelines.", required: true },
            ],
        },
    ];
}

export const LISTING_FLOW_FIXTURE: WizardFlow = {
    label: "Listing",
    version: 4,
    screens: [
        {
            key: "select-category",
            title: "Ad space category",
            subtitle: "Choose the ad space category for this listing.",
            step: 1,
            totalSteps: TOTAL,
            ctaLabel: "Continue",
            fields: [
                {
                    id: "category",
                    type: "selectable-cards",
                    label: "Category",
                    required: true,
                    branching: true,
                    options: [
                        { id: "indoor", title: "Indoor", description: "Malls, gyms, clinics, offices, cinemas" },
                        { id: "outdoor", title: "Outdoor", description: "Hoardings, gantries, roadside sites" },
                        { id: "transit", title: "Transit", description: "Metro, rail, bus, taxi, airport" },
                        { id: "media", title: "Media", description: "Television, radio and print" },
                    ],
                },
            ],
        },
    ],
    branches: {
        indoor: { id: "indoor", title: "Indoor", description: "Malls, gyms, clinics, offices, cinemas", screens: branchScreens("indoor") },
        outdoor: { id: "outdoor", title: "Outdoor", description: "Hoardings, gantries, roadside sites", screens: branchScreens("outdoor") },
        transit: { id: "transit", title: "Transit", description: "Metro, rail, bus, taxi, airport", screens: branchScreens("transit") },
        media: { id: "media", title: "Media", description: "Television, radio and print", screens: branchScreens("media") },
    },
};

const stamp = { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

export const VOCAB_FIXTURE: FlowVocabularies = {
    venues: [
        { id: "vt_mall", name: "Shopping mall", slug: "shopping-mall", category: "INDOOR", description: null, subVenues: ["Atrium", "Food court"], isActive: true, ...stamp },
        { id: "vt_gym", name: "Gym", slug: "gym", category: "INDOOR", description: null, subVenues: [], isActive: true, ...stamp },
        { id: "vt_metro", name: "Metro station", slug: "metro-station", category: "TRANSIT", description: null, subVenues: ["Platform", "Concourse"], isActive: true, ...stamp },
    ],
    mediaTypes: [
        { id: "mt_billboard", name: "Billboard", slug: "billboard", category: "OUTDOOR", description: null, status: "ACTIVE", origin: "SEEDED", venueTypeId: null, formatGroup: "Outdoor", mergedIntoId: null, mergedAt: null, ...stamp, sizeClassIds: [], materialIds: [] },
        { id: "mt_atrium", name: "Shopping mall — Atrium LED wall", slug: "atrium-led-wall", category: "INDOOR", description: "The big screen", status: "ACTIVE", origin: "SEEDED", venueTypeId: "vt_mall", formatGroup: "Digital Displays", mergedIntoId: null, mergedAt: null, ...stamp, sizeClassIds: ["sc_10x6"], materialIds: ["mat_led"] },
        { id: "mt_standee", name: "Shopping mall — Standee", slug: "standee", category: "INDOOR", description: null, status: "ACTIVE", origin: "SEEDED", venueTypeId: "vt_mall", formatGroup: "Floor", mergedIntoId: null, mergedAt: null, ...stamp, sizeClassIds: [], materialIds: [] },
    ],
    sizeClasses: [
        { id: "sc_40x20", name: "40 × 20", slug: "40x20", widthFt: "40", heightFt: "20", areaSqFt: "800", isActive: true },
        { id: "sc_10x6", name: "10 × 6", slug: "10x6", widthFt: "10", heightFt: "6", areaSqFt: "60", isActive: true },
    ],
    materials: [
        { id: "mat_vinyl", name: "Vinyl", slug: "vinyl", isActive: true },
        { id: "mat_led", name: "LED", slug: "led", isActive: true },
    ],
    contentCategories: [
        { id: "cc_alcohol", name: "Alcohol", slug: "alcohol", isSensitive: false, isActive: true },
        { id: "cc_gaming", name: "Real-money gaming", slug: "gaming", isSensitive: false, isActive: true },
        { id: "cc_tobacco", name: "Tobacco", slug: "tobacco", isSensitive: true, isActive: true },
    ],
};

/** A stored onboarding template: the code ladder with the details step retitled, one capture step, and the business ladder reordered so the contact comes before the business. */
export const ONBOARDING_TEMPLATE_FIXTURE: OnboardingTemplate = {
    label: "Onboarding",
    version: 4,
    steps: {
        "account-type": { key: "account-type", kind: "account-type", title: "What kind of account" },
        "publisher-details": { key: "details", kind: "form", title: "Your details", subtitle: "The person behind the account" },
        "advertiser-details": { key: "details", kind: "form", title: "Advertiser details", subtitle: "Who you are and how to reach you" },
        business: { key: "business", kind: "form", title: "The business", subtitle: "Registered name, GSTIN and where it is" },
        organisation: { key: "business", kind: "form", title: "The organisation", subtitle: "Registered name, GSTIN and where it is" },
        contact: { key: "contact", kind: "form", title: "Who to reach", subtitle: "Who ADX should reach about this account" },
        "kyc-intro": {
            key: "kyc-intro",
            kind: "kyc-intro",
            title: "Verify your identity",
            subtitle: "Five quick uploads.",
            bands: [
                { label: "Identity", value: "Passport · DL" },
                { label: "Tax", value: "PAN card" },
            ],
            cta: "Start verification",
        },
        "gov-id-front": {
            key: "gov-id-front",
            kind: "capture",
            title: "Government ID · Front",
            subtitle: "Clear photo, no glare.",
            documents: [
                { key: "passport", label: "Passport", hint: "Bio-page. Non-expired.", field: "govIdFrontUrl", source: "library", sets: { field: "govIdType", value: "PASSPORT" } },
                { key: "passport-back", label: "Passport back", hint: "Not applicable — back not required", field: "govIdBackUrl", source: "library", inert: true, onlyWhen: { field: "govIdType", value: "PASSPORT" } },
            ],
            skippableWhen: { field: "govIdType", value: "PASSPORT" },
            cta: "Use this photo",
        },
        pan: {
            key: "pan",
            kind: "capture",
            title: "PAN card",
            subtitle: "All four corners visible.",
            text: { field: "panNumber", label: "PAN number", hint: "10-character alphanumeric", pattern: "^[A-Z]{5}[0-9]{4}[A-Z]$", maxLength: 10 },
            documents: [{ key: "pan-photo", label: "Photograph", hint: "Clear and non-obscured", field: "panFrontUrl", source: "library" }],
            cta: "Use this photo",
        },
        "address-proof": {
            key: "address-proof",
            kind: "capture",
            title: "Address proof",
            subtitle: "Issued in the last three months.",
            documents: [{ key: "utility-bill", label: "Utility bill", hint: "In your name", field: "addressProofUrl", source: "library", pdf: true, sets: { field: "addressProofType", value: "UTILITY_BILL" } }],
            cta: "Upload document",
        },
        selfie: {
            key: "selfie",
            kind: "capture",
            title: "Selfie verification",
            subtitle: "So we can match your ID to you.",
            guidance: [{ label: "Position", hint: "Face centered, both eyes clearly visible" }],
            documents: [{ key: "selfie", label: "Your selfie", hint: "Taken now, with the front camera", field: "selfieUrl", source: "camera", front: true }],
            cta: "Take selfie",
        },
        liveness: {
            key: "liveness",
            kind: "capture",
            title: "Record a short video",
            subtitle: "Five seconds.",
            documents: [{ key: "liveness-video", label: "Your video", hint: "Recorded now", field: "selfVideoUrl", source: "camera", front: true, video: true }],
            cta: "Record video",
        },
        checklist: { key: "checklist", kind: "checklist", title: "Review your KYC", subtitle: "Check everything before submitting.", cta: "Submit for review" },
    },
    ladders: {
        PUBLISHER: {
            INDIVIDUAL: ["account-type", "publisher-details", "kyc-intro", "gov-id-front", "pan", "address-proof", "selfie", "liveness", "checklist"],
            BUSINESS: ["account-type", "publisher-details", "contact", "business", "kyc-intro", "gov-id-front", "pan", "address-proof", "selfie", "liveness", "checklist"],
            ORGANISATION: ["account-type", "publisher-details", "organisation", "contact", "kyc-intro", "gov-id-front", "pan", "address-proof", "selfie", "liveness", "checklist"],
        },
        ADVERTISER: {
            INDIVIDUAL: ["account-type", "advertiser-details", "kyc-intro", "gov-id-front", "pan", "address-proof", "selfie", "liveness", "checklist"],
            BUSINESS: ["account-type", "advertiser-details", "business", "contact", "kyc-intro", "gov-id-front", "pan", "address-proof", "selfie", "liveness", "checklist"],
            ORGANISATION: ["account-type", "advertiser-details", "organisation", "contact", "kyc-intro", "gov-id-front", "pan", "address-proof", "selfie", "liveness", "checklist"],
        },
    },
};
