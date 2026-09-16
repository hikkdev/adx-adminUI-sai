import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
const blob = vi.fn();
const saveBlob = vi.fn();
vi.mock("@/lib/api-client", () => ({
    api: {
        get: (...args: unknown[]) => get(...args),
        post: (...args: unknown[]) => post(...args),
        blob: (...args: unknown[]) => blob(...args),
    },
    saveBlob: (...args: unknown[]) => saveBlob(...args),
}));
vi.mock("@/lib/api-config", () => ({
    isLive: () => true,
}));

import {
    analyticsTilesOf,
    breakdownQuery,
    breakdownSortState,
    daysBetween,
    foldDailySeries,
    insightChips,
    nextBreakdownSort,
    overviewService,
    rangeFor,
    seriesCardsFor,
    seriesQuery,
    shiftDay,
    todayIST,
    type AnalyticsSeries,
    type AnalyticsTiles,
    type Insight,
    type SeriesBucket,
} from "./overview";

/**
 * Lot G (Q112/Q115), package CG1 — the analytics set and the insights, as
 * the analytics page and the dashboard read them.
 *
 * What this file pins: the window a preset names ends today in India, the
 * series and its previous window fold by position with a missing previous
 * bucket read as null rather than a neighbour, money stays the decimal
 * string the API sent all the way to the tooltip, the segment's `series`
 * list decides which of the four cards are drawn, a header click asks the
 * server for the sort it names, the insight chips are ordered by severity
 * and coloured by it, and the CSV goes through the blob helper.
 */

const bucket = (day: string, over: Partial<SeriesBucket> = {}): SeriesBucket => ({
    bucket: day,
    start: `${day}T00:00:00.000+05:30`,
    end: `${day}T24:00:00.000+05:30`,
    gmvRecognised: "1000.00",
    bookingsAuthorised: { count: 2, value: "2500.00" },
    publisherEarnings: "850.00",
    advertiserSpend: "1200.00",
    agentCommissions: "40.00",
    onboardingStats: { publishersOnboarded: 1, advertisersOnboarded: 0, agentsActivated: 2 },
    ...over,
});

const figures = (gmv: string) => ({
    gmvRecognised: gmv,
    bookingsAuthorised: { count: 4, value: "5000.00" },
    publisherEarnings: "1700.00",
    advertiserSpend: "2400.00",
    agentCommissions: "80.00",
    onboardingStats: { publishersOnboarded: 2, advertisersOnboarded: 1, agentsActivated: 3 },
});

const series = (over: Partial<AnalyticsSeries> = {}): AnalyticsSeries => ({
    from: "2026-09-12",
    to: "2026-09-13",
    granularity: "day",
    segment: "ALL",
    filters: { category: null, city: null },
    series: [
        "gmvRecognised",
        "bookingsCount",
        "bookingsValue",
        "publisherEarnings",
        "advertiserSpend",
        "agentCommissions",
        "publishersOnboarded",
        "advertisersOnboarded",
        "agentsActivated",
    ],
    gmvSource: "CAMPAIGN_SPEND",
    window: { start: "", end: "" },
    previousWindow: { start: "", end: "" },
    buckets: [bucket("2026-09-12"), bucket("2026-09-13", { gmvRecognised: "1500.50" })],
    totals: figures("2500.50"),
    previous: { buckets: [bucket("2026-09-10", { gmvRecognised: "900.00" }), bucket("2026-09-11")], totals: figures("1900.00") },
    comparison: {
        gmvRecognised: { current: "2500.50", previous: "1900.00", deltaPct: "31.61" },
        bookingsCount: { current: 4, previous: 4, deltaPct: "0.00" },
        bookingsValue: { current: "5000.00", previous: "5000.00", deltaPct: "0.00" },
        publisherEarnings: { current: "1700.00", previous: "2000.00", deltaPct: "-15.00" },
        advertiserSpend: { current: "2400.00", previous: "0.00", deltaPct: null },
        agentCommissions: { current: "80.00", previous: "64.00", deltaPct: "25.00" },
        publishersOnboarded: { current: 2, previous: 1, deltaPct: "100.00" },
        advertisersOnboarded: { current: 1, previous: 0, deltaPct: null },
        agentsActivated: { current: 3, previous: 3, deltaPct: "0.00" },
    },
    ...over,
});

beforeEach(() => {
    get.mockReset();
    blob.mockReset();
    saveBlob.mockReset();
});

describe("the window", () => {
    it("names today in India, not in UTC", () => {
        // 13 Sep 2026 20:00 UTC is 14 Sep 01:30 IST.
        expect(todayIST(new Date("2026-09-13T20:00:00.000Z"))).toBe("2026-09-14");
        expect(todayIST(new Date("2026-09-13T18:00:00.000Z"))).toBe("2026-09-13");
    });

    it("ends a preset today and runs the named number of days inclusive", () => {
        expect(rangeFor("7D", "2026-09-13")).toEqual({ from: "2026-09-07", to: "2026-09-13" });
        expect(rangeFor("30D", "2026-09-13")).toEqual({ from: "2026-08-15", to: "2026-09-13" });
        expect(rangeFor("90D", "2026-09-13")).toEqual({ from: "2026-06-16", to: "2026-09-13" });
        expect(daysBetween("2026-08-15", "2026-09-13")).toBe(30);
        expect(daysBetween("2026-09-13", "2026-09-12")).toBe(0);
    });

    it("moves a day on the calendar across a month end", () => {
        expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
        expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    });
});

describe("the queries", () => {
    it("sends the series' facets and nothing that was not asked for", () => {
        expect(seriesQuery({ from: "2026-09-01", to: "2026-09-13" })).toBe("from=2026-09-01&to=2026-09-13");
        expect(seriesQuery({ from: "2026-09-01", to: "2026-09-13", granularity: "day", segment: "AGENTS", category: "OUTDOOR", city: " Mumbai " })).toBe(
            "from=2026-09-01&to=2026-09-13&granularity=day&segment=AGENTS&category=OUTDOOR&city=Mumbai"
        );
    });

    it("sends the breakdown's dimension, search, sort and page", () => {
        expect(breakdownQuery({ from: "2026-09-01", to: "2026-09-13", by: "publisher" })).toBe("from=2026-09-01&to=2026-09-13&by=publisher");
        expect(breakdownQuery({ from: "2026-09-01", to: "2026-09-13", by: "city", q: "ben", sort: "LABEL_ASC", page: 2, pageSize: 20 })).toBe(
            "from=2026-09-01&to=2026-09-13&by=city&q=ben&sort=LABEL_ASC&page=2&pageSize=20"
        );
    });

    it("asks a figure for the biggest first and flips on the second click; the label the other way round", () => {
        expect(nextBreakdownSort("GMV_DESC", "bookings")).toBe("BOOKINGS_DESC");
        expect(nextBreakdownSort("BOOKINGS_DESC", "bookings")).toBe("BOOKINGS_ASC");
        expect(nextBreakdownSort("GMV_DESC", "label")).toBe("LABEL_ASC");
        expect(nextBreakdownSort("LABEL_ASC", "label")).toBe("LABEL_DESC");
        expect(breakdownSortState("EARNINGS_ASC")).toEqual({ column: "earnings", dir: "asc" });
    });
});

describe("the series shaping", () => {
    it("folds each bucket with the previous window's bucket at the same position, money kept as strings", () => {
        const points = foldDailySeries(series());
        expect(points).toHaveLength(2);
        expect(points[0]).toMatchObject({
            bucket: "2026-09-12",
            label: "12 Sep",
            previousBucket: "2026-09-10",
            gmvRecognised: "1000.00",
            previousGmvRecognised: "900.00",
            gmv: 1000,
            previousGmv: 900,
            bookingsCount: 2,
            publisherEarnings: "850.00",
            earnings: 850,
            agentsActivated: 2,
        });
        expect(points[1]).toMatchObject({ gmvRecognised: "1500.50", gmv: 1500.5, previousGmv: 1000 });
    });

    it("reads a missing previous bucket as null rather than borrowing a neighbour", () => {
        const points = foldDailySeries(series({ previous: { buckets: [bucket("2026-09-10")], totals: figures("900.00") } }));
        expect(points[1].previousBucket).toBeNull();
        expect(points[1].previousGmv).toBeNull();
        expect(points[1].previousGmvRecognised).toBeNull();
    });

    it("draws the four cards for ALL, and only the segment's own for a narrower one", () => {
        const all = seriesCardsFor(series());
        expect(all.map((card) => card.kind)).toEqual(["PUBLISHER_EARNINGS", "ADVERTISER_SPEND", "AGENT_COMMISSIONS", "ONBOARDING"]);
        expect(all[0]).toMatchObject({ total: "₹1,700.00", delta: { text: "-15%", tone: "negative" } });
        expect(all[1].delta).toBeNull();
        expect(all[3].counts?.map((count) => [count.label, count.current])).toEqual([
            ["Publishers", 2],
            ["Advertisers", 1],
            ["Agents", 3],
        ]);

        const publishers = seriesCardsFor(series({ series: ["gmvRecognised", "publisherEarnings", "publishersOnboarded"] }));
        expect(publishers.map((card) => card.kind)).toEqual(["PUBLISHER_EARNINGS", "ONBOARDING"]);
        expect(publishers[1].counts?.map((count) => count.label)).toEqual(["Publishers"]);
    });

    it("prints the tiles from the server's figures and deltas", () => {
        const tiles: AnalyticsTiles = {
            from: "2026-08-15",
            to: "2026-09-13",
            window: { start: "", end: "" },
            previousWindow: { start: "", end: "" },
            gmvSource: "CAMPAIGN_SPEND",
            activeListings: { count: 1092, newInWindow: 80, previousNewInWindow: 16, delta: 64 },
            fillRate: { current: { pct: "71.00", bookedListingDays: 710, availableListingDays: 1000 }, previous: { pct: "73.10", bookedListingDays: 0, availableListingDays: 0 }, deltaPct: "-2.87" },
            gmvRecognised: { current: "1840000.00", previous: "1503268.00", deltaPct: "22.40" },
            takeRatePct: { current: "12.60", previous: "11.80", deltaPct: "6.78" },
            platformRevenue: { current: "0.00", previous: "0.00", deltaPct: null },
            bookingsAuthorised: { current: "0.00", previous: "0.00", deltaPct: null },
            activeCampaigns: { current: 0, previous: 0, deltaPct: null },
            kycPending: 0,
        };
        const stats = analyticsTilesOf(tiles, "30D");
        expect(stats.map((stat) => [stat.id, stat.value, stat.delta])).toEqual([
            ["gmv", "₹18,40,000.00", "+22.4%"],
            ["take", "12.6%", "+0.8pt"],
            ["listings", "1,092", "+64"],
            ["fill", "71%", "-2.1pt"],
        ]);
        expect(stats[0].label).toBe("GMV (30D)");
        // G13-B: the delta is the window's new listings against the previous window's.
        expect(stats[2].deltaTone).toBe("positive");
        expect(stats[2].hint).toBe("80 published in the window");
    });
});

describe("the insight chips", () => {
    const items: Insight[] = [
        { id: "GMV_VS_LAST_MONTH", key: "GMV_VS_LAST_MONTH", severity: "INFO", text: "GMV is up 12% on last month", href: "/analytics", value: 12, direction: "UP" },
        { id: "KYC_PAST_SLA", key: "KYC_PAST_SLA", severity: "CRITICAL", text: "14 KYC cases past the 48 h SLA", href: "/kyc", value: 14 },
        { id: "FRAUD_CASES_STALE", key: "FRAUD_CASES_STALE", severity: "WARN", text: "3 fraud cases open more than 7 days", href: "/disputes/fraud", value: 3 },
    ];

    it("orders CRITICAL, then WARN, then INFO, coloured by severity, opening the route the rule named", () => {
        expect(insightChips(items).map((chip) => [chip.key, chip.tone, chip.href])).toEqual([
            ["KYC_PAST_SLA", "danger", "/kyc"],
            ["FRAUD_CASES_STALE", "warning", "/disputes/fraud"],
            ["GMV_VS_LAST_MONTH", "info", "/analytics"],
        ]);
    });

    it("is empty for an empty or missing list, and reads an unknown severity as INFO", () => {
        expect(insightChips([])).toEqual([]);
        expect(insightChips(undefined)).toEqual([]);
        expect(insightChips([{ ...items[0], severity: "LOUD" as Insight["severity"] }])[0].tone).toBe("info");
    });

    it("reads the strip from /admin/overview/insights and tolerates an empty answer", async () => {
        get.mockResolvedValueOnce({ generatedAt: "2026-09-13T10:00:00.000Z", items });
        expect((await overviewService.insights()).items).toHaveLength(3);
        expect(get).toHaveBeenCalledWith("/admin/overview/insights");
        get.mockResolvedValueOnce(null);
        expect(await overviewService.insights()).toEqual({ generatedAt: "", items: [] });
    });

    it("carries the server's id on each chip, falling back to the key, and posts a dismissal to it (G13-B)", async () => {
        expect(insightChips(items).map((chip) => chip.id)).toEqual(["KYC_PAST_SLA", "FRAUD_CASES_STALE", "GMV_VS_LAST_MONTH"]);
        const legacy = { ...items[0], id: undefined as unknown as string };
        expect(insightChips([legacy])[0].id).toBe("GMV_VS_LAST_MONTH");

        post.mockResolvedValueOnce({ id: "KYC_PAST_SLA", dismissed: true, expiresAt: "2026-09-20T10:00:00.000Z" });
        const answer = await overviewService.dismissInsight("KYC_PAST_SLA");
        expect(post).toHaveBeenCalledWith("/admin/overview/insights/KYC_PAST_SLA/dismiss");
        expect(answer.dismissed).toBe(true);
    });
});

describe("the reads", () => {
    it("asks the series, the tiles and the breakdown at their routes", async () => {
        get.mockResolvedValue({ items: [], total: 0 });
        await overviewService.analyticsSeries({ from: "2026-09-01", to: "2026-09-13", granularity: "day", segment: "ALL" });
        expect(get).toHaveBeenLastCalledWith("/admin/overview/series?from=2026-09-01&to=2026-09-13&granularity=day&segment=ALL");
        await overviewService.analyticsTiles("2026-09-01", "2026-09-13");
        expect(get).toHaveBeenLastCalledWith("/admin/overview/tiles?from=2026-09-01&to=2026-09-13");
        const page = await overviewService.breakdown({ from: "2026-09-01", to: "2026-09-13", by: "agent", sort: "GMV_DESC", pageSize: 5 });
        expect(get).toHaveBeenLastCalledWith("/admin/overview/breakdown?from=2026-09-01&to=2026-09-13&by=agent&sort=GMV_DESC&pageSize=5");
        expect(page).toEqual({ items: [], total: 0, page: 1, pageSize: 5, counts: {} });
    });

    it("pulls the CSV through the blob helper and hands it to the browser under the server's name", async () => {
        const bytes = new Blob(["bucket,start,end\r\n"], { type: "text/csv" });
        blob.mockResolvedValueOnce({ blob: bytes, filename: "analytics-2026-09-01-2026-09-13-day.csv", contentType: "text/csv" });
        const result = await overviewService.exportCsv({ from: "2026-09-01", to: "2026-09-13", granularity: "day", segment: "PUBLISHERS" });
        expect(blob).toHaveBeenCalledWith("/admin/overview/export.csv?from=2026-09-01&to=2026-09-13&granularity=day&segment=PUBLISHERS");
        expect(saveBlob).toHaveBeenCalledWith(bytes, "analytics-2026-09-01-2026-09-13-day.csv");
        expect(result).toEqual({ filename: "analytics-2026-09-01-2026-09-13-day.csv", bytes: bytes.size });
    });

    it("names the file itself when the server sent no Content-Disposition", async () => {
        blob.mockResolvedValueOnce({ blob: new Blob([""]), filename: null, contentType: null });
        const result = await overviewService.exportCsv({ from: "2026-09-01", to: "2026-09-13" });
        expect(result.filename).toBe("analytics-2026-09-01-2026-09-13-day.csv");
    });
});
