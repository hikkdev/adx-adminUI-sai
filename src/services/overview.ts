import { api as http, saveBlob } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatMoney, formatNumber, formatPct, toPaise } from "@/lib/format";
import type { KpiStat } from "@/types";

/**
 * The console's month in numbers — Lot B's `GET /admin/overview?month=YYYY-MM`
 * and E6's `?from=&to=` series — and, since Lot G (Q112/Q115), the analytics
 * set under `/admin/overview/{series,breakdown,tiles,export.csv}` and the
 * dashboard's `/admin/overview/insights`.
 *
 * One endpoint, one month, eleven figures. The dashboard reads the month it is
 * now in India (and the month before it, for the delta line under each tile)
 * and the twelve months ending there in one series read for its charts; the
 * analytics page reads the last six and folds them into a series.
 *
 * No fixture fallback, and the seeded KPIs the dashboard used to draw are gone
 * with this file. Every figure here is a sum over the ledger, the campaigns
 * table or the KYC queues, and a seeded "₹18,42,300" beside a real one is
 * indistinguishable on screen. With the API off the screens say so.
 *
 * MONEY IS A DECIMAL STRING END TO END. `bookingsAuthorised`, `gmvRecognised`,
 * `platformRevenue` and `publisherEarnings` arrive as `"12500.00"` and are
 * printed with `formatMoney`. The only place a number is built from one is the
 * chart's y-axis position, which nobody reads a figure off — the tooltip and
 * every tile beside it print the string the API sent.
 */

/** A rupee amount exactly as the API sends it. Never parsed for display. */
export type Money = string;

/** `YYYY-MM` — an Indian calendar month. */
export type MonthKey = string;

/** Where the GMV figure came from: the spend legs, or the accrual until any exist. */
export type GmvSource = "CAMPAIGN_SPEND" | "ACCRUAL_GROSS";

/** The response, field for field. */
export interface MonthOverview {
    month: MonthKey;
    window: { start: string; end: string };
    /** What advertisers committed — `Campaign.total` by the day it was paid, plus package sales. */
    bookingsAuthorised: Money;
    /** What actually left their wallets for media — the `CAMPAIGN_SPEND` legs by the day posted. */
    gmvRecognised: Money;
    gmvSource: GmvSource;
    /** Net movement on `platform:revenue` in the month, reversals included. */
    platformRevenue: Money;
    /** `platformRevenue / gmvRecognised × 100`, two decimals; `"0.00"` with no GMV. */
    takeRatePct: string;
    /** `EarningAccrual.net` for the month's days. */
    publisherEarnings: Money;
    /** Campaigns that ran on any day of the month. */
    activeCampaigns: number;
    newPublishers: number;
    newAdvertisers: number;
    /** Submitted and still pending across the four KYC tables. A queue, so not month-scoped. */
    kycPending: number;
    /** E6: campaigns and package sales paid in the window — the same filter as `bookingsAuthorised`. */
    bookingsCount: number;
    /** E6: `bookingsAuthorised / bookingsCount`; `"0.00"` when none. */
    averageBookingValue: Money;
}

/** E6: `GET /admin/overview?from&to` — one single-month shape per month, oldest first. */
export interface OverviewSeries {
    from: MonthKey;
    to: MonthKey;
    months: MonthOverview[];
}

/* ------------------------------------------------------------------ */
/* Months                                                              */
/* ------------------------------------------------------------------ */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** The month it is now in India, as `YYYY-MM` — the same arithmetic the backend's `parseMonth` does. */
export function currentMonthIST(now: Date = new Date()): MonthKey {
    const shifted = new Date(now.getTime() + IST_OFFSET_MS);
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

export const isMonthKey = (value: string): boolean => MONTH_KEY.test(value);

/** `YYYY-MM` moved by `delta` months; `-1` is the month before. */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
    const match = MONTH_KEY.exec(month);
    if (!match) throw new Error(`Not a month: ${month}`);
    const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
    const year = Math.floor(index / 12);
    return `${year}-${pad((index % 12) + 1)}`;
}

/**
 * The `count` months ending at `anchor`, oldest first — the analytics page's
 * six-month window. `[anchor]` when count is 1.
 */
export function monthsEndingAt(anchor: MonthKey, count: number): MonthKey[] {
    const out: MonthKey[] = [];
    for (let i = count - 1; i >= 0; i -= 1) out.push(shiftMonth(anchor, -i));
    return out;
}

/** "Sep 2026" from `2026-09`. */
export function monthLabel(month: MonthKey): string {
    const match = MONTH_KEY.exec(month);
    if (!match) return month;
    return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

/** "Sep" from `2026-09` — the chart's axis tick. */
export function monthShortLabel(month: MonthKey): string {
    const match = MONTH_KEY.exec(month);
    if (!match) return month;
    return MONTH_NAMES[Number(match[2]) - 1];
}

/* ------------------------------------------------------------------ */
/* Deltas                                                              */
/* ------------------------------------------------------------------ */

export interface Delta {
    /** "+22.4%", "-3.1%", "+18", "0". Fit for the tile's delta line. */
    text: string;
    tone: "positive" | "negative" | "neutral";
}

/**
 * Month-over-month change of a money figure, as a percentage of the earlier
 * month. Null when the earlier month was zero: a change from nothing is not a
 * percentage, and "+∞%" on a tile is a bug report.
 *
 * The ratio is the one float built here. Both sides are counted in paise as
 * bigints first, so a paisa is never lost before the division, and the result
 * is only ever printed to one decimal place — never re-used as money.
 */
export function moneyDelta(current: Money, previous: Money): Delta | null {
    const now = toPaise(current);
    const before = toPaise(previous);
    if (before === BigInt(0)) return null;
    const pct = (Number(now - before) / Number(before < BigInt(0) ? -before : before)) * 100;
    return percentDelta(pct);
}

/** Month-over-month change of a count, as the plain difference: "+18", "-3", "0". */
export function countDelta(current: number, previous: number): Delta {
    const diff = current - previous;
    return {
        text: diff > 0 ? `+${diff}` : String(diff),
        tone: diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral",
    };
}

/** Change of a percentage figure in points: "+0.8pt", "-2.1pt". */
export function pointDelta(current: string, previous: string): Delta {
    const diff = Number(current) - Number(previous);
    if (!Number.isFinite(diff)) return { text: "—", tone: "neutral" };
    const rounded = Math.round(diff * 10) / 10;
    const text = `${rounded > 0 ? "+" : ""}${rounded.toFixed(1).replace(/\.0$/, "")}pt`;
    return { text, tone: rounded > 0 ? "positive" : rounded < 0 ? "negative" : "neutral" };
}

function percentDelta(pct: number): Delta {
    const rounded = Math.round(pct * 10) / 10;
    const text = `${rounded > 0 ? "+" : ""}${rounded.toFixed(1).replace(/\.0$/, "")}%`;
    return { text, tone: rounded > 0 ? "positive" : rounded < 0 ? "negative" : "neutral" };
}

/* ------------------------------------------------------------------ */
/* The dashboard's tiles                                                               */
/* ------------------------------------------------------------------ */

const withDelta = (delta: Delta | null, hint: string): Pick<KpiStat, "delta" | "deltaTone" | "hint"> =>
    delta ? { delta: delta.text, deltaTone: delta.tone, hint } : { hint };

/** The eight tiles, in the frame's reading order. Money is printed from the string the API sent. */
export function overviewTiles(current: MonthOverview, previous: MonthOverview | null): KpiStat[] {
    const vs = "from last month";
    return [
        {
            id: "bookings",
            label: "Bookings (authorised)",
            value: formatMoney(current.bookingsAuthorised),
            ...withDelta(
                previous ? moneyDelta(current.bookingsAuthorised, previous.bookingsAuthorised) : null,
                vs
            ),
        },
        {
            id: "gmv",
            label: "GMV (recognised)",
            value: formatMoney(current.gmvRecognised),
            ...withDelta(
                previous ? moneyDelta(current.gmvRecognised, previous.gmvRecognised) : null,
                current.gmvSource === "CAMPAIGN_SPEND"
                    ? "what left advertiser wallets for media this month"
                    : "the accrual's gross for the month — no spend leg has been posted yet"
            ),
        },
        {
            id: "take",
            label: "Take rate",
            value: formatPct(current.takeRatePct),
            ...withDelta(
                previous ? pointDelta(current.takeRatePct, previous.takeRatePct) : null,
                "platform revenue over recognised GMV"
            ),
        },
        {
            id: "earnings",
            label: "Publisher earnings",
            value: formatMoney(current.publisherEarnings),
            ...withDelta(
                previous ? moneyDelta(current.publisherEarnings, previous.publisherEarnings) : null,
                vs
            ),
        },
        {
            id: "campaigns",
            label: "Active campaigns",
            value: formatNumber(current.activeCampaigns),
            ...withDelta(
                previous ? countDelta(current.activeCampaigns, previous.activeCampaigns) : null,
                "ran on a day this month"
            ),
        },
        {
            id: "publishers",
            label: "New publishers",
            value: formatNumber(current.newPublishers),
            ...withDelta(
                previous ? countDelta(current.newPublishers, previous.newPublishers) : null,
                vs
            ),
        },
        {
            id: "advertisers",
            label: "New advertisers",
            value: formatNumber(current.newAdvertisers),
            ...withDelta(
                previous ? countDelta(current.newAdvertisers, previous.newAdvertisers) : null,
                vs
            ),
        },
        {
            id: "kyc",
            label: "Pending KYC",
            value: formatNumber(current.kycPending),
            // A queue, not a month: the number is what is waiting right now.
            hint: "awaiting review across all four parties",
        },
    ];
}

/* ------------------------------------------------------------------ */
/* The series                                                          */
/* ------------------------------------------------------------------ */

/** One month on the analytics chart. The strings are what gets printed; the numbers only place the mark. */
export interface MonthSeriesPoint {
    month: MonthKey;
    /** "Sep" — the axis tick. */
    label: string;
    gmvRecognised: Money;
    bookingsAuthorised: Money;
    takeRatePct: string;
    platformRevenue: Money;
    publisherEarnings: Money;
    activeCampaigns: number;
    newPublishers: number;
    newAdvertisers: number;
    /** E6: how many bookings were paid for in the month — the dashboard's count line. */
    bookingsCount: number;
    averageBookingValue: Money;
    /** Rupees as a float, for the y-axis only. */
    gmv: number;
    bookings: number;
    takeRate: number;
}

/** Rupees from a decimal string, for a chart position. Not for printing. */
export const moneyAsNumber = (amount: Money): number => Number(toPaise(amount)) / 100;

/**
 * Folds the overviews the API answered into the chart's series, in the order
 * `months` asks for them. A month the API did not answer is left out rather
 * than drawn as zero — a missing month and an empty month are different
 * things, and the chart should show a gap, not a collapse.
 */
export function foldMonthSeries(
    months: MonthKey[],
    overviews: (MonthOverview | null)[]
): MonthSeriesPoint[] {
    const byMonth = new Map<MonthKey, MonthOverview>();
    for (const overview of overviews) if (overview) byMonth.set(overview.month, overview);
    const series: MonthSeriesPoint[] = [];
    for (const month of months) {
        const overview = byMonth.get(month);
        if (!overview) continue;
        series.push({
            month,
            label: monthShortLabel(month),
            gmvRecognised: overview.gmvRecognised,
            bookingsAuthorised: overview.bookingsAuthorised,
            takeRatePct: overview.takeRatePct,
            platformRevenue: overview.platformRevenue,
            publisherEarnings: overview.publisherEarnings,
            activeCampaigns: overview.activeCampaigns,
            newPublishers: overview.newPublishers,
            newAdvertisers: overview.newAdvertisers,
            // A month answered before E6 carries neither; nothing is invented for it.
            bookingsCount: overview.bookingsCount ?? 0,
            averageBookingValue: overview.averageBookingValue ?? "0.00",
            gmv: moneyAsNumber(overview.gmvRecognised),
            bookings: moneyAsNumber(overview.bookingsAuthorised),
            takeRate: Number(overview.takeRatePct),
        });
    }
    return series;
}

/* ------------------------------------------------------------------ */
/* Lot G (Q115): the analytics set                                     */
/* ------------------------------------------------------------------ */

/**
 * `GET /admin/overview/series` — a day-granular walk over the ledger and
 * the orders, bucketed by Indian day, with the previous window of the same
 * length beside it. Every bucket carries every figure; `series` names the
 * ones the segment draws.
 */
export type Granularity = "day" | "week" | "month";
export type Segment = "ALL" | "PUBLISHERS" | "ADVERTISERS" | "AGENTS";
export const SEGMENTS: readonly Segment[] = ["ALL", "PUBLISHERS", "ADVERTISERS", "AGENTS"];
export const SEGMENT_LABEL: Record<Segment, string> = {
    ALL: "All",
    PUBLISHERS: "Publishers",
    ADVERTISERS: "Advertisers",
    AGENTS: "Agents",
};

export type ListingCategory = "INDOOR" | "OUTDOOR" | "TRANSIT" | "MEDIA";
export const LISTING_CATEGORIES: readonly ListingCategory[] = ["INDOOR", "OUTDOOR", "TRANSIT", "MEDIA"];
export const LISTING_CATEGORY_LABEL: Record<ListingCategory, string> = {
    INDOOR: "Indoor",
    OUTDOOR: "Outdoor",
    TRANSIT: "Transit",
    MEDIA: "Media",
};

export type SeriesMetric =
    | "gmvRecognised"
    | "bookingsCount"
    | "bookingsValue"
    | "publisherEarnings"
    | "advertiserSpend"
    | "agentCommissions"
    | "publishersOnboarded"
    | "advertisersOnboarded"
    | "agentsActivated";

export interface SeriesFigures {
    gmvRecognised: Money;
    bookingsAuthorised: { count: number; value: Money };
    publisherEarnings: Money;
    /** `gmvRecognised` plus the package sales paid — what left advertisers' wallets, media or not. */
    advertiserSpend: Money;
    /** `AgentIncentive` CREDITED, by the day it was verified. */
    agentCommissions: Money;
    onboardingStats: { publishersOnboarded: number; advertisersOnboarded: number; agentsActivated: number };
}

export interface SeriesBucket extends SeriesFigures {
    /** The bucket's natural start as an Indian day — the day, the Monday, or the first of the month. */
    bucket: string;
    start: string;
    end: string;
}

/** `deltaPct` is `(current − previous) / previous × 100` to two decimals; null when the previous figure is zero. */
export interface Comparison<T extends Money | number | string> {
    current: T;
    previous: T;
    deltaPct: string | null;
}

export interface AnalyticsSeries {
    from: string;
    to: string;
    granularity: Granularity;
    segment: Segment;
    filters: { category: string | null; city: string | null };
    /** The metrics this segment draws. */
    series: SeriesMetric[];
    gmvSource: GmvSource;
    window: { start: string; end: string };
    previousWindow: { start: string; end: string };
    buckets: SeriesBucket[];
    totals: SeriesFigures;
    previous: { buckets: SeriesBucket[]; totals: SeriesFigures };
    comparison: {
        gmvRecognised: Comparison<Money>;
        bookingsCount: Comparison<number>;
        bookingsValue: Comparison<Money>;
        publisherEarnings: Comparison<Money>;
        advertiserSpend: Comparison<Money>;
        agentCommissions: Comparison<Money>;
        publishersOnboarded: Comparison<number>;
        advertisersOnboarded: Comparison<number>;
        agentsActivated: Comparison<number>;
    };
}

export interface SeriesQuery {
    /** Inclusive Indian days, `YYYY-MM-DD`; at most 366 apart. */
    from: string;
    to: string;
    granularity?: Granularity;
    segment?: Segment;
    category?: ListingCategory;
    city?: string;
}

/** `?from=&to=&granularity=&segment=&category=&city=`, nothing sent that was not asked for. */
export function seriesQuery(query: SeriesQuery): string {
    const params = new URLSearchParams();
    params.set("from", query.from);
    params.set("to", query.to);
    if (query.granularity) params.set("granularity", query.granularity);
    if (query.segment) params.set("segment", query.segment);
    if (query.category) params.set("category", query.category);
    if (query.city?.trim()) params.set("city", query.city.trim());
    return params.toString();
}

/* ---- the breakdown -------------------------------------------------- */

export type BreakdownDimension = "category" | "city" | "publisher" | "advertiser" | "agent";
export type BreakdownSort =
    | "GMV_DESC"
    | "GMV_ASC"
    | "BOOKINGS_DESC"
    | "BOOKINGS_ASC"
    | "VALUE_DESC"
    | "VALUE_ASC"
    | "EARNINGS_DESC"
    | "EARNINGS_ASC"
    | "LABEL_ASC"
    | "LABEL_DESC";

export const BREAKDOWN_DIMENSIONS: readonly BreakdownDimension[] = ["city", "publisher", "advertiser", "agent"];
export const BREAKDOWN_DIMENSION_LABEL: Record<BreakdownDimension, string> = {
    category: "Category",
    city: "City",
    publisher: "Publisher",
    advertiser: "Advertiser",
    agent: "Agent",
};

/** One row of `GET /admin/overview/breakdown`. `href` is the console route the server chose. */
export interface BreakdownRow {
    /** Lot X-B: under `by=city` the catalogue city's slug, or `other` for the spots typed under a town with no key. */
    key: string;
    label: string;
    /** The console route for the row; empty for the by-city "Other (typed)" bucket, which has no page. */
    href: string;
    gmvRecognised: Money;
    bookingsCount: number;
    bookingsValue: Money;
    publisherEarnings: Money;
    /** The row's GMV over the window's, two decimals. */
    sharePct: string;
    /**
     * G11-1: the same row over the window shifted back by its own length —
     * null when that group had nothing then — and the GMV movement against
     * it (null with nothing to compare, or a previous GMV of zero). Absent
     * on a backend older than the fields.
     */
    previous?: { gmvRecognised: Money; bookings: number } | null;
    deltaPct?: string | null;
}

/** The list contract; there is no status facet, so `counts` is `{}`. */
export interface BreakdownPage {
    items: BreakdownRow[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export interface BreakdownQuery {
    from: string;
    to: string;
    by: BreakdownDimension;
    q?: string;
    sort?: BreakdownSort;
    page?: number;
    pageSize?: number;
}

export function breakdownQuery(query: BreakdownQuery): string {
    const params = new URLSearchParams();
    params.set("from", query.from);
    params.set("to", query.to);
    params.set("by", query.by);
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.sort) params.set("sort", query.sort);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    return params.toString();
}

/** The column a sortable header stands for, and the two sorts it toggles between. */
export const BREAKDOWN_COLUMN_SORTS = {
    label: { asc: "LABEL_ASC", desc: "LABEL_DESC" },
    gmv: { asc: "GMV_ASC", desc: "GMV_DESC" },
    bookings: { asc: "BOOKINGS_ASC", desc: "BOOKINGS_DESC" },
    value: { asc: "VALUE_ASC", desc: "VALUE_DESC" },
    earnings: { asc: "EARNINGS_ASC", desc: "EARNINGS_DESC" },
} as const satisfies Record<string, { asc: BreakdownSort; desc: BreakdownSort }>;
export type BreakdownColumn = keyof typeof BREAKDOWN_COLUMN_SORTS;

/**
 * The sort a click on a column header asks for: descending first for a
 * figure (the biggest is what a ranking is for), ascending first for the
 * label; a second click flips it.
 */
export function nextBreakdownSort(current: BreakdownSort, column: BreakdownColumn): BreakdownSort {
    const pair = BREAKDOWN_COLUMN_SORTS[column];
    const first: BreakdownSort = column === "label" ? pair.asc : pair.desc;
    const second: BreakdownSort = column === "label" ? pair.desc : pair.asc;
    return current === first ? second : first;
}

/** Which column a sort is on, and which way — for the header's arrow. */
export function breakdownSortState(sort: BreakdownSort): { column: BreakdownColumn; dir: "asc" | "desc" } {
    for (const column of Object.keys(BREAKDOWN_COLUMN_SORTS) as BreakdownColumn[]) {
        const pair = BREAKDOWN_COLUMN_SORTS[column];
        if (pair.asc === sort) return { column, dir: "asc" };
        if (pair.desc === sort) return { column, dir: "desc" };
    }
    return { column: "gmv", dir: "desc" };
}

/* ---- the tiles ------------------------------------------------------ */

export interface FillRate {
    /** Booked listing-days over available, two decimals; can read over 100 on an over-booked screen. */
    pct: string;
    bookedListingDays: number;
    availableListingDays: number;
}

export interface AnalyticsTiles {
    from: string;
    to: string;
    window: { start: string; end: string };
    previousWindow: { start: string; end: string };
    gmvSource: GmvSource;
    /**
     * G13-B: `count` is listings ACTIVE now (a state, not a window figure);
     * `newInWindow` / `previousNewInWindow` are the listings published in the
     * window and the one before it, `delta` their difference — the frame's
     * "1,092 up 64".
     */
    activeListings: { count: number; newInWindow: number; previousNewInWindow: number; delta: number };
    fillRate: { current: FillRate; previous: FillRate; deltaPct: string | null };
    gmvRecognised: Comparison<Money>;
    takeRatePct: Comparison<string>;
    platformRevenue: Comparison<Money>;
    bookingsAuthorised: Comparison<Money>;
    activeCampaigns: Comparison<number>;
    /** The queue, not a window figure. */
    kycPending: number;
}

/* ---- the window ----------------------------------------------------- */

export type RangePreset = "7D" | "30D" | "90D" | "CUSTOM";
export const RANGE_PRESETS: readonly RangePreset[] = ["7D", "30D", "90D", "CUSTOM"];
export const RANGE_PRESET_LABEL: Record<RangePreset, string> = {
    "7D": "Last 7 days",
    "30D": "Last 30 days",
    "90D": "Last 90 days",
    CUSTOM: "Custom",
};

/** The server's ceiling on one read, inclusive days. */
export const MAX_ANALYTICS_DAYS = 366;

/** Today in India as `YYYY-MM-DD` — the same arithmetic the backend cuts the day by. */
export function todayIST(now: Date = new Date()): string {
    const shifted = new Date(now.getTime() + IST_OFFSET_MS);
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** `YYYY-MM-DD` moved by `days`, on the calendar (no zone can move it). */
export function shiftDay(day: string, days: number): string {
    const [y, m, d] = day.split("-").map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + days));
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Inclusive days between two `YYYY-MM-DD`; negative when `to` is before `from`. */
export function daysBetween(from: string, to: string): number {
    const at = (day: string) => {
        const [y, m, d] = day.split("-").map(Number);
        return Date.UTC(y, m - 1, d) / 86_400_000;
    };
    return at(to) - at(from) + 1;
}

/** The inclusive window a preset names, ending today: "Last 7 days" is today and the six before it. */
export function rangeFor(preset: Exclude<RangePreset, "CUSTOM">, today: string = todayIST()): { from: string; to: string } {
    const days = preset === "7D" ? 7 : preset === "30D" ? 30 : 90;
    return { from: shiftDay(today, -(days - 1)), to: today };
}

/** "1 Sep" from `2026-09-01` — the daily chart's axis tick. */
export function dayLabel(day: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) return day;
    return `${Number(match[3])} ${MONTH_NAMES[Number(match[2]) - 1]}`;
}

/** "1 Sep 2026" from `2026-09-01`. */
export function dayLongLabel(day: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) return day;
    return `${Number(match[3])} ${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

/* ---- the daily series, shaped for the chart ------------------------- */

/**
 * One bucket on the analytics charts. The strings are what gets printed; the
 * numbers only place the marks. `previous*` is the bucket at the same
 * position in the previous window — the dotted line the frame draws — and
 * null when the previous window cut into fewer buckets.
 */
export interface DailySeriesPoint {
    bucket: string;
    /** "1 Sep" — the axis tick. */
    label: string;
    /** The previous window's bucket at the same position, for the tooltip. */
    previousBucket: string | null;
    gmvRecognised: Money;
    previousGmvRecognised: Money | null;
    bookingsCount: number;
    bookingsValue: Money;
    publisherEarnings: Money;
    previousPublisherEarnings: Money | null;
    advertiserSpend: Money;
    previousAdvertiserSpend: Money | null;
    agentCommissions: Money;
    previousAgentCommissions: Money | null;
    publishersOnboarded: number;
    advertisersOnboarded: number;
    agentsActivated: number;
    /** Rupees as floats, for the y-axis only. */
    gmv: number;
    previousGmv: number | null;
    earnings: number;
    previousEarnings: number | null;
    spend: number;
    previousSpend: number | null;
    commissions: number;
    previousCommissions: number | null;
}

/**
 * The series and its previous window folded into one row per bucket, the
 * previous bucket matched by position. Day granularity always matches one
 * for one (the previous window is the same number of days); a week or month
 * cut can differ by one bucket at either end, and that bucket's previous
 * reads null rather than borrowing a neighbour.
 */
export function foldDailySeries(series: Pick<AnalyticsSeries, "buckets" | "previous">): DailySeriesPoint[] {
    return (series.buckets ?? []).map((bucket, index) => {
        const before = series.previous?.buckets?.[index] ?? null;
        return {
            bucket: bucket.bucket,
            label: dayLabel(bucket.bucket),
            previousBucket: before?.bucket ?? null,
            gmvRecognised: bucket.gmvRecognised,
            previousGmvRecognised: before?.gmvRecognised ?? null,
            bookingsCount: bucket.bookingsAuthorised.count,
            bookingsValue: bucket.bookingsAuthorised.value,
            publisherEarnings: bucket.publisherEarnings,
            previousPublisherEarnings: before?.publisherEarnings ?? null,
            advertiserSpend: bucket.advertiserSpend,
            previousAdvertiserSpend: before?.advertiserSpend ?? null,
            agentCommissions: bucket.agentCommissions,
            previousAgentCommissions: before?.agentCommissions ?? null,
            publishersOnboarded: bucket.onboardingStats.publishersOnboarded,
            advertisersOnboarded: bucket.onboardingStats.advertisersOnboarded,
            agentsActivated: bucket.onboardingStats.agentsActivated,
            gmv: moneyAsNumber(bucket.gmvRecognised),
            previousGmv: before ? moneyAsNumber(before.gmvRecognised) : null,
            earnings: moneyAsNumber(bucket.publisherEarnings),
            previousEarnings: before ? moneyAsNumber(before.publisherEarnings) : null,
            spend: moneyAsNumber(bucket.advertiserSpend),
            previousSpend: before ? moneyAsNumber(before.advertiserSpend) : null,
            commissions: moneyAsNumber(bucket.agentCommissions),
            previousCommissions: before ? moneyAsNumber(before.agentCommissions) : null,
        };
    });
}

/* ---- the four series cards ------------------------------------------ */

/** The four cards the owner asked for, each its own series. */
export type SeriesCardKind = "PUBLISHER_EARNINGS" | "ADVERTISER_SPEND" | "AGENT_COMMISSIONS" | "ONBOARDING";

export interface SeriesCard {
    kind: SeriesCardKind;
    title: string;
    /** What the card's figure is a sum of. */
    hint: string;
    /** The window's total printed under the title, and the change against the previous window. */
    total: string;
    delta: Delta | null;
    /** For the onboarding card: the three counts, each with its own comparison. */
    counts?: { label: string; current: number; delta: Delta | null }[];
}

/** A server `deltaPct` ("22.40" / null) as the tile's delta line. */
export function serverDelta(deltaPct: string | null | undefined): Delta | null {
    if (deltaPct === null || deltaPct === undefined) return null;
    const pct = Number(deltaPct);
    if (!Number.isFinite(pct)) return null;
    return percentDelta(pct);
}

/**
 * Which of the four cards the segment draws, from the metrics the server
 * says the segment covers: earnings for publishers, spend for advertisers,
 * commissions for agents, and the onboarding card whenever any onboarding
 * metric is in the set — narrowed to the parties it names.
 */
export function seriesCardsFor(series: Pick<AnalyticsSeries, "series" | "totals" | "comparison">): SeriesCard[] {
    const drawn = new Set(series.series ?? []);
    const cards: SeriesCard[] = [];
    if (drawn.has("publisherEarnings")) {
        cards.push({
            kind: "PUBLISHER_EARNINGS",
            title: "Publishers' earnings",
            hint: "net accruals by the day they were earned",
            total: formatMoney(series.totals.publisherEarnings),
            delta: serverDelta(series.comparison.publisherEarnings.deltaPct),
        });
    }
    if (drawn.has("advertiserSpend")) {
        cards.push({
            kind: "ADVERTISER_SPEND",
            title: "Advertisers' spend",
            hint: "what left advertisers' wallets — media and packages",
            total: formatMoney(series.totals.advertiserSpend),
            delta: serverDelta(series.comparison.advertiserSpend.deltaPct),
        });
    }
    if (drawn.has("agentCommissions")) {
        cards.push({
            kind: "AGENT_COMMISSIONS",
            title: "Agents' commissions",
            hint: "incentives credited, by the day they were verified",
            total: formatMoney(series.totals.agentCommissions),
            delta: serverDelta(series.comparison.agentCommissions.deltaPct),
        });
    }
    const counts: NonNullable<SeriesCard["counts"]> = [];
    if (drawn.has("publishersOnboarded")) {
        counts.push({
            label: "Publishers",
            current: series.totals.onboardingStats.publishersOnboarded,
            delta: serverDelta(series.comparison.publishersOnboarded.deltaPct),
        });
    }
    if (drawn.has("advertisersOnboarded")) {
        counts.push({
            label: "Advertisers",
            current: series.totals.onboardingStats.advertisersOnboarded,
            delta: serverDelta(series.comparison.advertisersOnboarded.deltaPct),
        });
    }
    if (drawn.has("agentsActivated")) {
        counts.push({
            label: "Agents",
            current: series.totals.onboardingStats.agentsActivated,
            delta: serverDelta(series.comparison.agentsActivated.deltaPct),
        });
    }
    if (counts.length) {
        const total = counts.reduce((sum, count) => sum + count.current, 0);
        cards.push({
            kind: "ONBOARDING",
            title: "Onboarding",
            hint: "publishers and advertisers activated, agents verified by the desk",
            total: formatNumber(total),
            delta: null,
            counts,
        });
    }
    return cards;
}

/* ---- the tiles, shaped ---------------------------------------------- */

/**
 * The frame's four tiles (`5102:25931`): GMV for the window, the take rate,
 * active listings and the fill rate. Every figure and every delta is the
 * server's; the console prints them.
 */
export function analyticsTilesOf(tiles: AnalyticsTiles, rangeLabel: string): KpiStat[] {
    const vs = "vs the previous window";
    return [
        {
            id: "gmv",
            label: `GMV (${rangeLabel})`,
            value: formatMoney(tiles.gmvRecognised.current),
            ...withDelta(
                serverDelta(tiles.gmvRecognised.deltaPct),
                tiles.gmvSource === "CAMPAIGN_SPEND" ? vs : "the accrual's gross — no spend leg has been posted yet"
            ),
        },
        {
            id: "take",
            label: "Take rate",
            value: formatPct(tiles.takeRatePct.current),
            ...withDelta(pointDelta(tiles.takeRatePct.current, tiles.takeRatePct.previous), vs),
        },
        {
            id: "listings",
            label: "Active listings",
            value: formatNumber(tiles.activeListings.count),
            // G13-B: the count is a state; the delta is the window's new listings against the previous window's.
            ...withDelta(
                countDelta(tiles.activeListings.newInWindow, tiles.activeListings.previousNewInWindow),
                `${formatNumber(tiles.activeListings.newInWindow)} published in the window`
            ),
        },
        {
            id: "fill",
            label: "Fill rate",
            value: formatPct(tiles.fillRate.current.pct),
            ...withDelta(
                pointDelta(tiles.fillRate.current.pct, tiles.fillRate.previous.pct),
                `${formatNumber(tiles.fillRate.current.bookedListingDays)} of ${formatNumber(tiles.fillRate.current.availableListingDays)} listing-days booked`
            ),
        },
    ];
}

/* ------------------------------------------------------------------ */
/* Lot G (Q112): the dashboard insights                                */
/* ------------------------------------------------------------------ */

export type InsightSeverity = "INFO" | "WARN" | "CRITICAL";

/** One rule with something to say. A zero is silence, so an empty list is the good news. */
export interface Insight {
    /** G13-B: the stable id the dismiss route takes — the rule key. */
    id: string;
    key: string;
    severity: InsightSeverity;
    text: string;
    /** The console route to open. */
    href: string;
    value: number;
    direction?: "UP" | "DOWN";
}

export interface DashboardInsights {
    generatedAt: string;
    items: Insight[];
}

/** G13-B: the answer to a dismissal. */
export interface InsightDismissal {
    id: string;
    dismissed: true;
    expiresAt: string;
}

export type InsightTone = "info" | "warning" | "danger";

/** One chip on the dashboard's strip: the rule's text, its colour, and where it opens. */
export interface InsightChip {
    /** The id `POST /admin/overview/insights/:id/dismiss` takes; the key while the server sent none. */
    id: string;
    key: string;
    text: string;
    href: string;
    tone: InsightTone;
    severity: InsightSeverity;
}

export const INSIGHT_TONE: Record<InsightSeverity, InsightTone> = {
    INFO: "info",
    WARN: "warning",
    CRITICAL: "danger",
};

/**
 * The strip's chips, CRITICAL first, then WARN, then INFO — the order the
 * operator should read them in. An item the server sent without a route is
 * still drawn, opening nothing; an unknown severity reads as INFO rather
 * than as an alarm.
 */
export function insightChips(items: Insight[] | null | undefined): InsightChip[] {
    const rank: Record<InsightSeverity, number> = { CRITICAL: 0, WARN: 1, INFO: 2 };
    return (items ?? [])
        .map((item) => {
            const severity: InsightSeverity = item.severity in rank ? item.severity : "INFO";
            return { id: item.id ?? item.key, key: item.key, text: item.text, href: item.href ?? "", tone: INSIGHT_TONE[severity], severity };
        })
        .sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ---- the CSV -------------------------------------------------------- */

/** "analytics-2026-08-15-2026-09-13-day.csv", the way the server names it. */
export function analyticsExportFilename(query: SeriesQuery): string {
    return `analytics-${query.from}-${query.to}-${query.granularity ?? "day"}.csv`;
}

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/** Whether these screens read the API. There is no fixture to fall back to; with the API off they say so. */
export const overviewReadsApi = (): boolean => isLive("analytics");

/**
 * The backend caches an overview sixty seconds per month, and so does this:
 * the analytics page asks for six months, the dashboard for two, and a
 * month picker walking backwards would otherwise re-ask for months it was
 * shown a moment ago. Keyed by month, cleared when the entry is older than
 * the server's own window, so nothing here outlives the server's answer.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<MonthKey, { at: number; value: Promise<MonthOverview> }>();

const fetchMonth = (month: MonthKey) =>
    http.get<MonthOverview>(`/admin/overview?month=${encodeURIComponent(month)}`);

export const overviewService = {
    /** One month. Cached by key for as long as the server caches its own. */
    month: (month: MonthKey, now: number = Date.now()): Promise<MonthOverview> => {
        const hit = cache.get(month);
        if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;
        const value = fetchMonth(month).catch((error: unknown) => {
            // A failed request is not an answer; the next caller asks again.
            cache.delete(month);
            throw error;
        });
        cache.set(month, { at: now, value });
        return value;
    },

    /**
     * Several months at once, in the order asked. A month that fails answers
     * `null` rather than failing the set, so five good months still draw when
     * the sixth is being recalculated.
     */
    months: async (months: MonthKey[]): Promise<(MonthOverview | null)[]> =>
        Promise.all(months.map((month) => overviewService.month(month).catch(() => null))),

    /**
     * E6: the series in one read — `?from=YYYY-MM&to=YYYY-MM`, inclusive,
     * at most twenty-four months, each through the server's own minute
     * cache. The dashboard's twelve-month charts read this rather than
     * twelve single-month calls; the months it answers are dropped into
     * the per-month cache too, so a picker step to a month already drawn
     * asks nothing.
     */
    series: async (from: MonthKey, to: MonthKey, now: number = Date.now()): Promise<OverviewSeries> => {
        const series = await http.get<OverviewSeries>(
            `/admin/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        );
        for (const month of series.months ?? []) {
            cache.set(month.month, { at: now, value: Promise.resolve(month) });
        }
        return series;
    },

    /** Forgets every cached month, so a reload asks the server again. */
    invalidate: () => cache.clear(),

    /* ---- Lot G (Q115): the analytics set ---------------------------- */

    /** The day-granular series with the previous window beside it. Cached a minute server-side by its query. */
    analyticsSeries: (query: SeriesQuery): Promise<AnalyticsSeries> =>
        http.get<AnalyticsSeries>(`/admin/overview/series?${seriesQuery(query)}`),

    /** GMV, bookings and earnings by one dimension, on the list contract. Sort, search and page are applied server-side. */
    breakdown: async (query: BreakdownQuery): Promise<BreakdownPage> => {
        const page = await http.get<Partial<BreakdownPage>>(`/admin/overview/breakdown?${breakdownQuery(query)}`);
        return {
            items: page.items ?? [],
            total: page.total ?? 0,
            page: page.page ?? query.page ?? 1,
            pageSize: page.pageSize ?? query.pageSize ?? 20,
            counts: page.counts ?? {},
        };
    },

    /** Active listings, the fill rate and the four KPIs against the previous window. */
    analyticsTiles: (from: string, to: string): Promise<AnalyticsTiles> =>
        http.get<AnalyticsTiles>(`/admin/overview/tiles?${seriesQuery({ from, to })}`),

    /**
     * The series under the filters in force as a CSV, through the api
     * client's blob mode — the token, the timeout and the refresh-and-replay
     * of every other read — and handed to the browser. The server audits
     * `ANALYTICS_EXPORTED` before the first byte.
     */
    exportCsv: async (query: SeriesQuery): Promise<{ filename: string; bytes: number }> => {
        const result = await http.blob(`/admin/overview/export.csv?${seriesQuery(query)}`);
        const filename = result.filename ?? analyticsExportFilename(query);
        saveBlob(result.blob, filename);
        return { filename, bytes: result.blob.size };
    },

    /* ---- Lot G (Q112): the dashboard insights ----------------------- */

    /** The rule-based insights. Only a rule with something to say appears; an empty list is the good news. */
    insights: async (): Promise<DashboardInsights> => {
        const answer = await http.get<Partial<DashboardInsights> | null>("/admin/overview/insights");
        return { generatedAt: answer?.generatedAt ?? "", items: answer?.items ?? [] };
    },

    /**
     * G13-B: hides one row for the signed-in operator until the rule's value
     * changes or seven days pass. `POST /admin/overview/insights/:id/dismiss`;
     * a rule with nothing to say right now is a 404, which the strip treats
     * as already gone.
     */
    dismissInsight: (id: string): Promise<InsightDismissal> =>
        http.post<InsightDismissal>(`/admin/overview/insights/${encodeURIComponent(id)}/dismiss`),
};
