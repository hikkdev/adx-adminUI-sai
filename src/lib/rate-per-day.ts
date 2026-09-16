/**
 * The daily rate a price and a unit work out to — the same answer the server gets.
 *
 * The form shows this number under the price field and feeds it to the market
 * indicator, so it is not a preview: it is the figure a publisher decides
 * against. When it disagrees with what the server stores, the publisher is
 * shown a verdict about a rate their listing will not have.
 *
 * It disagreed. The first version multiplied JS floats and called `toFixed(2)`:
 *
 *   3.33 ft x 3.33 ft at Rs 10,000 per sq ft / day  ->  form Rs 110,889.00,
 *                                                       stored Rs 110,900.00
 *   Rs 100.05 per month                             ->  form Rs 3.33,
 *                                                       stored Rs 3.34
 *
 * Two separate causes. The server rounds the area to two places *before*
 * multiplying by it, and `toFixed` on a binary double is not decimal half-up
 * rounding — `100.05 / 30` is `3.3349999999999995` in a double, which rounds
 * down, while the exact value 3.335 rounds up.
 *
 * So this does what the server does, in integer paise. Every input has at most
 * two decimal places, so scaling by 100 makes each one exact; BigInt carries the
 * products, which reach 10^24 for a large spot at a large rate and would lose
 * precision as doubles well before that.
 *
 * The one place it can still differ from `Decimal` is a double-rounding edge in
 * the divisions: decimal.js divides to 20 significant figures and then rounds to
 * two, where this rounds the exact quotient once. Reaching a different answer
 * needs a quotient whose 3rd through 20th decimal places are all 9s or all 0s
 * around the half — not a case any rupee amount produces.
 */

export const PRICING_UNITS = [
    "PER_DAY",
    "PER_WEEK",
    "PER_MONTH",
    "PER_SQFT_PER_DAY",
    "PER_SQFT_PER_MONTH",
] as const;

export type PricingUnit = (typeof PRICING_UNITS)[number];

export const UNIT_LABEL: Record<PricingUnit, string> = {
    PER_DAY: "Per day",
    PER_WEEK: "Per week",
    PER_MONTH: "Per month",
    PER_SQFT_PER_DAY: "Per sq.ft / day",
    PER_SQFT_PER_MONTH: "Per sq.ft / month",
};

export const UNIT_NEEDS_AREA: Record<PricingUnit, boolean> = {
    PER_DAY: false,
    PER_WEEK: false,
    PER_MONTH: false,
    PER_SQFT_PER_DAY: true,
    PER_SQFT_PER_MONTH: true,
};

/*
 * Written as `BigInt(...)` rather than the `123n` literal throughout: the
 * project targets ES2017, where the literal is a syntax error. The values are
 * identical and every one of them is exact — BigInt is arbitrary precision, and
 * a large spot at a large rate reaches 10^24, well past what a double holds.
 */
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const WEEK = BigInt(7);
const MONTH = BigInt(30);
const MONTH_HUNDREDTHS = BigInt(3000);
const TWO = BigInt(2);

/** `Decimal(14,2)` on `Listing.ratePerDay`, in paise. */
const MAX_RATE = BigInt("99999999999999");
/** `Decimal(10,2)` on `Listing.areaSqFt`, in hundredths of a square foot. */
const MAX_AREA = BigInt("9999999999");

/** A decimal string with at most two places, scaled by 100. Null if malformed. */
function toHundredths(value: string): bigint | null {
    const trimmed = value.trim();
    if (!/^\d{1,15}(\.\d{1,2})?$/.test(trimmed)) return null;
    const [whole, fraction = ""] = trimmed.split(".");
    return BigInt(whole!) * HUNDRED + BigInt(fraction.padEnd(2, "0"));
}

/** Half-up division of non-negative integers, the rounding `money()` applies. */
function roundDiv(numerator: bigint, denominator: bigint): bigint {
    return (numerator * TWO + denominator) / (denominator * TWO);
}

/** Back to a two-place decimal string, which is how money travels. */
function format(hundredths: bigint): string {
    const whole = hundredths / HUNDRED;
    const rest = hundredths % HUNDRED;
    return `${whole}.${rest.toString().padStart(2, "0")}`;
}

/**
 * The area a width and a height work out to, rounded once — as the server does
 * before it multiplies a per-square-foot rate by it.
 */
export function areaSqFtFrom(widthFt: string, heightFt: string): string | null {
    const width = toHundredths(widthFt);
    const height = toHundredths(heightFt);
    if (width === null || height === null || width <= ZERO || height <= ZERO) return null;
    const area = roundDiv(width * height, HUNDRED);
    if (area <= ZERO || area > MAX_AREA) return null;
    return format(area);
}

export type RateProblem =
    | "MALFORMED"
    | "NEEDS_AREA"
    /** Rounds to nothing a day — a per-month price under 30 paise. */
    | "ROUNDS_TO_ZERO"
    /** Larger than the column can hold; the server answers 400 for this too. */
    | "TOO_LARGE";

export type RateResult = { rate: string; problem?: never } | { rate: null; problem: RateProblem };

export function ratePerDayFrom(input: {
    unit: PricingUnit;
    basePrice: string;
    /** Required for the per-square-foot units, meaningless for the others. */
    areaSqFt?: string | null;
}): RateResult {
    const base = toHundredths(input.basePrice);
    if (base === null || base <= ZERO) return { rate: null, problem: "MALFORMED" };

    const needsArea = UNIT_NEEDS_AREA[input.unit];
    const area = needsArea ? toHundredths(input.areaSqFt ?? "") : HUNDRED;
    if (area === null || area <= ZERO) return { rate: null, problem: "NEEDS_AREA" };

    const perDay = (() => {
        switch (input.unit) {
            case "PER_DAY":
                return base;
            case "PER_WEEK":
                return roundDiv(base, WEEK);
            case "PER_MONTH":
                return roundDiv(base, MONTH);
            case "PER_SQFT_PER_DAY":
                return roundDiv(base * area, HUNDRED);
            case "PER_SQFT_PER_MONTH":
                return roundDiv(base * area, MONTH_HUNDREDTHS);
        }
    })();

    if (perDay <= ZERO) return { rate: null, problem: "ROUNDS_TO_ZERO" };
    if (perDay > MAX_RATE) return { rate: null, problem: "TOO_LARGE" };
    return { rate: format(perDay) };
}
