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
