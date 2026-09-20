import { api as http } from "@/lib/api-client";
import type { AudienceVendor, BlendedAudienceCatchment } from "@/services/audience";
import type { SuspensionColumns, SuspensionScope } from "@/types";

/**
 * Creating a listing against the real API.
 *
 * No fixture fallback: the previous form posted nowhere and reported success
 * with a toast, so every listing it appeared to create existed only on screen.
 * Failing loudly when the API is off is the honest replacement.
 *
 * `ratePerDay` is the canonical unit and the only price this sends. The backend
 * still keeps `monthlyPrice` for callers that predate the change and derives it
 * from this one; nothing new should be writing it.
 */

/* ------------------------------------------------------------------ */
/* The admin listings table — DR 10 `5102:37197`, live                  */
/* ------------------------------------------------------------------ */

/**
 * A listing exactly as `GET /listings` sends it.
 *
 * Ten statuses, not the console's old five. Folding them would have meant a
 * listing stuck AWAITING_DOCUMENTS reading as "Draft" on the one screen ops
 * use to chase it, so the console takes the API's vocabulary and labels it.
 */
export interface WireListing {
    id: string;
    displayId: string | null;
    title: string;
    category: string;
    subType: string | null;
    status: ListingLifecycle;
    address: string;
    city: string | null;
    widthFt: string | null;
    heightFt: string | null;
    ratePerDay: string | null;
    /** The spot's fix. Null on a listing nobody has placed on the map yet. */
    latitude?: number | null;
    longitude?: number | null;
    submittedAt: string | null;
    createdAt: string;
    publisher: { id: string; name: string | null; displayId?: string | null } | null;
    agent: { id: string; displayId: string | null } | null;
    photos: { id: string; url: string }[];
    /* Lot A. Optional on the wire for rows older than the columns. */
    suspensionScopes?: SuspensionScope[];
    suspensionReason?: string | null;
    suspendedAt?: string | null;
    /* Lot D (Q104/Q105). Optional on the wire for a backend older than the columns. */
    /** The published reviews' average, two places, or null while there are none. */
    ratingAvg?: string | null;
    reviewCount?: number;
    /** The publisher's opt-in: a booking here is accepted without their tap. */
    instantBooking?: boolean;
    /** Lot E: the rate sits under the floor of the rate card in force, whatever case stands on it. Absent where no card reaches. */
    belowFloor?: boolean;
    /** Lot G (Q116/136): how many advertisers the spot carries at once — 1 for a static wall, a screen's loop (1..24) above it. Absent on a row older than the column. */
    slotsTotal?: number;
}

export type ListingLifecycle =
    | "UNCLAIMED"
    | "DRAFT"
    | "AWAITING_AGREEMENT"
    | "AWAITING_DOCUMENTS"
    | "PENDING_REVIEW"
    | "AWAITING_SITE_VERIFICATION"
    | "ACTIVE"
    | "SUSPENDED"
    | "REJECTED"
    | "INACTIVE";

export const LISTING_LIFECYCLE: readonly ListingLifecycle[] = [
    "UNCLAIMED",
    "DRAFT",
    "AWAITING_AGREEMENT",
    "AWAITING_DOCUMENTS",
    "PENDING_REVIEW",
    "AWAITING_SITE_VERIFICATION",
    "ACTIVE",
    "SUSPENDED",
    "REJECTED",
    "INACTIVE",
];

const LABEL: Record<ListingLifecycle, string> = {
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
};

export const LISTING_STATUS_TONE: Record<ListingLifecycle, "success" | "warning" | "danger" | "neutral"> = {
    UNCLAIMED: "neutral",
    DRAFT: "neutral",
    AWAITING_AGREEMENT: "warning",
    AWAITING_DOCUMENTS: "warning",
    PENDING_REVIEW: "warning",
    AWAITING_SITE_VERIFICATION: "warning",
    ACTIVE: "success",
    SUSPENDED: "danger",
    REJECTED: "danger",
    INACTIVE: "neutral",
};

export const listingStatusLabel = (status: ListingLifecycle): string => LABEL[status] ?? status;

/** "40 × 20 ft", or nothing when nobody measured the spot. */
export function sizeLabel(listing: Pick<WireListing, "widthFt" | "heightFt">): string | null {
    if (!listing.widthFt || !listing.heightFt) return null;
    const trim = (value: string) => value.replace(/\.00$/, "");
    return `${trim(listing.widthFt)} × ${trim(listing.heightFt)} ft`;
}

/** One row of the table. Money stays a string; a missing field stays null.
 *  The suspension columns come with every row the API shapes. */
export interface AdminListing extends SuspensionColumns {
    id: string;
    displayId: string | null;
    title: string;
    category: string;
    subType: string | null;
    status: ListingLifecycle;
    city: string | null;
    address: string;
    size: string | null;
    ratePerDay: string | null;
    /** Both or neither: a spot with half a fix has no fix. */
    latitude: number | null;
    longitude: number | null;
    publisherName: string | null;
    publisherId: string | null;
    agentDisplayId: string | null;
    photoCount: number;
    submittedAt: string | null;
    createdAt: string;
    /** Lot D (Q104): the stars, or null while nobody has reviewed the spot. */
    ratingAvg: string | null;
    reviewCount: number;
    /** Lot D (Q105): null when the row predates the column, so the chip is not drawn as "off". */
    instantBooking: boolean | null;
    /** Lot E: under the card floor. Null when the row does not carry the column. */
    belowFloor: boolean | null;
    /** Lot G (Q116/136): the slot count, or null when the row does not carry the column. */
    slotsTotal: number | null;
}

/** The server's ceiling on a screen's loop. */
export const MAX_SLOTS = 24;

/** A usable fix is two finite numbers; anything less is no fix. */
const hasFix = (wire: Pick<WireListing, "latitude" | "longitude">): boolean =>
    typeof wire.latitude === "number" &&
    typeof wire.longitude === "number" &&
    Number.isFinite(wire.latitude) &&
    Number.isFinite(wire.longitude);

/**
 * A listing without the publisher and agent joins — what `POST /listings`
 * answers with and what `GET /publishers/:id/listings` lists, where the
 * caller already knows whose the rows are. The desk's `WireListing` is one
 * of these with both joined.
 */
export type WireOwnListing = Omit<WireListing, "publisher" | "agent"> & Partial<Pick<WireListing, "publisher" | "agent">>;

export function shapeListing(wire: WireOwnListing): AdminListing {
    return {
        id: wire.id,
        displayId: wire.displayId,
        title: wire.title,
        category: wire.category,
        subType: wire.subType,
        status: wire.status,
        city: wire.city,
        address: wire.address,
        size: sizeLabel(wire),
        ratePerDay: wire.ratePerDay,
        latitude: hasFix(wire) ? wire.latitude! : null,
        longitude: hasFix(wire) ? wire.longitude! : null,
        publisherName: wire.publisher?.name ?? null,
        publisherId: wire.publisher?.id ?? null,
        agentDisplayId: wire.agent?.displayId ?? null,
        photoCount: wire.photos?.length ?? 0,
        submittedAt: wire.submittedAt,
        createdAt: wire.createdAt,
        suspensionScopes: wire.suspensionScopes ?? [],
        suspensionReason: wire.suspensionReason ?? null,
        suspendedAt: wire.suspendedAt ?? null,
        ratingAvg: wire.ratingAvg ?? null,
        reviewCount: wire.reviewCount ?? 0,
        instantBooking: typeof wire.instantBooking === "boolean" ? wire.instantBooking : null,
        belowFloor: typeof wire.belowFloor === "boolean" ? wire.belowFloor : null,
        slotsTotal: typeof wire.slotsTotal === "number" ? wire.slotsTotal : null,
    };
}

/** The detail page's extra fields, over and above a table row. */
export interface WireListingDetail extends WireListing {
    description?: string | null;
    illumination?: string | null;
    facing?: string | null;
    placement?: string | null;
    estimatedDailyFootfall?: number | null;
    rejectionReason?: string | null;
    /**
     * G11-1: the one rule the server's `slots.service.carriesLoop` refuses a
     * slot count with — the sub-type or the media type names a screen —
     * answered by the read itself, and the media type the spot was filed
     * under. Absent on a backend older than the field.
     */
    carriesLoop?: boolean;
    mediaType?: { name: string; formatGroup: string } | null;
}

export interface AdminListingDetail extends AdminListing {
    description: string | null;
    illumination: string | null;
    facing: string | null;
    placement: string | null;
    estimatedDailyFootfall: number | null;
    rejectionReason: string | null;
    photoUrls: string[];
    publisherDisplayId: string | null;
    /** G11-1: the server's own verdict on whether the spot carries a loop; false when the read does not say. */
    carriesLoop: boolean;
    /** G11-1: the media type the spot was filed under, or null. */
    mediaType: { name: string; formatGroup: string } | null;
}

export interface AdminListingsPage {
    items: AdminListing[];
    total: number;
    page: number;
    pageSize: number;
    /** How many rows sit behind each status chip, counted without the chip. */
    counts: Record<string, number>;
}

export type AdminListingsSort = "NEWEST" | "OLDEST" | "RATE_ASC" | "RATE_DESC" | "TITLE" | "SUBMITTED";

export interface AdminListingsQuery {
    q?: string;
    status?: ListingLifecycle[];
    sort?: AdminListingsSort;
    page?: number;
    pageSize?: number;
}

/**
 * E10-2: one factor reprice on a listing — `GET /listings/:id/reprice-log`,
 * the Pricing tab's history as a first-class read over the shared audit
 * trail (newest first, 200 at most). `factor.applied` is null on a row
 * written before the flag was recorded; `by.name` is null when the
 * account is gone.
 */
export interface RepriceLogEntry {
    at: string;
    factor: { id: string | null; name: string | null; applied: boolean | null; mode: string | null; surgeId: string | null };
    from: string | null;
    to: string | null;
    by: { id: string | null; name: string | null };
}

/**
 * QR-8 (17 Sep 2026): a listing saved half-way on a publisher's phone, as
 * `GET /listings/drafts/desk` lists it for the sales and onboarding teams —
 * the publisher's name and number beside each, and how many days it has sat
 * untouched. The answers themselves stay on the phone's side.
 */
export interface ListingDraftRow {
    id: string;
    displayId: string;
    category: string | null;
    title: string | null;
    stepIndex: number;
    stepKey: string | null;
    createdAt: string;
    updatedAt: string;
    idleDays: number;
    publisher: { id: string; displayId: string | null; name: string; mobile: string; city: string | null; kycStatus: string };
}

export interface ListingDraftsPage {
    items: ListingDraftRow[];
    total: number;
    page: number;
    pageSize: number;
}

export interface ListingDraftsQuery {
    idleDays?: number;
    q?: string;
    category?: string;
    sort?: "IDLE" | "NEWEST";
    page?: number;
    pageSize?: number;
}

export const listingsService = {
    /** QR-8: every publisher's half-written spots — the call list. */
    drafts: (query: ListingDraftsQuery = {}): Promise<ListingDraftsPage> => {
        const params = new URLSearchParams();
        if (query.idleDays !== undefined) params.set("idleDays", String(query.idleDays));
        if (query.q) params.set("q", query.q);
        if (query.category) params.set("category", query.category);
        if (query.sort) params.set("sort", query.sort);
        params.set("page", String(query.page ?? 1));
        params.set("pageSize", String(query.pageSize ?? 50));
        return http.get<ListingDraftsPage>(`/listings/drafts/desk?${params.toString()}`);
    },

    /**
     * The table's page. No fixture fallback: the previous version drew seeded
     * listings with ids the backend has never heard of, so a row click opened
     * a record that did not exist. Empty and honest beats plausible and wrong.
     */
    list: async (query: AdminListingsQuery = {}): Promise<AdminListingsPage> => {
        const params = new URLSearchParams();
        if (query.q) params.set("q", query.q);
        if (query.status?.length) params.set("status", query.status.join(","));
        if (query.sort) params.set("sort", query.sort);
        params.set("page", String(query.page ?? 1));
        params.set("pageSize", String(query.pageSize ?? 20));
        const page = await http.get<{
            items: WireListing[];
            total: number;
            page: number;
            pageSize: number;
            counts: Record<string, number>;
        }>(`/listings?${params.toString()}`);
        return { ...page, items: (page.items ?? []).map(shapeListing) };
    },

    /** The factor reprices on one listing, newest first — the appliedRatePerDay trail. 404 for a listing that does not exist. */
    repriceLog: (id: string): Promise<RepriceLogEntry[]> => http.get<RepriceLogEntry[]>(`/listings/${encodeURIComponent(id)}/reprice-log`),

    /**
     * One listing, with its publisher, its agent and its photographs.
     *
     * 404 comes back as null so the page can call `notFound()` rather than
     * render a failed request.
     */
    get: async (id: string): Promise<AdminListingDetail | null> => {
        try {
            const wire = await http.get<WireListingDetail>(`/listings/${id}`);
            return {
                ...shapeListing(wire),
                subType: wire.subType,
                description: wire.description ?? null,
                illumination: wire.illumination ?? null,
                facing: wire.facing ?? null,
                placement: wire.placement ?? null,
                estimatedDailyFootfall: wire.estimatedDailyFootfall ?? null,
                rejectionReason: wire.rejectionReason ?? null,
                photoUrls: (wire.photos ?? []).map((photo) => photo.url),
                publisherDisplayId: wire.publisher?.displayId ?? null,
                carriesLoop: wire.carriesLoop ?? false,
                mediaType: wire.mediaType ?? null,
            };
        } catch {
            // The api-client throws on any non-2xx; the page treats every
            // failure to produce a listing the same way — as no such listing.
            return null;
        }
    },

    /**
     * Lot D (Q105): the publisher's instant-booking opt-in, switched from the
     * console. On needs the `instant-booking` flag for the publisher (409
     * FEATURE_OFF) and somewhere to send the agent (409 NO_MEETING_PLACE);
     * off asks nothing. `PATCH /listings/:id`.
     */
    setInstantBooking: (id: string, instantBooking: boolean) =>
        http.patch<WireListing>(`/listings/${id}`, { instantBooking }),

    /**
     * Lot G (Q116/136): the slot count — a digital screen's loop, 1..24.
     * `PATCH /listings/:id`; the server refuses a count above one on a spot
     * that carries no loop (400 VALIDATION_ERROR), reading the sub-type and
     * the media type the classifier resolved.
     */
    setSlotsTotal: (id: string, slotsTotal: number) =>
        http.patch<WireListing>(`/listings/${encodeURIComponent(id)}`, { slotsTotal }),

    create: (body: {
        publisherId: string;
        title: string;
        category: string;
        address: string;
        city?: string;
        latitude: number;
        longitude: number;
        /* The match key. Venue is the coarsest cut and omitting it does not mean
           "any venue" -- it files the spot in the pool of spots that have none. */
        venueTypeId?: string;
        mediaTypeId: string;
        /* Either a class, or the dimensions the class is derived from. Sending
           both lets them disagree, so the form sends whichever the operator
           actually supplied and the server derives the rest. */
        sizeClassId?: string;
        widthFt?: string;
        heightFt?: string;
        materialId?: string;
        placement?: string;
        /* The publisher's own unit and figure. `ratePerDay` is derived from the
           pair server-side, which is where the conversion belongs. */
        pricingUnit?: string;
        basePrice?: string;
        ratePerDay?: string;
        description?: string;
        targetAudience?: string;
        uniqueSellingPoint?: string;
        footfallNote?: string;
        illumination?: string;
        facing?: string;
        elevation?: string;
        visibility?: string;
        trafficGrade?: string;
        minBookingDays?: number;
        availableFrom?: string;
        availableHoursFrom?: string;
        availableHoursTo?: string;
        peakPeriodNote?: string;
        rateCardUrl?: string;
    }) => http.post<WireOwnListing>("/listings", body),

    /**
     * G7 (Q109) / Y-B: the vendors' audience panel for the spot's catchment,
     * one month (this one when none is given). Each enabled vendor's raw
     * answer is stored per (spot, vendor, month) and blended on read by the
     * policy; `cached` says no vendor was called for this read. A panel
     * figure is what the vendor charges for, so it is read from the detail,
     * never the table.
     */
    audience: (id: string, period?: string): Promise<ListingAudience> =>
        http.get<ListingAudience>(`/listings/${encodeURIComponent(id)}/audience${period ? `?period=${encodeURIComponent(period)}` : ""}`),
};

/** `GET /listings/:id/audience` — the blended panel, or why there is none. */
export interface ListingAudience {
    listingId: string;
    /** YYYY-MM. */
    period: string;
    /** The legacy one-vendor label; NONE when nothing backs a figure. */
    provider: "NONE" | AudienceVendor;
    /** Y-B: the enabled set. */
    providers: AudienceVendor[];
    /** Null when no vendor is configured, the spot has no coordinates, or no vendor has anything for the circle. */
    audience: BlendedAudienceCatchment | null;
    /** Says why `audience` is what it is, in words a screen can print. */
    basis: string;
    /** True when every answer came from the stored rows — no vendor was called. */
    cached: boolean;
    /** Vendors in force that could not answer this read — the other's answer stands. */
    unavailable: { vendor: AudienceVendor; reason: string }[];
}
