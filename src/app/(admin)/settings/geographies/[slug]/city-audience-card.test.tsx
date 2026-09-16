import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CityAudienceProfile } from "@/services/geo";

/**
 * Y-C — the Audience card on a city's page.
 *
 * What this pins: the card reads `GET /geo/cities/:slug/audience` for the
 * month picked (this one by default; the last three offered) and prints
 * the mean daily footfall, the mixes, "N of M spots have data", the
 * vendors in force with who each group came from, and the agreement
 * line; with no vendor configured it says "No panel backs this yet" and
 * points at the integrations card rather than draw an empty chart.
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string }[],
        answer: {} as unknown,
        reset() {
            this.calls = [];
            this.answer = {};
        },
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string) => {
        backend.calls.push({ method, path });
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string) => wrap("POST", path),
            patch: (path: string) => wrap("PATCH", path),
            put: (path: string) => wrap("PUT", path),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { CityAudienceCard } from "./city-audience-card";

const NOW = new Date("2026-09-15T10:00:00.000Z");

const profile = (over: Partial<CityAudienceProfile> = {}): CityAudienceProfile => ({
    city: "mysuru",
    period: "2026-09",
    provenance: "PANEL",
    provider: "AZIRA",
    vendors: ["GEOIQ", "AZIRA"],
    policy: {
        footfall: { primary: "AZIRA", fallback: true, blend: "AVERAGE" },
        demographics: { primary: "GEOIQ", fallback: true },
        affinities: { primary: "GEOIQ", fallback: true },
    },
    provenanceByField: { footfall: "BLENDED", demographics: "GEOIQ", affinities: null },
    agreement: { footfall: 0.88 },
    coverage: { spots: 5, withSnapshot: 3, ratio: 0.6 },
    samplePoints: null,
    footfall: { daily: 12_480, byHour: Array.from({ length: 24 }, (_, hour) => (hour >= 8 && hour <= 20 ? 6 : 2)), byWeekday: [14, 14, 14, 14, 15, 15, 14] },
    demographics: {
        ageBands: [
            { label: "18–24", share: 31.2 },
            { label: "25–34", share: 40.1 },
            { label: "35+", share: 28.7 },
        ],
        gender: [
            { label: "Female", share: 47 },
            { label: "Male", share: 53 },
        ],
        incomeBands: null,
        affinities: null,
    },
    basis: "GEOIQ + AZIRA panels, blended, on 3 of 5 live spots, 2026-09; mixes weighted by footfall",
    computedAt: "2026-09-15T10:00:00.000Z",
    ...over,
});

beforeEach(() => backend.reset());

describe("the city audience card", () => {
    it("prints the mean footfall, the mixes, the coverage, the vendors and the agreement from the profile", async () => {
        backend.answer = profile();
        render(<CityAudienceCard slug="mysuru" cityName="Mysuru" now={NOW} />);
        const card = screen.getByTestId("city-audience");
        await waitFor(() => expect(card).toHaveTextContent("12,480"));
        expect(backend.calls).toEqual([{ method: "GET", path: "/geo/cities/mysuru/audience?period=2026-09" }]);

        expect(card).toHaveTextContent("people a day, mean per catchment");
        expect(within(card).getByTestId("coverage")).toHaveTextContent("3 of 5 live spots have data");
        expect(within(card).getByTestId("agreement")).toHaveTextContent("Both vendors agree within 12% on daily footfall");
        expect(card).toHaveTextContent("In force: GeoIQ + Azira");
        /* Provenance per group: the footfall blended, the demographics GeoIQ's, the affinities nobody's. */
        expect(within(card).getAllByTestId("provenance-BLENDED").length).toBeGreaterThan(0);
        expect(within(card).getAllByTestId("provenance-GEOIQ").length).toBeGreaterThan(0);
        expect(within(card).getAllByTestId("provenance-none").length).toBeGreaterThan(0);
        /* The mixes as shares; a null group says so. */
        expect(within(card).getByRole("img", { name: /Age: 18–24 31.2%/ })).toBeInTheDocument();
        expect(card).toHaveTextContent("Female");
        expect(card).toHaveTextContent("Not provided.");
        expect(card).toHaveTextContent("Footfall: Azira, averaged with GeoIQ when both answer");
        expect(within(card).getByRole("combobox", { name: "Month" })).toHaveTextContent("September 2026");
    });

    it("says no panel backs the city when no vendor is configured, and where to switch one on", async () => {
        backend.answer = profile({
            provider: "NONE",
            vendors: [],
            policy: null,
            provenanceByField: { footfall: null, demographics: null, affinities: null },
            agreement: { footfall: null },
            coverage: { spots: 5, withSnapshot: 0, ratio: 0 },
            footfall: { daily: null, byHour: null, byWeekday: null },
            demographics: { ageBands: null, gender: null, incomeBands: null, affinities: null },
            basis: "No audience vendor is configured",
        });
        render(<CityAudienceCard slug="mysuru" cityName="Mysuru" now={NOW} />);
        const card = screen.getByTestId("city-audience");
        await waitFor(() => expect(card).toHaveTextContent("No panel backs this yet"));
        expect(within(card).getByRole("link", { name: "Integrations › Audience data" })).toHaveAttribute("href", "/settings/integrations");
        expect(within(card).queryByTestId("coverage")).toBeNull();
    });

    it("re-reads for the month picked, and reports the sample grid when it is on", async () => {
        backend.answer = profile({ samplePoints: { configured: 16, asked: 16, withSnapshot: 9 } });
        render(<CityAudienceCard slug="mysuru" cityName="Mysuru" now={NOW} />);
        const card = screen.getByTestId("city-audience");
        await waitFor(() => expect(within(card).getByTestId("sample-points")).toHaveTextContent("Sample grid: 9 of 16 points answered (16 configured)"));

        fireEvent.keyDown(within(card).getByRole("combobox", { name: "Month" }), { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: "July 2026" }));
        await waitFor(() => expect(backend.calls).toContainEqual({ method: "GET", path: "/geo/cities/mysuru/audience?period=2026-07" }));
    });
});
