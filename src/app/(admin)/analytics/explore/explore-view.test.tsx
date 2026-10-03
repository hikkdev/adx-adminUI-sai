import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * AN-2: Explore.
 *
 * What is walked is the operator's actual loop: find a metric, add it, see
 * its total against the window before, and be stopped at five lines because
 * a sixth is unreadable.
 *
 * The chart is stubbed. It is recharts measuring a DOM that jsdom does not
 * lay out, and what matters here is which series it was handed, not the
 * pixels it would draw.
 */

vi.mock("@/components/charts/lazy", () => ({
    ExploreChart: ({ series }: { series: { key: string }[] }) => (
        <div data-testid="chart-stub">{series.map((line) => line.key).join(",")}</div>
    ),
}));

import { ExploreView, MAX_METRICS } from "./explore-view";
import type { MetricDef, MetricsSeries } from "@/services/metrics";

const metric = (over: Partial<MetricDef>): MetricDef => ({
    key: "gmvRecognised",
    name: "GMV recognised",
    description: "What left advertiser wallets for media.",
    family: "scale",
    kind: "MONEY",
    rollup: "SUM",
    dimensions: ["city"],
    grains: ["day", "week", "month"],
    source: "the ledger",
    ...over,
});

const CATALOGUE: MetricDef[] = [
    metric({}),
    metric({ key: "bookingsCount", name: "Bookings", kind: "COUNT" }),
    metric({
        key: "occupancyPct",
        name: "Occupancy",
        kind: "RATIO",
        rollup: "RECOMPUTE",
        family: "inventory",
        caveat: "Over-booked screens read above 100 %.",
    }),
    metric({ key: "taxWithheld", name: "Tax withheld", family: "money" }),
    metric({ key: "publisherEarnings", name: "Publisher earnings", family: "money" }),
    metric({ key: "agentCommissions", name: "Agent commissions", family: "workforce" }),
];

const SERIES: MetricsSeries = {
    from: "2026-09-01",
    to: "2026-09-07",
    grain: "day",
    metrics: ["gmvRecognised", "occupancyPct"],
    filters: { category: null, city: null },
    window: { start: "", end: "" },
    previousWindow: { start: "", end: "" },
    buckets: [
        { bucket: "2026-09-01", start: "", end: "", values: { gmvRecognised: { value: "1000.00" }, occupancyPct: { value: 20 } } },
        { bucket: "2026-09-02", start: "", end: "", values: { gmvRecognised: { value: "2000.00" }, occupancyPct: { value: 40 } } },
    ],
    totals: {
        gmvRecognised: { value: "3000.00" },
        occupancyPct: { value: 30, numerator: 3, denominator: 10 },
    },
    previous: {
        buckets: [],
        totals: { gmvRecognised: { value: "2000.00" }, occupancyPct: { value: 20, numerator: 2, denominator: 10 } },
    },
    computedAt: "2026-09-24T00:00:00.000Z",
};

function mount(over: Partial<React.ComponentProps<typeof ExploreView>> = {}) {
    const onChosenChange = vi.fn();
    render(
        <ExploreView
            catalogue={CATALOGUE}
            series={SERIES}
            chosen={["gmvRecognised", "occupancyPct"]}
            onChosenChange={onChosenChange}
            preset="30D"
            onPresetChange={vi.fn()}
            grain="day"
            onGrainChange={vi.fn()}
            loading={false}
            error={null}
            {...over}
        />,
    );
    return { onChosenChange };
}

describe("choosing metrics", () => {
    it("lists the catalogue grouped by family", () => {
        mount();
        const picker = screen.getByTestId("explore-picker");
        expect(within(picker).getByText("Scale and value")).toBeInTheDocument();
        expect(within(picker).getByText("Inventory health")).toBeInTheDocument();
        expect(within(picker).getByText("Money and risk")).toBeInTheDocument();
    });

    it("adds one that was not chosen", () => {
        const { onChosenChange } = mount();
        fireEvent.click(screen.getByTestId("metric-bookingsCount"));
        expect(onChosenChange).toHaveBeenCalledWith(["gmvRecognised", "occupancyPct", "bookingsCount"]);
    });

    it("removes one that was", () => {
        const { onChosenChange } = mount();
        fireEvent.click(screen.getByTestId("metric-occupancyPct"));
        expect(onChosenChange).toHaveBeenCalledWith(["gmvRecognised"]);
    });

    it("stops at five, because a sixth line is unreadable", () => {
        const five = CATALOGUE.slice(0, MAX_METRICS).map((entry) => entry.key);
        const { onChosenChange } = mount({ chosen: five });

        const sixth = screen.getByTestId(`metric-${CATALOGUE[MAX_METRICS]!.key}`);
        expect(sixth).toBeDisabled();
        fireEvent.click(sixth);
        expect(onChosenChange).not.toHaveBeenCalled();
    });

    it("still lets a chosen metric be removed at the limit", () => {
        const five = CATALOGUE.slice(0, MAX_METRICS).map((entry) => entry.key);
        const { onChosenChange } = mount({ chosen: five });
        fireEvent.click(screen.getByTestId(`metric-${five[0]}`));
        expect(onChosenChange).toHaveBeenCalledWith(five.slice(1));
    });

    it("narrows the list by name", () => {
        mount();
        fireEvent.change(screen.getByTestId("explore-search"), { target: { value: "occupancy" } });
        const picker = screen.getByTestId("explore-picker");
        expect(within(picker).getByText("Occupancy")).toBeInTheDocument();
        expect(within(picker).queryByText("Bookings")).not.toBeInTheDocument();
    });
});

describe("what the totals say", () => {
    it("reports a money metric's movement in per cent", () => {
        mount();
        const card = screen.getByTestId("total-gmvRecognised");
        expect(within(card).getByText("+50.0% vs previous")).toBeInTheDocument();
    });

    /* The rule worth a test of its own: 20 % to 30 % is ten points, not fifty
       per cent. Reporting the latter is how a board pack ends up wrong. */
    it("reports a ratio's movement in points, not per cent", () => {
        mount();
        const card = screen.getByTestId("total-occupancyPct");
        expect(within(card).getByText("+10.00 pts vs previous")).toBeInTheDocument();
        expect(within(card).queryByText(/50\.0% vs previous/)).not.toBeInTheDocument();
    });

    it("shows a ratio's two halves, so the percentage can be checked", () => {
        mount();
        const card = screen.getByTestId("total-occupancyPct");
        expect(within(card).getByText("3 of 10")).toBeInTheDocument();
    });

    it("prints the caveat under the figure it qualifies", () => {
        mount();
        expect(within(screen.getByTestId("total-occupancyPct")).getByText(/above 100/)).toBeInTheDocument();
    });

    it("says there is no comparison rather than inventing one", () => {
        mount({
            series: { ...SERIES, previous: { buckets: [], totals: { gmvRecognised: { value: "0.00" } } } },
        });
        expect(within(screen.getByTestId("total-gmvRecognised")).getByText("no comparison")).toBeInTheDocument();
    });
});

describe("the chart", () => {
    it("hands one line per chosen metric", () => {
        mount();
        expect(screen.getByTestId("chart-stub")).toHaveTextContent("gmvRecognised,occupancyPct");
    });

    it("asks for a metric before drawing anything", () => {
        mount({ chosen: [] });
        expect(screen.getByText("Pick a metric")).toBeInTheDocument();
        expect(screen.queryByTestId("chart-stub")).not.toBeInTheDocument();
    });

    it("shows the error instead of an empty chart when the read failed", () => {
        mount({ error: "The server did not answer." });
        expect(screen.getByText("The server did not answer.")).toBeInTheDocument();
        expect(screen.queryByTestId("chart-stub")).not.toBeInTheDocument();
    });
});
