import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDate } from "@/lib/format";
import type { StatusMeta } from "@/types";
import type { CampaignDetail } from "./campaigns";

/**
 * The console's New campaign wizard — DR 10 `5102:27803`, over the live
 * booking routes ops and agents share with the advertiser app.
 *
 * The frame draws four steps: Select sites, Flight and budget, Creatives,
 * Review. The API wants the flight before the cart — `PUT /campaigns/:id/spots`
 * refuses without dates, because a spot's line total is its rate times the
 * days — and a draft before anything, so the machine here puts an Advertiser
 * step in front and writes the flight and the cart together when the second
 * step is left. What the person sees is the frame's order; what the server
 * gets is the order it insists on.
 *
 * Pure where it can be: the step order, what blocks each step and the bodies
 * each write sends are functions of the state, and the test pins them.
 */

export type WizardStep = "ADVERTISER" | "SITES" | "FLIGHT" | "CREATIVES" | "REVIEW";

export const WIZARD_STEPS: readonly WizardStep[] = ["ADVERTISER", "SITES", "FLIGHT", "CREATIVES", "REVIEW"];

/** The frame's labels, with the one step it did not draw in front. */
export const WIZARD_STEP_LABEL: Record<WizardStep, string> = {
    ADVERTISER: "Advertiser",
    SITES: "Select sites",
    FLIGHT: "Flight and budget",
    CREATIVES: "Creatives",
    REVIEW: "Review",
};

export interface WizardState {
    step: WizardStep;
    advertiserId: string | null;
    /** The draft, once `POST /campaigns` has answered. */
    campaignId: string | null;
    name: string;
    /** The listings picked on the Sites step, in the order picked. */
    selected: string[];
    /** ISO dates, YYYY-MM-DD. */
    startDate: string;
    endDate: string;
    /** Rupees, a decimal string, or blank for no cap. */
    budget: string;
    contentCategoryId: string | null;
    creativePath: CreativePathChoice;
    /** How many artworks have been uploaded on the draft. */
    uploaded: number;
}

export type CreativePathChoice = "STATIC_IMAGES" | "VIDEO_OR_MOTION" | "ADX_DESIGN_AGENCY";

export const CREATIVE_PATH_CHOICES: { value: CreativePathChoice; label: string; detail: string }[] = [
    { value: "STATIC_IMAGES", label: "Static images", detail: "Print-ready artwork per spot, uploaded here or by the advertiser." },
    { value: "VIDEO_OR_MOTION", label: "Video or motion", detail: "For digital screens; one file per spot." },
    { value: "ADX_DESIGN_AGENCY", label: "ADX designs it", detail: "Ops upload the design; the advertiser accepts before review." },
];

export const initialWizardState = (): WizardState => ({
    step: "ADVERTISER",
    advertiserId: null,
    campaignId: null,
    name: "",
    selected: [],
    startDate: "",
    endDate: "",
    budget: "",
    contentCategoryId: null,
    creativePath: "STATIC_IMAGES",
    uploaded: 0,
});

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** How many days the flight runs, inclusive of both ends; null while it is not a flight. */
export function flightDays(startDate: string, endDate: string): number | null {
    if (!DAY.test(startDate) || !DAY.test(endDate)) return null;
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * What stops the person leaving a step, in words — or null when they may.
 * The wizard refuses before the API would, with the same reasons.
 */
export function stepBlocker(state: WizardState): string | null {
    switch (state.step) {
        case "ADVERTISER":
            if (!state.advertiserId) return "Choose the advertiser the campaign is for.";
            if (state.name.trim().length === 0) return "Give the campaign a name.";
            return null;
        case "SITES":
            return state.selected.length === 0 ? "Pick at least one site." : null;
        case "FLIGHT": {
            const days = flightDays(state.startDate, state.endDate);
            if (days === null) return "Set the flight: a start date and an end date on or after it.";
            if (state.budget.trim() && !MONEY.test(state.budget.trim())) return "The budget is rupees, up to two decimal places.";
            if (!state.contentCategoryId) return "Say what the creative advertises — the venue check needs it.";
            return null;
        }
        case "CREATIVES":
            // Artwork may follow later — the advertiser uploads too, and the
            // review lists it as outstanding — so nothing blocks here.
            return null;
        case "REVIEW":
            return null;
    }
}

export function nextStep(step: WizardStep): WizardStep | null {
    const index = WIZARD_STEPS.indexOf(step);
    return WIZARD_STEPS[index + 1] ?? null;
}

export function previousStep(step: WizardStep): WizardStep | null {
    const index = WIZARD_STEPS.indexOf(step);
    return index > 0 ? WIZARD_STEPS[index - 1] : null;
}

/** The `PATCH /campaigns/:id` body the Flight step writes — dates, budget, the category, the creative path. */
export function flightPatch(state: WizardState): {
    startDate: string;
    endDate: string;
    budget?: string;
    contentCategoryId: string;
    creative: { creativePath: CreativePathChoice };
    step: number;
} {
    return {
        startDate: state.startDate,
        endDate: state.endDate,
        ...(state.budget.trim() ? { budget: state.budget.trim() } : {}),
        contentCategoryId: state.contentCategoryId ?? "",
        creative: { creativePath: state.creativePath },
        // The wizard's own numbering: the flight is step 9 of the app's seventeen.
        step: 9,
    };
}

/** The `PUT /campaigns/:id/spots` body — every picked listing, one of each. */
export function cartBody(state: WizardState): { items: { listingId: string; quantity: number }[] } {
    return { items: state.selected.map((listingId) => ({ listingId, quantity: 1 })) };
}

/** The frame's "Estimated cost": rate per day × days, over the picked spots. A decimal string, never a float on screen. */
export function estimatedCost(rates: (string | null)[], days: number | null): string | null {
    if (days === null) return null;
    let paise = BigInt(0);
    for (const rate of rates) {
        if (!rate || !MONEY.test(rate)) continue;
        const [whole, fraction = ""] = rate.split(".");
        paise += (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))) * BigInt(days);
    }
    const text = paise.toString().padStart(3, "0");
    return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

/**
 * The frame's "Avg weekly rate": seven times the mean rate per day of the
 * picked spots, as a decimal string. Null with nothing picked or nothing
 * priced. Counted in paise, divided once, rounded to the paisa — a mean is
 * the one figure here that cannot be exact, and it is printed only.
 */
export function averageWeeklyRate(rates: (string | null)[]): string | null {
    const priced = rates.filter((rate): rate is string => Boolean(rate && MONEY.test(rate)));
    if (priced.length === 0) return null;
    let paise = BigInt(0);
    for (const rate of priced) {
        const [whole, fraction = ""] = rate.split(".");
        paise += BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
    }
    const weekly = paise * BigInt(7);
    const count = BigInt(priced.length);
    // Round half up at the paisa.
    const mean = (weekly + count / BigInt(2)) / count;
    const text = mean.toString().padStart(3, "0");
    return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

/* ------------------------------------------------------------------ */
/* Inventory — `GET /listings/browse`                                  */
/* ------------------------------------------------------------------ */

export type BrowseCategory = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";
export type BrowseDisplay = "DIGITAL" | "STATIC";

export const BROWSE_CATEGORY_LABEL: Record<BrowseCategory, string> = {
    INDOOR: "Indoor",
    OUTDOOR: "Outdoor",
    TRANSIT: "Transit",
    MEDIA: "Media",
};

export interface BrowseQuery {
    q?: string;
    city?: string;
    category?: BrowseCategory;
    display?: BrowseDisplay;
    minRate?: string;
    maxRate?: string;
    /** ISO date-time the spot must be free from. */
    from?: string;
    instant?: boolean;
    sort?: "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "NAME" | "RATING";
    page?: number;
    pageSize?: number;
}

/** A card as `GET /listings/browse` sends it — only ACTIVE spots answer. */
export interface BrowseCard {
    id: string;
    displayId: string | null;
    title: string;
    category: string;
    subType: string | null;
    address: string;
    city: string | null;
    ratePerDay: string | null;
    size: string | null;
    photos: string[];
    publisherName: string | null;
    availableNow: boolean;
    availableFrom: string | null;
    ratingAvg: string | null;
    reviewCount: number;
    instantBooking: boolean;
    /** Lot G (Q116/136): how many advertisers the spot carries at once — 1 for a static wall, a screen's loop above it. Absent on a backend older than the column. */
    slotsTotal?: number;
    /** Lot G: `slotsTotal` less the slots held over the asked window (today, when the browse names no dates); never below zero. */
    slotsLeft?: number;
}

/**
 * The Availability chip on a browse card (`5102:27803`).
 *
 * A screen with a loop is never "booked" by one campaign: its chip says how
 * many of its slots are left over the window the browse asked about — the
 * wizard picks sites before its flight, so that is today — and "No slot
 * left" when the loop is full. A static wall reads as it always did:
 * available now, available from a date, or not available.
 */
export function availabilityFor(card: Pick<BrowseCard, "availableNow" | "availableFrom" | "slotsTotal" | "slotsLeft">): StatusMeta {
    const slotsTotal = card.slotsTotal ?? 1;
    if (slotsTotal > 1 && typeof card.slotsLeft === "number") {
        if (card.slotsLeft <= 0) return { label: "No slot left", tone: "neutral" };
        if (card.slotsLeft === 1) return { label: "1 slot left", tone: "warning" };
        return { label: `${card.slotsLeft} slots left`, tone: card.slotsLeft <= Math.ceil(slotsTotal / 4) ? "warning" : "success" };
    }
    if (card.availableNow) return { label: "Available", tone: "success" };
    if (card.availableFrom) return { label: `From ${formatDate(card.availableFrom)}`, tone: "info" };
    return { label: "Not available", tone: "neutral" };
}

export interface BrowsePage {
    items: BrowseCard[];
    total: number;
    page: number;
    pageSize: number;
}

/** The `?a=b` for the browse, skipping what is unset. */
export function browseQuery(query: BrowseQuery): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.city) params.set("city", query.city);
    if (query.category) params.set("category", query.category);
    if (query.display) params.set("display", query.display);
    if (query.minRate) params.set("minRate", query.minRate);
    if (query.maxRate) params.set("maxRate", query.maxRate);
    if (query.from) params.set("from", query.from);
    if (query.instant !== undefined) params.set("instant", String(query.instant));
    if (query.sort) params.set("sort", query.sort);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/**
 * The wizard writes real drafts and names a real advertiser, so it needs
 * both domains live: the draft goes to `/campaigns`, the picker searches
 * `/advertisers`. With either off it says so rather than pairing a fixture
 * id with a live route.
 */
export const wizardReadsApi = (): boolean => isLive("campaigns") && isLive("advertisers");

export const campaignWizardService = {
    /** The draft. An ADMIN names the advertiser; the campaign is theirs from the first write. */
    createDraft: (input: { advertiserId: string; name: string }) => http.post<CampaignDetail>("/campaigns", input),

    /** One screen's answers; every field optional, checked whole at review. */
    patch: (campaignId: string, body: ReturnType<typeof flightPatch> | Record<string, unknown>) =>
        http.patch<CampaignDetail>(`/campaigns/${campaignId}`, body),

    /** Replaces the cart. Rates are read off the listing server-side; the client's price never binds. */
    setSpots: (campaignId: string, body: ReturnType<typeof cartBody>) =>
        http.put<CampaignDetail>(`/campaigns/${campaignId}/spots`, body),

    /** The marketplace's own browse — ACTIVE spots only, with the drawer's facets. */
    browse: (query: BrowseQuery = {}) => http.get<BrowsePage>(`/listings/browse${browseQuery(query)}`),

    /** An advertiser's upload, on their campaign. An admin's ADX design goes through `moderationService.uploadDesigned`. */
    uploadCreative: (
        campaignId: string,
        input: { spotId?: string | null; fileUrl: string; fileName?: string; fileSize?: number; mimeType?: string; widthPx?: number; heightPx?: number },
    ) => http.post<unknown>(`/campaigns/${campaignId}/creatives`, input),
};
