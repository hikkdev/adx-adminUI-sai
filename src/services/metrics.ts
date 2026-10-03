import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatMoney, formatNumber } from "@/lib/format";

/**
 * AN-1/AN-2: the metric registry, as the console reads it.
 *
 * The console knows nothing about what metrics exist. It asks
 * `GET /admin/analytics/catalogue`, draws a picker from the answer, and asks
 * `GET /admin/analytics/series` for whatever the operator chose. Adding a
 * metric on the backend makes it appear here with no change to this file,
 * which is the point of the registry.
 */

export const GRAINS = ["day", "week", "month"] as const;
export type Grain = (typeof GRAINS)[number];

export const GRAIN_LABEL: Record<Grain, string> = {
    day: "By day",
    week: "By week",
    month: "By month",
};

export type MetricKind = "COUNT" | "MONEY" | "RATIO" | "DURATION" | "BALANCE";
export type Rollup = "SUM" | "RECOMPUTE" | "CLOSING" | "WEIGHTED_MEAN";

export type MetricFamily =
    | "scale"
    | "margin"
    | "inventory"
    | "yield"
    | "demand"
    | "liquidity"
    | "campaign"
    | "fulfilment"
    | "workforce"
    | "acquisition"
    | "retention"
    | "money"
    | "trust"
    | "forecast";

/** What each family is called on screen, and the order the picker groups them in. */
export const FAMILY_LABEL: Record<MetricFamily, string> = {
    scale: "Scale and value",
    margin: "Margin",
    inventory: "Inventory health",
    yield: "Yield and pricing",
    demand: "Demand",
    liquidity: "Liquidity and matching",
    campaign: "Campaign effectiveness",
    fulfilment: "Fulfilment",
    workforce: "Workforce",
    acquisition: "Acquisition",
    retention: "Retention",
    money: "Money and risk",
    trust: "Trust and compliance",
    forecast: "Forecast and pacing",
};

export const FAMILY_ORDER: MetricFamily[] = [
    "scale",
    "margin",
    "demand",
    "inventory",
    "yield",
    "liquidity",
    "campaign",
    "fulfilment",
    "workforce",
    "acquisition",
    "retention",
    "money",
    "trust",
    "forecast",
];

export interface MetricDef {
    key: string;
    name: string;
    description: string;
    family: MetricFamily;
    kind: MetricKind;
    rollup: Rollup;
    numerator?: string;
    denominator?: string;
    dimensions: string[];
    grains: Grain[];
    source: string;
    caveat?: string;
}

/** One metric in one bucket. Money arrives as a decimal string, never a float. */
export interface MetricValue {
    value: string | number;
    /** Ratios carry what they were computed from, so the chart can show both. */
    numerator?: string | number;
    denominator?: string | number;
}

export interface MetricsBucket {
    bucket: string;
    start: string;
    end: string;
    values: Record<string, MetricValue>;
}

export interface MetricsSeries {
    from: string;
    to: string;
    grain: Grain;
    metrics: string[];
    filters: { category: string | null; city: string | null };
    window: { start: string; end: string };
    previousWindow: { start: string; end: string };
    buckets: MetricsBucket[];
    totals: Record<string, MetricValue>;
    previous: { buckets: MetricsBucket[]; totals: Record<string, MetricValue> };
    computedAt: string;
}

export interface MetricsSeriesQuery {
    from: string;
    to: string;
    grain: Grain;
    metrics: string[];
    category?: string;
    city?: string;
}

/** `?metrics=a,b&from=&to=&grain=&category=&city=`, blanks left off. */
export function seriesPath(query: MetricsSeriesQuery): string {
    const params = new URLSearchParams();
    params.set("metrics", query.metrics.join(","));
    params.set("from", query.from);
    params.set("to", query.to);
    params.set("grain", query.grain);
    if (query.category) params.set("category", query.category);
    if (query.city) params.set("city", query.city);
    return `/admin/analytics/series?${params.toString()}`;
}

/** Refuses to call out while the domain is off — there is nothing to fall back to. */
function live() {
    if (!isLive("analytics")) {
        throw new Error("Analytics reads the API; connect the console to the ADX backend first.");
    }
    return http;
}

export const metricsService = {
    /** `GET /admin/analytics/catalogue` — every metric the backend declares. */
    catalogue: async (): Promise<MetricDef[]> => {
        const answer = await live().get<{ metrics: MetricDef[] }>("/admin/analytics/catalogue");
        return answer.metrics ?? [];
    },

    /** `GET /admin/analytics/series` — the chosen metrics, bucketed. */
    series: (query: MetricsSeriesQuery): Promise<MetricsSeries> => live().get<MetricsSeries>(seriesPath(query)),
};

/* ── Reading a value ─────────────────────────────────────────────────── */

/** A metric's figure as it prints: rupees, a percentage, a duration, a count. */
export function formatMetric(def: MetricDef, value: MetricValue | undefined): string {
    if (!value) return "—";
    if (def.kind === "MONEY") return formatMoney(String(value.value));
    if (def.kind === "RATIO") return `${Number(value.value).toFixed(2)}%`;
    if (def.kind === "DURATION") return `${formatNumber(Number(value.value))}`;
    return formatNumber(Number(value.value));
}

/** The figure as a plain number, for the chart's axis. */
export const numberOf = (value: MetricValue | undefined): number => (value === undefined ? 0 : Number(value.value));

/**
 * `(current − previous) / previous × 100`, or null when there was nothing to
 * compare with. The same rule the rest of the console's deltas use.
 */
export function deltaOf(current: MetricValue | undefined, previous: MetricValue | undefined): number | null {
    const now = numberOf(current);
    const before = numberOf(previous);
    if (before === 0) return null;
    return ((now - before) / before) * 100;
}

/**
 * A ratio's delta is in points, not per cent: occupancy going from 20 % to
 * 30 % rose ten points, and calling that "+50 %" is the kind of thing that
 * ends up in a board pack.
 */
export const isPointsDelta = (def: MetricDef): boolean => def.kind === "RATIO";

/** The metrics grouped the way the picker lists them. */
export function byFamily(metrics: MetricDef[]): { family: MetricFamily; metrics: MetricDef[] }[] {
    const groups = new Map<MetricFamily, MetricDef[]>();
    for (const metric of metrics) {
        const list = groups.get(metric.family);
        if (list) list.push(metric);
        else groups.set(metric.family, [metric]);
    }
    return FAMILY_ORDER.filter((family) => groups.has(family)).map((family) => ({ family, metrics: groups.get(family)! }));
}

/* ── The window ──────────────────────────────────────────────────────── */

export const WINDOW_PRESETS = ["7D", "30D", "90D", "MTD", "LAST_MONTH"] as const;
export type WindowPreset = (typeof WINDOW_PRESETS)[number];

export const PRESET_LABEL: Record<WindowPreset, string> = {
    "7D": "Last 7 days",
    "30D": "Last 30 days",
    "90D": "Last 90 days",
    MTD: "Month to date",
    LAST_MONTH: "Last month",
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** A preset's inclusive Indian days. `now` is injectable so the test has a clock. */
export function windowOf(preset: WindowPreset, now: Date = new Date()): { from: string; to: string } {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const back = (days: number) => new Date(today.getTime() - days * 86_400_000);
    switch (preset) {
        case "7D":
            return { from: iso(back(6)), to: iso(today) };
        case "30D":
            return { from: iso(back(29)), to: iso(today) };
        case "90D":
            return { from: iso(back(89)), to: iso(today) };
        case "MTD":
            return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to: iso(today) };
        case "LAST_MONTH": {
            const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            return { from: iso(first), to: iso(last) };
        }
    }
}

/**
 * The grain a window should open at: a week of days, a quarter by week, a
 * year by month. The operator can override it; this is only the default.
 */
export function defaultGrain(from: string, to: string): Grain {
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    if (days <= 31) return "day";
    if (days <= 120) return "week";
    return "month";
}
