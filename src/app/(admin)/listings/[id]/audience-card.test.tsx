import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ListingAudience } from "@/services/listings";

/**
 * Y-C — the Audience card on a listing's page.
 *
 * What this pins: the card reads `GET /listings/:id/audience` for the
 * month picked and labels each section with its provenance — one vendor,
 * "Both, blended", or "Not provided" — prints the agreement line when
 * both vendors gave a daily figure, names a vendor that could not answer
 * with its reason, and shows each vendor's own answer only behind the
 * "By vendor" toggle; with no vendor configured it says so.
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

import { ListingAudienceCard } from "./audience-card";

const NOW = new Date("2026-09-15T10:00:00.000Z");

const geoiq = {
    footfall: { daily: 11_000, byHour: null, byWeekday: null },
    demographics: {
        ageBands: [
            { label: "18–24", share: 30 },
            { label: "25+", share: 70 },
        ],
        gender: [
            { label: "Female", share: 48 },
            { label: "Male", share: 52 },
        ],
        incomeBands: [{ label: "High", share: 100 }],
        affinities: [{ label: "Sports", share: 60 }],
    },
    provenance: "PANEL" as const,
    vendor: "GEOIQ" as const,
    period: "2026-09",
    radiusM: 500,
    fetchedAt: "2026-09-02T08:00:00.000Z",
};

const azira = {
    footfall: { daily: 13_000, byHour: Array.from({ length: 24 }, () => 4.2), byWeekday: [14, 14, 14, 14, 15, 15, 14] },
    demographics: { ageBands: null, gender: null, incomeBands: null, affinities: null },
    provenance: "PANEL" as const,
    vendor: "AZIRA" as const,
    period: "2026-09",
    radiusM: 500,
    fetchedAt: "2026-09-03T08:00:00.000Z",
};

const blended = (over: Partial<ListingAudience> = {}): ListingAudience => ({
    listingId: "lst_1",
    period: "2026-09",
    provider: "AZIRA",
    providers: ["GEOIQ", "AZIRA"],
    audience: {
        footfall: { daily: 12_000, byHour: azira.footfall.byHour, byWeekday: azira.footfall.byWeekday },
        demographics: geoiq.demographics,
        provenance: "PANEL",
        vendor: "AZIRA",
        period: "2026-09",
        radiusM: 500,
        fetchedAt: "2026-09-03T08:00:00.000Z",
        provenanceByField: { footfall: "BLENDED", demographics: "GEOIQ", affinities: "GEOIQ" },
        vendors: ["GEOIQ", "AZIRA"],
        agreement: { footfall: 0.846 },
        rawByVendor: { GEOIQ: geoiq, AZIRA: azira },
    },
    basis: "GEOIQ + AZIRA panels, blended, for the 500 m catchment, 2026-09 (stored)",
    cached: true,
    unavailable: [],
    ...over,
});

beforeEach(() => backend.reset());

describe("the listing audience card", () => {
    it("labels each section with its provenance, prints the agreement, and hides the raw answers behind By vendor", async () => {
        backend.answer = blended();
        render(<ListingAudienceCard listingId="lst_1" now={NOW} />);
        const card = screen.getByTestId("listing-audience");
        await waitFor(() => expect(card).toHaveTextContent("12,000"));
        expect(backend.calls).toEqual([{ method: "GET", path: "/listings/lst_1/audience?period=2026-09" }]);

        expect(card).toHaveTextContent("GeoIQ + Azira");
        expect(card).toHaveTextContent("stored");
        expect(card).toHaveTextContent("people a day, in the 500 m catchment");
        /* Footfall blended, demographics and affinities GeoIQ's. */
        expect(within(card).getAllByTestId("provenance-BLENDED")).toHaveLength(1);
        expect(within(card).getAllByTestId("provenance-GEOIQ")).toHaveLength(2);
        expect(within(card).queryByTestId("provenance-none")).toBeNull();
        expect(within(card).getByTestId("agreement")).toHaveTextContent("Both vendors agree within 15.4% on daily footfall");
        expect(within(card).getByRole("img", { name: /By weekday/ })).toBeInTheDocument();

        /* The raw answers wait behind the toggle. */
        expect(within(card).queryByTestId("by-vendor")).toBeNull();
        fireEvent.click(within(card).getByRole("switch", { name: "By vendor" }));
        const raw = within(card).getByTestId("by-vendor");
        expect(within(raw).getByTestId("raw-GEOIQ")).toHaveTextContent("11,000");
        expect(within(raw).getByTestId("raw-GEOIQ")).toHaveTextContent("Sports 60%");
        expect(within(raw).getByTestId("raw-AZIRA")).toHaveTextContent("13,000");
        expect(within(raw).getByTestId("raw-AZIRA")).toHaveTextContent("by hour, by weekday");
        expect(within(raw).getByTestId("raw-AZIRA")).toHaveTextContent("not provided");
    });

    it("names a vendor that could not answer, and a section nobody provided", async () => {
        backend.answer = blended({
            audience: {
                ...blended().audience!,
                footfall: { daily: 11_000, byHour: null, byWeekday: null },
                provenanceByField: { footfall: "GEOIQ", demographics: "GEOIQ", affinities: null },
                vendors: ["GEOIQ"],
                agreement: { footfall: null },
                rawByVendor: { GEOIQ: geoiq },
            },
            cached: false,
            unavailable: [{ vendor: "AZIRA", reason: "Azira is rate-limiting requests; try again shortly." }],
        });
        render(<ListingAudienceCard listingId="lst_1" now={NOW} />);
        const card = screen.getByTestId("listing-audience");
        await waitFor(() => expect(card).toHaveTextContent("11,000"));
        expect(within(card).getByTestId("unavailable")).toHaveTextContent("Azira could not answer: Azira is rate-limiting requests");
        expect(within(card).queryByTestId("agreement")).toBeNull();
        expect(within(card).getAllByTestId("provenance-none")).toHaveLength(1);
        fireEvent.click(within(card).getByRole("switch", { name: "By vendor" }));
        expect(within(card).getByTestId("raw-AZIRA")).toHaveTextContent("No stored answer for this month.");
    });

    it("says no panel backs the spot when no vendor is configured", async () => {
        backend.answer = blended({ provider: "NONE", providers: [], audience: null, basis: "No audience vendor is configured", cached: false });
        render(<ListingAudienceCard listingId="lst_1" now={NOW} />);
        const card = screen.getByTestId("listing-audience");
        await waitFor(() => expect(card).toHaveTextContent("No panel backs this yet"));
        expect(within(card).queryByRole("switch", { name: "By vendor" })).toBeNull();
    });
});
