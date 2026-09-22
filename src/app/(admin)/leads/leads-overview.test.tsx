import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * LH9 — the Leads overview over `GET /section-overviews/leads`.
 *
 * What is pinned: the page reads the section's one route with the window
 * (no `/leads` list read); the tiles print the window's movement, the time
 * to convert as a mean and a median with a fall in days read as good, and
 * the cost per activation with its arithmetic; the funnel by stage carries
 * the pipeline value; the temperature mix opens the list with the facet
 * on; the five conversion tables print their rates and link where the
 * console honours the cut (a category to the list, a source to the desk,
 * an agent to their page, a channel nowhere); the recycle yield.
 */

const { backend, router } = vi.hoisted(() => ({
    backend: { calls: [] as string[] },
    router: { replace: vi.fn(), push: vi.fn(), search: "" },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => "/leads",
    useSearchParams: () => new URLSearchParams(router.search),
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/use-now", () => ({ useNow: () => Date.parse("2026-09-22T10:00:00.000Z") }));

vi.mock("@/components/charts/lazy", () => ({
    OverviewSeriesChart: () => <div data-testid="series-chart" />,
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const list = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 100, counts: {} });
    const figure = (value: number, previous: number) => ({ value, previous, delta: value - previous });
    const series = (total: number, previous: number) => ({ days: [], previous: [], total: figure(total, previous) });
    const overview = {
        section: "leads",
        window: { from: "2026-08-24", to: "2026-09-22", start: "", end: "", days: 30 },
        previousWindow: { from: "2026-07-25", to: "2026-08-23", start: "", end: "", days: 30 },
        city: null,
        generatedAt: "2026-09-22T10:00:00.000Z",
        tiles: {
            open: { value: 42, previous: null, delta: null },
            newInWindow: figure(31, 20),
            contacted: figure(18, 12),
            converted: figure(6, 4),
            activated: figure(3, 1),
            lost: figure(5, 7),
            byTemperature: list([
                { key: "HOT", label: "Hot", href: "/leads/list?temperature=HOT", count: 9 },
                { key: "WARM", label: "Warm", href: "/leads/list?temperature=WARM", count: 20 },
                { key: "COLD", label: "Cold", href: "/leads/list?temperature=COLD", count: 13 },
            ]),
        },
        funnel: {
            byStage: [
                { key: "SOURCED", label: "Sourced", count: 4, value: null, avgDaysInStage: 2 },
                { key: "SCORED", label: "Scored", count: 10, value: "40000.00", avgDaysInStage: 5.5 },
                { key: "CONTACTED", label: "Contacted", count: 8, value: "32000.00", avgDaysInStage: 3 },
                { key: "CONVERTED", label: "Converted", count: 6, value: "24000.00", avgDaysInStage: null },
                { key: "LOST", label: "Lost", count: 5, value: null, avgDaysInStage: 1 },
            ],
            totals: { leads: 31, converted: 6, activated: 3, retained: 0, lost: 5, recycled: 0 },
            lossMix: [{ reason: "PRICE", count: 3 }, { reason: "TIMING", count: 2 }],
        },
        series: { newLeads: series(31, 20), conversions: series(6, 4), activations: series(3, 1) },
        breakdowns: {
            bySource: list([
                { key: "google-places", label: "Google Places", href: "/leads/sources?key=google-places", leads: 20, converted: 4, activated: 2, ratePct: "20.00" },
                { key: "none", label: "No source", href: null, leads: 11, converted: 2, activated: 1, ratePct: "18.18" },
            ]),
            byAgent: list([{ key: "agt_1", label: "Asha Rao", displayId: "AG-0001", href: "/agents/agt_1", leads: 12, converted: 4, activated: 2, ratePct: "33.33" }]),
            byCity: list([{ key: "bengaluru", label: "Bengaluru", href: "/leads?city=bengaluru", cityId: "city_blr", typed: [], count: 25, converted: 5, ratePct: "20.00" }]),
            byCategory: list([{ key: "Wall", label: "Wall", href: "/leads/list?category=Wall", leads: 14, converted: 3, activated: 2, ratePct: "21.43" }]),
            byChannel: list([{ key: "WHATSAPP", label: "WhatsApp", href: null, firstContact: 10, engaged: 6, converted: 3 }]),
        },
        conversion: {
            timeToConvert: { meanDays: 5.7, medianDays: 5, previousMeanDays: 7.2, previousMedianDays: 6 },
            costPerActivation: { value: "650.00", previous: "700.00", incentives: "1750.00", topUps: "200.00", activations: 3 },
            pipelineValue: "96000.00",
        },
        recycle: { recycled: figure(4, 2), convertedAfterRecycle: figure(1, 0), yieldPct: "25.00" },
        money: { incentives: { value: "1750.00", previous: "500.00", delta: "1250.00" }, topUps: { value: "200.00", previous: "0.00", delta: "200.00" } },
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (path.startsWith("/section-overviews/leads")) return overview;
                throw new Error(`unexpected GET ${path}`);
            },
        },
    };
});

import { LeadsOverviewView } from "./leads-overview";

beforeEach(() => {
    backend.calls = [];
    router.search = "";
});

describe("the leads overview", () => {
    it("reads the section route once with the window and never the list, and draws the tiles off it", async () => {
        render(<LeadsOverviewView />);
        await waitFor(() => expect(screen.getByText("Open now")).toBeInTheDocument());

        const reads = backend.calls.filter((path) => path.startsWith("/section-overviews/leads"));
        expect(reads).toHaveLength(1);
        expect(reads[0]).toMatch(/^\/section-overviews\/leads\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/);
        expect(backend.calls.some((path) => path === "/leads" || path.startsWith("/leads?"))).toBe(false);

        expect(screen.getByText("42")).toBeInTheDocument();
        expect(screen.getAllByText("31").length).toBeGreaterThan(0);
        // Time to convert: mean and median, and a fall of 1.5 days read as the good direction.
        expect(screen.getByText("5.7 days · median 5")).toBeInTheDocument();
        expect(screen.getByText("-1.5 d")).toBeInTheDocument();
        // Cost per activation with its arithmetic.
        expect(screen.getByText("₹650.00")).toBeInTheDocument();
        expect(screen.getByText(/₹1,750.00 rewards \+ ₹200.00 top-ups over 3 activations/)).toBeInTheDocument();
    });

    it("draws the funnel with the pipeline value, the temperature mix into the list, the stage table and the recycle yield", async () => {
        render(<LeadsOverviewView />);
        await waitFor(() => expect(screen.getByText("Funnel by stage")).toBeInTheDocument());
        expect(screen.getByText(/pipeline worth ₹96,000\.00/)).toBeInTheDocument();
        const hot = screen.getByRole("link", { name: /Hot/ });
        expect(hot).toHaveAttribute("href", "/leads/list?temperature=HOT");
        const stage = within(screen.getByTestId("leads-stage-SCORED"));
        expect(stage.getByText("₹40,000.00")).toBeInTheDocument();
        expect(stage.getByText("5.5")).toBeInTheDocument();
        expect(screen.getByText("Recycle yield")).toBeInTheDocument();
        expect(screen.getByText("25.00%")).toBeInTheDocument();
        expect(screen.getByText("1 of 4 recycled leads converted since")).toBeInTheDocument();
        expect(screen.getByText("Price")).toBeInTheDocument();
    });

    it("prints the five conversion tables with their rates and links only where the console honours the cut", async () => {
        render(<LeadsOverviewView />);
        await waitFor(() => expect(screen.getByText("Conversion by source")).toBeInTheDocument());
        expect(screen.getByRole("link", { name: "Google Places" })).toHaveAttribute("href", "/leads/sources?key=google-places");
        expect(screen.queryByRole("link", { name: "No source" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Asha Rao/ })).toHaveAttribute("href", "/agents/agt_1");
        expect(screen.getByRole("link", { name: "Wall" })).toHaveAttribute("href", "/leads/list?category=Wall");
        expect(screen.getByRole("link", { name: "Bengaluru" })).toHaveAttribute("href", expect.stringMatching(/^\/leads\?/));
        expect(screen.queryByRole("link", { name: "WhatsApp" })).not.toBeInTheDocument();
        expect(screen.getByText("33.33%")).toBeInTheDocument();
        expect(screen.getByText("21.43%")).toBeInTheDocument();
    });
});
