import { api as http } from "@/lib/api-client";
import { isLive, type LiveDomain } from "@/lib/api-config";
import type { AdvertiserFunnel, KycQueueState, SupplyFunnel, Tone } from "@/types";
import { KYC_QUEUE_STATES, KYC_STATE_META } from "@/types";
import type { EmployeesOverview, WorkloadReport } from "@/services/employees";
import type { LeaderboardView } from "@/services/growth";
import { countDelta, moneyDelta, moneyAsNumber, shiftDay, todayIST, type Delta } from "@/services/overview";

/**
 * The Overview tab of every user section — package O-C over O-B's
 * `GET /section-overviews/:section?from&to&city`.
 *
 * One read per section, aggregates only: every window figure is
 * `{ value, previous, delta }` against the window of the same length
 * before it, every state figure (the KYC queue, who is suspended now)
 * carries `previous: null` because the platform keeps no history of
 * states, every series is one point per Indian day with the previous
 * window's days beside it, and every breakdown and top ten is on the list
 * contract. Money is a decimal string everywhere. The shapes here are the
 * wire's, named as the backend names them; what the console adds is the
 * window in the URL, the deltas as the tiles print them, and the console
 * route each row's `href` maps to.
 */

/* ------------------------------------------------------------------ */
/* The sections                                                        */
/* ------------------------------------------------------------------ */

// LH9: the Leads section joined the six user sections.
export const SECTIONS = ["publishers", "advertisers", "agents", "print-partners", "employees", "users", "leads"] as const;
export type Section = (typeof SECTIONS)[number];

export interface SectionMeta {
    label: string;
    /** The rail row — the overview now. */
    root: string;
    /** Where the table moved to. */
    directory: string;
    /** The section's KYC queue; null for users, who are logins and not parties. */
    kycQueue: string | null;
    /** Whether `?city=` narrows the read — employees have a region, not a city. */
    cityFilter: boolean;
    /** The live-domain flag the section's records are behind. */
    domain: LiveDomain;
}

export const SECTION_META: Record<Section, SectionMeta> = {
    publishers: { label: "Publishers", root: "/publishers", directory: "/publishers/directory", kycQueue: "/kyc", cityFilter: true, domain: "supply" },
    advertisers: { label: "Advertisers", root: "/advertisers", directory: "/advertisers/directory", kycQueue: "/kyc/advertisers", cityFilter: true, domain: "advertisers" },
    agents: { label: "Agents", root: "/agents", directory: "/agents/directory", kycQueue: "/kyc/agents", cityFilter: true, domain: "agents" },
    "print-partners": {
        label: "Print partners",
        root: "/print-partners",
        directory: "/print-partners/roster",
        kycQueue: "/kyc/print-partners",
        cityFilter: true,
        domain: "printPartners",
    },
    employees: { label: "Employees", root: "/employees", directory: "/employees/directory", kycQueue: "/kyc/employees", cityFilter: false, domain: "employees" },
    users: { label: "Users", root: "/users", directory: "/users/accounts", kycQueue: null, cityFilter: true, domain: "users" },
    // LH9: the list moved to `/leads/list` so the overview sits at the section's root like every other section's.
    leads: { label: "Leads", root: "/leads", directory: "/leads/list", kycQueue: null, cityFilter: true, domain: "leads" },
};

/* ------------------------------------------------------------------ */
/* The three shapes                                                    */
/* ------------------------------------------------------------------ */

export type Money = string;

/** A window figure against the previous window; a state figure carries nulls. */
export interface Figure {
    value: number;
    previous: number | null;
    delta: number | null;
}

export interface MoneyFigure {
    value: Money;
    previous: Money | null;
    delta: Money | null;
}

export interface DayPoint {
    day: string;
    value: number;
}

export interface MoneyDayPoint {
    day: string;
    value: Money;
}

/** Every day of the window, zeros filled, with the previous window's days beside it. */
export interface Series {
    days: DayPoint[];
    previous: DayPoint[];
    total: Figure;
}

export interface MoneySeries {
    days: MoneyDayPoint[];
    previous: MoneyDayPoint[];
    total: MoneyFigure;
}

export interface KycByState {
    awaitingDocuments: number;
    requested: number;
    pending: number;
    needsInfo: number;
    rejected: number;
    verified: number;
}

/** The list contract with the whole table on one page; no status facet, so `counts` is `{}`. */
export interface ListPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export interface CountRow {
    key: string;
    label: string;
    href: string | null;
    count: number;
}

/**
 * Lot X-B: a city row on a breakdown — keyed by the catalogue city's slug
 * (the section's `?city=` takes it), labelled from the catalogue, with the
 * key beside it; the rows typed under a town with no key are one row, key
 * `other`, label "Other (typed)", the raw strings under `typed` and no link.
 */
export interface CityRow {
    key: string;
    label: string;
    href: string | null;
    cityId: string | null;
    typed: string[];
    count: number;
}

export const OTHER_CITY_KEY = "other";

/** Whether a breakdown row is the "Other (typed)" bucket — the strings no catalogue city answers to. */
export const isOtherCityRow = (row: Pick<CityRow, "key" | "cityId">): boolean => row.key === OTHER_CITY_KEY && row.cityId === null;

/**
 * What the "Other (typed)" row says on hover — the strings it folds, in the
 * order the backend sent them (biggest first); null on a keyed city row,
 * which has nothing to explain.
 */
export function typedSpellingsHover(row: Pick<CityRow, "key" | "cityId" | "typed">): string | null {
    if (!isOtherCityRow(row)) return null;
    if (row.typed.length === 0) return "Typed under a town no catalogue city answers to.";
    return `Typed as ${row.typed.join(", ")} — no catalogue city answers to these. Add an alias or a city under Settings › Geographies.`;
}

export interface LabelledSumRow {
    key: string;
    label: string;
    displayId: string | null;
    href: string;
    amount: Money;
}

export interface LabelledCountRow {
    key: string;
    label: string;
    displayId: string | null;
    href: string;
    count: number;
}

export interface WindowOnWire {
    from: string;
    to: string;
    start: string;
    end: string;
    days: number;
}

interface Base {
    section: Section;
    window: WindowOnWire;
    previousWindow: WindowOnWire;
    city: string | null;
    generatedAt: string;
}

export interface PublishersOverview extends Base {
    section: "publishers";
    tiles: { total: Figure; newInWindow: Figure; active: Figure; kyc: KycByState; suspended: Figure; closed: Figure };
    funnel: SupplyFunnel;
    series: { newPublishers: Series; firstListingsPublished: Series; firstBookings: Series };
    breakdowns: {
        byCity: ListPage<CityRow & { listings: number; gmv: Money }>;
        byCategory: ListPage<{ key: string; label: string; href: string; publishers: number; listings: number }>;
        bySubscriptionTier: ListPage<CountRow>;
        byAgent: ListPage<LabelledCountRow>;
    };
    top: { byEarnings: ListPage<LabelledSumRow> };
    money: { earningsPaid: MoneyFigure; payoutsReleased: MoneyFigure };
}

export interface AdvertisersOverview extends Base {
    section: "advertisers";
    tiles: { total: Figure; newInWindow: Figure; active: Figure; kyc: KycByState; byIndustry: ListPage<CountRow> };
    funnel: AdvertiserFunnel;
    series: { newAdvertisers: Series; firstCampaigns: Series; spend: MoneySeries };
    breakdowns: {
        byCity: ListPage<CityRow & { spend: Money }>;
        byIndustry: ListPage<CountRow>;
        byPackageTier: ListPage<CountRow>;
        byAgent: ListPage<LabelledCountRow>;
    };
    top: { bySpend: ListPage<LabelledSumRow> };
    money: { walletBalanceHeld: MoneyFigure; topUps: MoneyFigure };
}

export interface AgentsOverview extends Base {
    section: "agents";
    tiles: {
        total: Figure;
        newInWindow: Figure;
        active: Figure;
        byRole: { publisherAgents: number; advertiserAgents: number };
        byTier: ListPage<CountRow>;
        kyc: KycByState;
        suspended: Figure;
    };
    series: { onboardingsDone: Series; visitsCompleted: Series; jobsCompleted: Series };
    breakdowns: { byCity: ListPage<CityRow>; byTier: ListPage<CountRow> };
    top: { byCommission: ListPage<LabelledSumRow>; leaderboard: LeaderboardView | null };
    money: { incentivesPaid: MoneyFigure };
}

export interface PrintPartnersOverview extends Base {
    section: "print-partners";
    tiles: { total: Figure; newInWindow: Figure; active: Figure; acceptingQuoteRequests: Figure; kyc: KycByState; byCity: ListPage<CityRow> };
    series: { quoteRequestsSent: Series; quotesReceived: Series; jobsCompleted: Series };
    breakdowns: { byCity: ListPage<CityRow>; byCapability: ListPage<CountRow> };
    top: { byJobs: ListPage<{ key: string; label: string; displayId: string | null; href: string; jobs: number; earnings: Money }> };
    averageTurnaroundDays: { value: number | null; previous: number | null; delta: number | null };
    awardsWon: { quotes: Figure; awarded: Figure; sharePct: string };
}

export interface EmployeesOverviewSection extends Base {
    section: "employees";
    overview: EmployeesOverview;
    tiles: { joined: Figure; kyc: KycByState; tenure: { under1y: number; from1to3y: number; over3y: number }; holidays: Figure };
    breakdowns: {
        byDepartment: ListPage<{ key: string; label: string; href: string; headcount: number; openRoles: number }>;
        byWorkMode: ListPage<CountRow>;
        byEmploymentType: ListPage<CountRow>;
        byRegion: ListPage<CountRow>;
    };
    workload: WorkloadReport;
}

export interface UsersOverview extends Base {
    section: "users";
    tiles: {
        total: Figure;
        newInWindow: Figure;
        active: Figure;
        byRole: { publisher: number; advertiser: number; agent: number; printPartner: number; admin: number; none: number };
        twoFactor: { admins: number; enrolled: number; sharePct: string };
        closed: Figure;
        closedInWindow: Figure;
        erasureRequestsOpen: Figure;
        contactsVerified: { verified: number; total: number; sharePct: string };
    };
    series: { signUps: Series; signIns: Series };
    breakdowns: { byRole: ListPage<CountRow>; byLanguage: ListPage<CountRow>; byCity: ListPage<CityRow> };
}

/* LH9: the Leads overview. */

/** A conversion row: the cohort's leads, how many converted / activated, the rate. */
export interface ConversionRow {
    key: string;
    label: string;
    href: string | null;
    leads: number;
    converted: number;
    activated: number;
    /** Two decimals, as the server prints it. */
    ratePct: string;
}

export interface ChannelRow {
    key: string;
    label: string;
    href: null;
    firstContact: number;
    engaged: number;
    converted: number;
}

export interface StageRow {
    key: string;
    label: string;
    count: number;
    value: Money | null;
    avgDaysInStage: number | null;
}

export interface LeadsOverview extends Base {
    section: "leads";
    tiles: {
        open: Figure;
        newInWindow: Figure;
        contacted: Figure;
        converted: Figure;
        activated: Figure;
        lost: Figure;
        byTemperature: ListPage<CountRow>;
    };
    /** The funnel over the window's cohort, as `/leads/funnel` answers it, the stages in the pipeline's order. */
    funnel: {
        byStage: StageRow[];
        totals: { leads: number; converted: number; activated: number; retained: number; lost: number; recycled: number };
        lossMix: { reason: string; count: number }[];
    };
    series: { newLeads: Series; conversions: Series; activations: Series };
    breakdowns: {
        bySource: ListPage<ConversionRow>;
        byAgent: ListPage<ConversionRow & { displayId: string | null }>;
        byCity: ListPage<CityRow & { converted: number; ratePct: string }>;
        byCategory: ListPage<ConversionRow>;
        byChannel: ListPage<ChannelRow>;
    };
    conversion: {
        timeToConvert: { meanDays: number | null; medianDays: number | null; previousMeanDays: number | null; previousMedianDays: number | null };
        costPerActivation: { value: Money | null; previous: Money | null; incentives: Money; topUps: Money; activations: number };
        pipelineValue: Money;
    };
    recycle: { recycled: Figure; convertedAfterRecycle: Figure; yieldPct: string };
    money: { incentives: MoneyFigure; topUps: MoneyFigure };
}

/** "5.7 days · median 5" — the time to convert, or what it is when nothing converted. */
export function timeToConvertLine(time: LeadsOverview["conversion"]["timeToConvert"]): string {
    if (time.meanDays === null) return "Nothing converted in this window";
    const mean = `${time.meanDays} ${time.meanDays === 1 ? "day" : "days"}`;
    return time.medianDays === null ? mean : `${mean} · median ${time.medianDays}`;
}

/** The day-count movement against the previous window as a Delta, for the tile; null when either side is empty. A fall in days is the good direction. */
export function daysDelta(current: number | null, previous: number | null): Delta | null {
    if (current === null || previous === null) return null;
    const diff = Math.round((current - previous) * 10) / 10;
    return { text: diff > 0 ? `+${diff} d` : diff < 0 ? `${diff} d` : "0", tone: diff < 0 ? "positive" : diff > 0 ? "negative" : "neutral" };
}

export type SectionOverviewOf<S extends Section> = S extends "publishers"
    ? PublishersOverview
    : S extends "advertisers"
      ? AdvertisersOverview
      : S extends "agents"
        ? AgentsOverview
        : S extends "print-partners"
          ? PrintPartnersOverview
          : S extends "employees"
            ? EmployeesOverviewSection
            : S extends "leads"
              ? LeadsOverview
              : UsersOverview;

/* ------------------------------------------------------------------ */
/* The window, in the URL                                              */
/* ------------------------------------------------------------------ */

/** The server's ceiling on one read, inclusive days. */
export const MAX_OVERVIEW_DAYS = 366;

export type WindowPreset = "7D" | "30D" | "90D" | "MONTH" | "CUSTOM";
export const WINDOW_PRESETS: readonly WindowPreset[] = ["7D", "30D", "90D", "MONTH", "CUSTOM"];
export const WINDOW_PRESET_LABEL: Record<WindowPreset, string> = {
    "7D": "Last 7 days",
    "30D": "Last 30 days",
    "90D": "Last 90 days",
    MONTH: "This month",
    CUSTOM: "Custom",
};

/** What the picker holds: the preset, the two inclusive days it names, and the city (empty for all). */
export interface OverviewWindow {
    preset: WindowPreset;
    from: string;
    to: string;
    city: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isPreset = (value: string | null): value is WindowPreset => WINDOW_PRESETS.includes(value as WindowPreset);

/** The inclusive days a preset names, ending today in India; "This month" opens on the 1st. */
export function presetRange(preset: Exclude<WindowPreset, "CUSTOM">, today: string): { from: string; to: string } {
    if (preset === "MONTH") return { from: `${today.slice(0, 7)}-01`, to: today };
    const days = preset === "7D" ? 7 : preset === "30D" ? 30 : 90;
    return { from: shiftDay(today, -(days - 1)), to: today };
}

/**
 * `?window=&from=&to=&city=` off the URL. A preset names its own days, so
 * only Custom reads `from` and `to`; a custom window missing either day
 * falls back to the last thirty. Nothing in the URL is the default window.
 */
export function windowFromQuery(params: URLSearchParams, today: string = todayIST()): OverviewWindow {
    const raw = params.get("window");
    const city = (params.get("city") ?? "").trim();
    const from = params.get("from");
    const to = params.get("to");
    if (raw === "CUSTOM" && from && to && ISO_DAY.test(from) && ISO_DAY.test(to)) return { preset: "CUSTOM", from, to, city };
    const preset: Exclude<WindowPreset, "CUSTOM"> = isPreset(raw) && raw !== "CUSTOM" ? raw : "30D";
    return { preset, ...presetRange(preset, today), city };
}

/** The URL for a window — the default (last thirty days, every city) writes nothing. */
export function windowQuery(window: OverviewWindow): string {
    const params = new URLSearchParams();
    if (window.preset === "CUSTOM") {
        params.set("window", "CUSTOM");
        params.set("from", window.from);
        params.set("to", window.to);
    } else if (window.preset !== "30D") {
        params.set("window", window.preset);
    }
    if (window.city) params.set("city", window.city);
    return params.toString();
}

/** Inclusive days between two `YYYY-MM-DD`; negative when `to` is before `from`. */
export function windowDays(window: Pick<OverviewWindow, "from" | "to">): number {
    const at = (day: string) => {
        const [y, m, d] = day.split("-").map(Number);
        return Date.UTC(y, m - 1, d) / 86_400_000;
    };
    return at(window.to) - at(window.from) + 1;
}

/** The server refuses a window of no days, or of more than a year. */
export function windowValid(window: Pick<OverviewWindow, "from" | "to">): boolean {
    const days = windowDays(window);
    return days >= 1 && days <= MAX_OVERVIEW_DAYS;
}

/** "Last 30 days" for a preset, "1 Sep 2026 – 14 Sep 2026" for a custom window. */
export function windowLabel(window: OverviewWindow): string {
    return window.preset === "CUSTOM" ? `${dayLong(window.from)} – ${dayLong(window.to)}` : WINDOW_PRESET_LABEL[window.preset];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Sep" from `2026-09-01` — the axis tick. */
export function dayShort(day: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]}` : day;
}

/** "1 Sep 2026" from `2026-09-01`. */
export function dayLong(day: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : day;
}

/* ------------------------------------------------------------------ */
/* Deltas, as the tiles print them                                     */
/* ------------------------------------------------------------------ */

/** The movement of a count figure: "+18" / "-3" / "0"; null for a state figure, which has no previous. */
export function figureDelta(figure: Figure): Delta | null {
    return figure.previous === null ? null : countDelta(figure.value, figure.previous);
}

/**
 * The movement of a money figure as a percentage of the previous window;
 * the plain difference when the previous window was nothing (a percentage
 * of zero is not a number); null for a state figure.
 */
export function moneyFigureDelta(figure: MoneyFigure): Delta | null {
    if (figure.previous === null) return null;
    const pct = moneyDelta(figure.value, figure.previous);
    if (pct) return pct;
    const now = moneyAsNumber(figure.value);
    return { text: now > 0 ? `+${figure.value}` : figure.value, tone: now > 0 ? "positive" : now < 0 ? "negative" : "neutral" };
}

/* ------------------------------------------------------------------ */
/* The KYC mix                                                         */
/* ------------------------------------------------------------------ */

const KYC_FIELD: Record<KycQueueState, keyof KycByState> = {
    AWAITING_DOCUMENTS: "awaitingDocuments",
    REQUESTED: "requested",
    PENDING: "pending",
    NEEDS_INFO: "needsInfo",
    REJECTED: "rejected",
    VERIFIED: "verified",
};

export interface MixItem {
    key: string;
    label: string;
    count: number;
    /** Where the segment leads; null when nothing on the console honours the cut. */
    href: string | null;
    tone: Tone;
}

/**
 * The six KYC states as segments, each leading to the section's queue with
 * the state chip preselected (`?state=pending`, the queue's own URL word).
 */
export function kycMixItems(kyc: KycByState, queue: string | null): MixItem[] {
    return KYC_QUEUE_STATES.map((state) => ({
        key: state,
        label: KYC_STATE_META[state].label,
        count: kyc[KYC_FIELD[state]],
        href: queue ? `${queue}?state=${state.toLowerCase()}` : null,
        tone: KYC_STATE_META[state].tone,
    }));
}

export const kycTotal = (kyc: KycByState): number => KYC_QUEUE_STATES.reduce((sum, state) => sum + kyc[KYC_FIELD[state]], 0);

/* ------------------------------------------------------------------ */
/* The series, shaped for the chart                                    */
/* ------------------------------------------------------------------ */

/** One day on an overview chart: the numbers place the marks, the strings are what the tooltip prints. */
export interface OverviewSeriesPoint {
    day: string;
    label: string;
    previousDay: string | null;
    value: number;
    previous: number | null;
    text: string;
    previousText: string | null;
}

/** A count series folded with its previous window, the previous day matched by position. */
export function foldSeries(series: Series): OverviewSeriesPoint[] {
    return series.days.map((point, index) => {
        const before = series.previous[index] ?? null;
        return {
            day: point.day,
            label: dayShort(point.day),
            previousDay: before?.day ?? null,
            value: point.value,
            previous: before?.value ?? null,
            text: point.value.toLocaleString("en-IN"),
            previousText: before ? before.value.toLocaleString("en-IN") : null,
        };
    });
}

/** A money series folded the same way, the rupees as floats for the axis only. */
export function foldMoneySeries(series: MoneySeries, format: (amount: Money) => string): OverviewSeriesPoint[] {
    return series.days.map((point, index) => {
        const before = series.previous[index] ?? null;
        return {
            day: point.day,
            label: dayShort(point.day),
            previousDay: before?.day ?? null,
            value: moneyAsNumber(point.value),
            previous: before ? moneyAsNumber(before.value) : null,
            text: format(point.value),
            previousText: before ? format(before.value) : null,
        };
    });
}

/* ------------------------------------------------------------------ */
/* Where a row leads                                                   */
/* ------------------------------------------------------------------ */

/**
 * The console route a row's `href` maps to — the backend names routes by
 * its own vocabulary, and a link is only drawn where the console honours
 * the cut:
 *
 * - a record (`/publishers/:id`, `/agents/:id`, …) opens as it is;
 * - a city (`/<section>?city=`) narrows THIS overview to the city, since
 *   no directory takes a city facet;
 * - a users role (`/users?role=`) opens the accounts directory, which
 *   keeps the role facet in its URL;
 * - a department (`/hr/departments/:id`) opens the console's department page;
 * - anything else (a listing category, an employee work mode) has no
 *   route that filters on it, so the row stays a label.
 */
export function consoleHref(section: Section, href: string | null, window: OverviewWindow): string | null {
    if (!href) return null;
    const [path, query = ""] = href.split("?");
    const params = new URLSearchParams(query);
    const record = /^\/(publishers|advertisers|agents|print-partners|users)\/[^/?]+$/;
    if (record.test(path) && !query) return href;
    // LH9: the leads list and the sources desk keep their facets in the URL, so those rows open as they are.
    if (section === "leads" && (path === "/leads/list" || path === "/leads/sources")) return href;
    if (path.startsWith("/hr/departments/")) return `/employees/departments/${path.slice("/hr/departments/".length)}`;
    const meta = SECTION_META[section];
    if (path === meta.root && params.has("city") && meta.cityFilter) {
        const qs = windowQuery({ ...window, city: params.get("city") ?? "" });
        return qs ? `${meta.root}?${qs}` : meta.root;
    }
    if (section === "users" && path === "/users" && params.has("role")) return `${meta.directory}?role=${encodeURIComponent(params.get("role") ?? "")}`;
    return null;
}

/* ------------------------------------------------------------------ */
/* The read                                                            */
/* ------------------------------------------------------------------ */

export const sectionOverviewReadsApi = (section: Section): boolean => isLive(SECTION_META[section].domain);

export function overviewPath(section: Section, window: Pick<OverviewWindow, "from" | "to" | "city">): string {
    const params = new URLSearchParams();
    params.set("from", window.from);
    params.set("to", window.to);
    if (window.city.trim()) params.set("city", window.city.trim());
    return `/section-overviews/${section}?${params.toString()}`;
}

export const sectionOverviewsService = {
    /** `GET /section-overviews/:section?from&to&city` — cached a minute server-side per section, window and city. */
    read: <S extends Section>(section: S, window: Pick<OverviewWindow, "from" | "to" | "city">): Promise<SectionOverviewOf<S>> =>
        http.get<SectionOverviewOf<S>>(overviewPath(section, window)),
};
