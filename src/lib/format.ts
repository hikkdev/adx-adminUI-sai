/**
 * Locale-aware formatting helpers.
 * ADX operates in INR with Indian digit grouping (lakh / crore).
 */

const inrFull = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
});

const inNumber = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
});

/** ₹6,20,000 */
export function formatINR(amount: number): string {
    return inrFull.format(amount);
}

/** 1,284 */
export function formatNumber(value: number): string {
    return inNumber.format(value);
}

/** ₹68K · ₹6.2L · ₹1.4Cr, compact Indian notation for tiles and charts */
export function formatCompactINR(amount: number): string {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (abs >= 1_00_00_000) {
        return `${sign}₹${trimZero(abs / 1_00_00_000)}Cr`;
    }
    if (abs >= 1_00_000) {
        return `${sign}₹${trimZero(abs / 1_00_000)}L`;
    }
    if (abs >= 1_000) {
        return `${sign}₹${trimZero(abs / 1_000)}K`;
    }
    return `${sign}₹${inNumber.format(abs)}`;
}

function trimZero(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

/** +22.4% / -3.1% */
export function formatDelta(percent: number): string {
    const sign = percent > 0 ? "+" : "";
    return `${sign}${percent.toFixed(1).replace(/\.0$/, "")}%`;
}

/** 24 Apr 2026 */
export function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(iso));
}

/** 24 Apr, 6:00 PM */
export function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(new Date(iso));
}

/**
 * Initials for avatar chips: "Sharma Hoardings" → "SH"
 *
 * Tolerates null/empty because some of these names come from the API, where
 * `User.name` is nullable — an avatar rendering blank is a far better outcome
 * than a `.split of null` taking down the page it sits in.
 */
export function getInitials(name: string | null | undefined): string {
    if (!name) return "";
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] ?? "")
        .join("")
        .toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Money as the API sends it                                           */
/* ------------------------------------------------------------------ */

/**
 * Every rupee figure the payouts and finance endpoints return is a DECIMAL
 * STRING — "12500.00" — and it has to stay one all the way to the screen.
 *
 * `formatINR` above takes a number, which is right for the fixture domains
 * where the seed data is numeric, and wrong here. `Number("12500.00")` is a
 * binary float: it survives one round trip and then loses a paisa somewhere
 * around a lakh, and the moment a screen re-renders a total with `toFixed(2)`
 * the figure on the page stops matching the ledger it came from. In a console
 * whose whole claim is that the books balance, that is not a rounding nit.
 *
 * So the helpers below never build a float. Amounts are converted to whole
 * paise as a `bigint`, compared and summed there, and formatted by grouping the
 * digits of the string. The only place a number appears is the group separator.
 */

/** Whole paise, for comparing and adding without a float. */
export function toPaise(amount: string | null | undefined): bigint {
    // `BigInt(0)` rather than `0n` throughout this block: the project targets
    // ES2017, where the literal syntax is a compile error but the constructor
    // and the type are both available from `lib: esnext`.
    if (!amount) return BigInt(0);
    const trimmed = amount.trim();
    const negative = trimmed.startsWith("-");
    const [whole = "0", fraction = ""] = trimmed.replace(/^[-+]/, "").split(".");
    // Pad or clip to exactly two places: the wire is always two, but a hand-typed
    // "500" or "500.5" from a form must land on the same scale.
    const paise = `${fraction}00`.slice(0, 2);
    const value = BigInt(`${whole || "0"}${paise}`);
    return negative ? -value : value;
}

/** The inverse, so a sum can go back on the wire as a decimal string. */
export function fromPaise(value: bigint): string {
    const negative = value < BigInt(0);
    const digits = (negative ? -value : value).toString().padStart(3, "0");
    const whole = digits.slice(0, -2);
    const paise = digits.slice(-2);
    return `${negative ? "-" : ""}${whole}.${paise}`;
}

/** Adds decimal strings and answers with one. Exact, because it counts paise. */
export function sumMoney(amounts: (string | null | undefined)[]): string {
    return fromPaise(amounts.reduce<bigint>((total, amount) => total + toPaise(amount), BigInt(0)));
}

/** -1, 0 or 1. Use for sorting a money column rather than `Number(a) - Number(b)`. */
export function compareMoney(a: string | null | undefined, b: string | null | undefined): number {
    const left = toPaise(a);
    const right = toPaise(b);
    return left < right ? -1 : left > right ? 1 : 0;
}

export const isZeroMoney = (amount: string | null | undefined): boolean =>
    toPaise(amount) === BigInt(0);

/**
 * What share of `whole` the amount `part` is, 0-100, for a progress bar.
 *
 * The division happens in paise and only the result becomes a number, so the
 * bar's width is the one place a rounded figure appears — which is harmless,
 * because nobody reads a value off a bar. Every printed figure beside it is
 * still the string the API sent.
 */
export function percentOfMoney(
    part: string | null | undefined,
    whole: string | null | undefined
): number {
    const total = toPaise(whole);
    if (total <= BigInt(0)) return 0;
    const used = toPaise(part);
    if (used <= BigInt(0)) return 0;
    return Math.min(100, Number((used * BigInt(100)) / total));
}

/** Indian digit grouping applied to a run of digits: 1234567 → 12,34,567. */
function groupIndian(digits: string): string {
    if (digits.length <= 3) return digits;
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

/**
 * ₹12,500.00 from the string the API sent, paise included.
 *
 * Paise are shown rather than rounded away because this is the console where
 * somebody reconciles a wallet against the ledger, and "₹12,500" next to
 * "12500.37" is a bug report waiting to be filed.
 */
export function formatMoney(amount: string | null | undefined): string {
    if (amount === null || amount === undefined || amount === "") return "—";
    const paiseValue = toPaise(amount);
    const negative = paiseValue < BigInt(0);
    const digits = (negative ? -paiseValue : paiseValue).toString().padStart(3, "0");
    return `${negative ? "-" : ""}₹${groupIndian(digits.slice(0, -2))}.${digits.slice(-2)}`;
}

/** A percentage the API sent as a decimal string: "97.50" → "97.5%". */
export function formatPct(value: string | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    return `${value.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%`;
}
