/**
 * Revenue types, mirroring the backend `revenue` module.
 *
 * Kept out of the `@/types` barrel for the same reason as `pricing-engine.ts`:
 * the fixture-era finance types describe a different model, and one namespace
 * would collide.
 *
 * Money is a decimal string; a rate is a **fraction**. `0.0050` is half a
 * percent, not half. Getting that wrong by a factor of a hundred is the single
 * easiest mistake to make here, so the types say so and the inputs repeat it.
 */

export type Money = string;
export type Rate = string;

export type FeeKind = "PLATFORM" | "INSTALLATION" | "PRINTING" | "DESIGN";
export type SubscriptionTierName = "STANDARD" | "PLUS" | "PRO";
export type RevenueCategory = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";

export type CommissionSource =
    | "PROMOTIONAL_OVERRIDE"
    | "SUBSCRIPTION"
    /** Lot B: a media-type rate for the rental band the spot's per-day value falls in. */
    | "MEDIA_TYPE_SLAB"
    /** Lot B: a media-type rate with no band. */
    | "MEDIA_TYPE"
    | "CATEGORY_RATE"
    | "PLATFORM_DEFAULT"
    /** A spot authorised before the stamp existed, resolved once by the accrual. */
    | "RESOLVED_AT_ACCRUAL"
    | "FALLBACK";

/** How the source reads on a row: "Media type · slab" rather than the enum. */
export const COMMISSION_SOURCE_LABEL: Record<CommissionSource, string> = {
    PROMOTIONAL_OVERRIDE: "Promotional override",
    SUBSCRIPTION: "Subscription",
    MEDIA_TYPE_SLAB: "Media type · slab",
    MEDIA_TYPE: "Media type",
    CATEGORY_RATE: "Category rate",
    PLATFORM_DEFAULT: "Platform default",
    RESOLVED_AT_ACCRUAL: "Resolved at accrual",
    FALLBACK: "Fallback",
};

/**
 * One `CommissionRate` row. Keyed on exactly one of `category` and
 * `mediaTypeId`, or neither for the platform default; a media-type row may
 * carry a rental slab `[minMediaValue, maxMediaValue)` on the per-day media
 * value the advertiser is billed for — the floor inclusive, the ceiling
 * exclusive, either bound open.
 */
export interface CommissionRate {
    id: string;
    /** Null is the platform default, or a media-type row. */
    category: RevenueCategory | null;
    /** Lot B (Q10/Q38): the pricing engine's media type. Beats a category row. */
    mediaTypeId: string | null;
    minMediaValue: Money | null;
    maxMediaValue: Money | null;
    ratePct: Rate;
    note: string | null;
    isActive: boolean;
    createdAt: string;
}

/** `POST /revenue/commission` — `commissionRateSchema` exactly. */
export interface CommissionRateInput {
    category?: RevenueCategory | null;
    mediaTypeId?: string | null;
    minMediaValue?: Money | null;
    maxMediaValue?: Money | null;
    ratePct: Rate;
    note?: string | null;
}

/**
 * Which resolution rung a stored rate row is — the key the accrual and the
 * quote resolve against. The most specific wins: a banded media-type row,
 * then the unbanded one, then the category, then the default.
 */
export function commissionRateSource(
    rate: Pick<CommissionRate, "category" | "mediaTypeId" | "minMediaValue" | "maxMediaValue">
): Extract<CommissionSource, "MEDIA_TYPE_SLAB" | "MEDIA_TYPE" | "CATEGORY_RATE" | "PLATFORM_DEFAULT"> {
    if (rate.mediaTypeId) {
        return rate.minMediaValue !== null || rate.maxMediaValue !== null ? "MEDIA_TYPE_SLAB" : "MEDIA_TYPE";
    }
    return rate.category ? "CATEGORY_RATE" : "PLATFORM_DEFAULT";
}

/** Lot J (B1): where a subscription came from — the console's grant, or the phone's purchase. */
export type SubscriptionSource = "ADMIN_GRANT" | "SELF_SERVICE";

/** Where a term stands: not yet started, in force, or over. */
export type SubscriptionState = "RUNNING" | "UPCOMING" | "ENDED";

export interface PublisherSubscription {
    id: string;
    publisherId: string;
    tier: SubscriptionTierName;
    ratePct: Rate;
    pricePerMonth: Money;
    startsAt: string;
    endsAt: string | null;
    /** Lot J (B1): `GET /revenue/subscriptions` names the source on every row. */
    source: SubscriptionSource;
    /** Lot J (B1): the tier's plan name at read time; null when the catalogue has no row for the tier. */
    planName: string | null;
    createdAt: string | null;
    /** Lot J2 (d): the list contract names the publisher on every row; null on a row from a read that does not. */
    publisherName: string | null;
    publisherDisplayId: string | null;
    /** Lot J2: the subscriber's own renewal switch; honoured only while the policy allows it. */
    autoRenew: boolean;
    /** Lot J2 (d): the state the list read named, or the dates' answer at read time for a row from a read that did not. */
    state: SubscriptionState;
}

export interface PublisherCommissionOverride {
    id: string;
    publisherId: string;
    ratePct: Rate;
    reason: string;
    approvedById: string;
    startsAt: string;
    endsAt: string | null;
}

export interface FeeSchedule {
    id: string;
    kind: FeeKind;
    name: string;
    percentPct: Rate | null;
    flatAmount: Money | null;
    gstPct: Rate;
    /** Whether the cart shows this fee's amount. It is named either way. */
    amountShownInCart: boolean;
    perSpot: boolean;
    isActive: boolean;
}

export interface TaxSettings {
    mediaGstPct: Rate;
}

export interface QuoteLine {
    kind: "MEDIA" | FeeKind;
    label: string;
    taxableValue: Money;
    gstPct: Rate;
    gstAmount: Money;
    total: Money;
    amountShownInCart: boolean;
}

export interface Quote {
    listingId: string;
    days: number;
    spots: number;
    ratePerDay: Money;
    lines: QuoteLine[];
    netValue: Money;
    gstAmount: Money;
    grossTotal: Money;
    goodwillApplied: Money;
    payable: Money;
    /** The media line plus any fee shown with its amount. */
    cartTotal: Money;
    hasUndisclosedFees: boolean;
    /** Named in the cart even where the amount is withheld. */
    disclosedFeeNames: string[];
    publisher: {
        grossEarnings: Money;
        commissionPct: Rate;
        commissionSource: CommissionSource;
        commissionAmount: Money;
        netEarnings: Money;
    };
}
