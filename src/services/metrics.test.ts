import { describe, expect, it } from "vitest";
import { byFamily, defaultGrain, deltaOf, formatMetric, isPointsDelta, seriesPath, windowOf, type MetricDef } from "./metrics";

/**
 * AN-2: the reading rules on the console side.
 *
 * Two of these matter more than they look. A ratio's movement is in points,
 * not per cent — occupancy from 20 % to 30 % rose ten points, and reporting
 * "+50 %" is how a board pack ends up wrong. And the grain follows the
 * window's length by default, because ninety daily ticks is not a chart.
 */

const def = (over: Partial<MetricDef>): MetricDef => ({
    key: "test",
    name: "Test",
    description: "A metric.",
    family: "scale",
    kind: "COUNT",
    rollup: "SUM",
    dimensions: [],
    grains: ["day", "week", "month"],
    source: "the test",
    ...over,
});

describe("the series path", () => {
    it("joins the metrics and leaves blanks off", () => {
        expect(seriesPath({ from: "2026-09-01", to: "2026-09-07", grain: "day", metrics: ["a", "b"] })).toBe(
            "/admin/analytics/series?metrics=a%2Cb&from=2026-09-01&to=2026-09-07&grain=day",
        );
    });

    it("carries a city and a category when they are set", () => {
        const path = seriesPath({ from: "2026-09-01", to: "2026-09-07", grain: "week", metrics: ["a"], city: "bengaluru", category: "INDOOR" });
        expect(path).toContain("city=bengaluru");
        expect(path).toContain("category=INDOOR");
    });
});

describe("how a figure prints", () => {
    it("prints a ratio as a percentage with two places", () => {
        expect(formatMetric(def({ kind: "RATIO" }), { value: 10.714 })).toBe("10.71%");
    });

    it("prints an absent figure as a dash rather than zero", () => {
        expect(formatMetric(def({ kind: "MONEY" }), undefined)).toBe("—");
    });
});

describe("comparing with the window before", () => {
    it("reports a ratio in points, never in per cent", () => {
        expect(isPointsDelta(def({ kind: "RATIO" }))).toBe(true);
        expect(isPointsDelta(def({ kind: "MONEY" }))).toBe(false);
    });

    it("answers null rather than dividing by nothing", () => {
        expect(deltaOf({ value: 5 }, { value: 0 })).toBeNull();
    });

    it("gives the percentage change for a level", () => {
        expect(deltaOf({ value: 150 }, { value: 100 })).toBeCloseTo(50, 6);
    });
});

describe("the window and its grain", () => {
    const now = new Date("2026-09-24T10:00:00Z");

    it("counts seven days inclusive, ending today", () => {
        expect(windowOf("7D", now)).toEqual({ from: "2026-09-18", to: "2026-09-24" });
    });

    it("starts the month to date on the first", () => {
        expect(windowOf("MTD", now)).toEqual({ from: "2026-09-01", to: "2026-09-24" });
    });

    it("gives last month its own first and last day", () => {
        expect(windowOf("LAST_MONTH", now)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    });

    it("opens a short window by day, a quarter by week and a year by month", () => {
        expect(defaultGrain("2026-09-01", "2026-09-07")).toBe("day");
        expect(defaultGrain("2026-07-01", "2026-09-28")).toBe("week");
        expect(defaultGrain("2025-10-01", "2026-09-30")).toBe("month");
    });
});

describe("the picker's grouping", () => {
    it("groups by family and keeps the families in their own order", () => {
        const groups = byFamily([
            def({ key: "a", family: "money" }),
            def({ key: "b", family: "scale" }),
            def({ key: "c", family: "money" }),
        ]);
        expect(groups.map((group) => group.family)).toEqual(["scale", "money"]);
        expect(groups[1]!.metrics.map((metric) => metric.key)).toEqual(["a", "c"]);
    });

    it("leaves out a family nothing matched", () => {
        expect(byFamily([def({ family: "trust" })]).map((group) => group.family)).toEqual(["trust"]);
    });
});
