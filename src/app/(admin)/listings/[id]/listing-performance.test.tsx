import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * The listing's Performance tab (3 Oct 2026) — the owner: "I don't see any
 * analytical stats for every listing".
 *
 * Pinned:
 *  - one read, `GET /listings/:id/insights?from=&to=`, over the overviews'
 *    window as the URL holds it;
 *  - the tiles: bookings, booked value, GMV, occupancy (with its movement
 *    in points), saves, enquiries, QR scans and the rating;
 *  - what the platform does not record is said, never drawn as a zero;
 *  - views of the spot's page and unique visitors once the read counts
 *    them (3 Oct 2026), and the old shape against a read that does not;
 *  - the day series through the overviews' series card, and the lifetime.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: { calls: [] as string[], insights: null as unknown },
    router: { replace: vi.fn(), search: "window=7D" },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/listings/lst_1",
    useSearchParams: () => new URLSearchParams(router.search),
}));
vi.mock("@/services/overview", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/overview")>();
    return { ...actual, todayIST: () => "2026-10-03" };
});
vi.mock("@/components/charts/lazy", () => ({ OverviewSeriesChart: () => <div data-testid="series-chart" /> }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const get = async (path: string) => {
        backend.calls.push(path);
        return backend.insights;
    };
    return { ...actual, api: { get, post: get, patch: get, put: get, delete: get } };
});

import { ListingPerformance, occupancyDelta } from "./listing-performance";

const figure = (value: number, previous: number) => ({ value, previous, delta: value - previous });
const moneyFigure = (value: string, previous: string) => ({ value, previous, delta: "0.00" });
const series = (total: number, previous: number) => ({ days: [{ day: "2026-10-03", value: total }], previous: [{ day: "2026-09-26", value: previous }], total: figure(total, previous) });
const moneySeries = (total: string) => ({ days: [{ day: "2026-10-03", value: total }], previous: [{ day: "2026-09-26", value: "0.00" }], total: moneyFigure(total, "0.00") });

const insights = () => ({
    listingId: "lst_1",
    from: "2026-09-27",
    to: "2026-10-03",
    previousFrom: "2026-09-20",
    previousTo: "2026-09-26",
    slotsTotal: 1,
    onMarketFrom: "2026-09-01",
    window: {
        saves: figure(4, 1),
        bookings: figure(2, 0),
        enquiries: figure(3, 3),
        scans: figure(17, 5),
        clicks: figure(9, 2),
        landingViews: figure(30, 10),
        bookedValue: moneyFigure("6000.00", "0.00"),
        gmv: moneyFigure("2400.00", "0.00"),
        occupancy: { current: { bookedSlotDays: 3, availableSlotDays: 7, rate: 3 / 7 }, previous: { bookedSlotDays: 1, availableSlotDays: 7, rate: 1 / 7 } },
        rating: { current: { average: "4.50", count: 2 }, previous: { average: null, count: 0 } },
    },
    lifetime: {
        saves: 12,
        bookings: 12,
        enquiries: 8,
        scans: 140,
        clicks: 60,
        landingViews: 210,
        bookedValue: "96000.00",
        gmv: "48000.00",
        occupancy: { bookedSlotDays: 20, availableSlotDays: 33, rate: 20 / 33 },
        rating: { average: "4.20", count: 5 },
    },
    series: {
        saves: series(4, 1),
        bookings: series(2, 0),
        enquiries: series(3, 3),
        scans: series(17, 5),
        clicks: series(9, 2),
        landingViews: series(30, 10),
        reviews: series(2, 0),
        occupiedSlots: series(3, 1),
        bookedValue: moneySeries("6000.00"),
        gmv: moneySeries("2400.00"),
    },
    untracked: [{ metric: "spotPageViews", label: "Marketplace views of the spot", reason: "Not recorded: no read keeps a view count." }],
});

beforeEach(() => {
    backend.calls = [];
    backend.insights = insights();
    router.search = "window=7D";
});

describe("the Performance tab", () => {
    it("reads the insights over the window the URL holds", async () => {
        render(<ListingPerformance listingId="lst_1" />);
        await screen.findByText("Bookings", { selector: "p" });
        expect(backend.calls).toEqual(["/listings/lst_1/insights?from=2026-09-27&to=2026-10-03"]);
        expect(screen.getByRole("button", { name: "Window" })).toHaveTextContent("Last 7 days");
    });

    it("draws the tiles, the occupancy in points, and the rating", async () => {
        render(<ListingPerformance listingId="lst_1" />);
        const occupancy = (await screen.findByText("Occupancy", { selector: "p" })).parentElement as HTMLElement;
        expect(occupancy).toHaveTextContent("42.9%");
        expect(occupancy).toHaveTextContent("+28.6 pts");
        expect(occupancy).not.toHaveTextContent("vs previous · 3 of 7");
        expect((screen.getByText("QR scans", { selector: "p" }).parentElement as HTMLElement)).toHaveTextContent("17");
        expect((screen.getByText("GMV earned", { selector: "p" }).parentElement as HTMLElement)).toHaveTextContent("₹2,400.00");
        expect((screen.getByText("Rating", { selector: "p" }).parentElement as HTMLElement)).toHaveTextContent("★ 4.5");
    });

    it("says what is not recorded rather than drawing a zero", async () => {
        render(<ListingPerformance listingId="lst_1" />);
        const untracked = await screen.findByTestId("untracked");
        expect(untracked).toHaveTextContent("Marketplace views of the spot: Not recorded");
    });

    it("draws the day series and the lifetime", async () => {
        render(<ListingPerformance listingId="lst_1" />);
        await screen.findByTestId("untracked");
        expect(screen.getAllByTestId("series-chart")).toHaveLength(6);
        const lifetime = screen.getByText("Lifetime").closest("div.rounded-lg") as HTMLElement;
        expect(lifetime).toHaveTextContent("₹96,000.00");
        expect(within(lifetime).getByText("Landing-page views").nextSibling).toHaveTextContent("210");
        expect(lifetime).toHaveTextContent("60.6% · 20 of 33 slot-days");
        expect(lifetime).toHaveTextContent("went live on 1 Sept 2026".replace("Sept", new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date("2026-09-01"))));
    });
});

describe("views of the spot's own page (3 Oct 2026)", () => {
    const counted = () => {
        const base = insights();
        return {
            ...base,
            window: { ...base.window, views: figure(120, 80), uniqueVisitors: figure(45, 30) },
            lifetime: { ...base.lifetime, views: 2400, uniqueVisitors: 910 },
            series: { ...base.series, views: series(120, 80), uniqueVisitors: series(45, 30) },
            // A read mid-change may still carry the old line; once counted it is not said.
            untracked: base.untracked,
        };
    };

    it("draws Spot-page views and Unique visitors as tiles, series and lifetime rows, and drops the not-recorded line", async () => {
        backend.insights = counted();
        render(<ListingPerformance listingId="lst_1" />);
        const views = (await screen.findByText("Spot-page views", { selector: "p" })).parentElement as HTMLElement;
        expect(views).toHaveTextContent("120");
        expect((screen.getByText("Unique visitors", { selector: "p" }).parentElement as HTMLElement)).toHaveTextContent("45");
        expect(screen.queryByTestId("untracked")).not.toBeInTheDocument();
        expect(screen.getAllByTestId("series-chart")).toHaveLength(8);
        const lifetime = screen.getByText("Lifetime").closest("div.rounded-lg") as HTMLElement;
        expect(within(lifetime).getByText("Spot-page views").nextSibling).toHaveTextContent("2,400");
        expect(within(lifetime).getByText("Unique visitors").nextSibling).toHaveTextContent("910");
    });

    it("keeps ten tiles in two even rows of five", async () => {
        backend.insights = counted();
        render(<ListingPerformance listingId="lst_1" />);
        const tile = (await screen.findByText("Spot-page views", { selector: "p" })).closest(".grid") as HTMLElement;
        expect(tile.className).toContain("xl:grid-cols-5");
        expect(tile.children).toHaveLength(10);
    });

    it("keeps the old shape against a read that does not count views yet", async () => {
        render(<ListingPerformance listingId="lst_1" />);
        await screen.findByTestId("untracked");
        expect(screen.queryByText("Spot-page views", { selector: "p" })).not.toBeInTheDocument();
    });
});

describe("the occupancy's movement", () => {
    it("is in points, and none when either window had nothing to book", () => {
        expect(occupancyDelta({ bookedSlotDays: 1, availableSlotDays: 2, rate: 0.5 }, { bookedSlotDays: 1, availableSlotDays: 4, rate: 0.25 })).toEqual({ text: "+25 pts", tone: "positive" });
        expect(occupancyDelta({ bookedSlotDays: 0, availableSlotDays: 0, rate: null }, { bookedSlotDays: 1, availableSlotDays: 4, rate: 0.25 })).toBeNull();
    });
});
