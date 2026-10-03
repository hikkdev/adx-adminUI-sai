import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * VA-2 — the competitor desk.
 *
 * What is pinned: a row reads as the agent typed it until the model has
 * looked, then as the model saw it; "Analyse" goes to the row's analyse
 * route and re-reads the desk; the chips send the analysed facet as the
 * backend wants it; the export goes through the authenticated blob door
 * with the desk's filters and lands as a download.
 */

const { service, blob, saved } = vi.hoisted(() => ({
    service: { analyse: vi.fn() },
    blob: vi.fn(),
    saved: [] as { filename: string; size: number }[],
}));

vi.mock("@/services/competitors", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/competitors")>();
    return { ...actual, competitorsService: { ...actual.competitorsService, ...service } };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: { ...actual.api, blob },
        saveBlob: (file: Blob, filename: string) => saved.push({ filename, size: file.size }),
    };
});

import { CompetitorsView, analysisLine } from "./competitors-view";
import type { Sighting } from "@/services/competitors";

const sighting = (over: Partial<Sighting> = {}): Sighting => ({
    id: "cs_1",
    agent: { id: "agt_1", displayId: "AGT-0007", name: "Meena" },
    photoFileId: "f_1",
    photoUrl: "http://api.test/api/v1/files/f_1",
    brand: "Zomato",
    category: "Food delivery",
    format: "HOARDING",
    note: "Opposite the metro exit",
    latitude: 12.97,
    longitude: 77.59,
    address: "5th Cross, Koramangala",
    city: "Bengaluru",
    capturedAt: "2026-09-23T08:35:00.000Z",
    analysis: null,
    analysedAt: null,
    createdAt: "2026-09-23T08:36:00.000Z",
    ...over,
});

const analysed = (): Sighting =>
    sighting({
        id: "cs_2",
        brand: "Swiggy",
        analysis: {
            brand: "Swiggy",
            category: "Food delivery",
            format: "BUS_SHELTER",
            estimatedSize: "12 x 6 ft",
            illuminated: true,
            condition: "GOOD",
            text: "Order now",
            summary: "A backlit Swiggy panel on a bus shelter.",
            confidence: 0.82,
            provider: "google",
            model: "gemini-2.5-pro",
            perceptualHash: "abcd",
        },
        analysedAt: "2026-09-23T09:00:00.000Z",
    });

const draw = (items: Sighting[], over: Partial<React.ComponentProps<typeof CompetitorsView>> = {}) => {
    const onQuery = vi.fn();
    const onChanged = vi.fn();
    render(
        <CompetitorsView
            data={{ page: { items, total: items.length, page: 1, pageSize: 50, counts: { ALL: items.length, ANALYSED: 1, UNANALYSED: 1 } }, brands: [{ brand: "Zomato", count: 1 }] }}
            query={{ page: 1, pageSize: 50 }}
            onQuery={onQuery}
            onChanged={onChanged}
            {...over}
        />,
    );
    return { onQuery, onChanged };
};

describe("the competitor desk", () => {
    it("reads a row as the agent typed it until the model has looked", () => {
        draw([sighting(), analysed()]);
        expect(screen.getByTestId("competitors-line-cs_1").textContent).toBe("Zomato · Hoarding");
        expect(screen.getByTestId("competitors-unanalysed-cs_1")).toBeTruthy();
        expect(screen.getByTestId("competitors-line-cs_2").textContent).toBe("Swiggy · Bus shelter · 12 x 6 ft");
        expect(screen.getByTestId("competitors-analysis-cs_2").textContent).toContain("A backlit Swiggy panel");
        expect(analysisLine(analysed())).toBe("Bus shelter · 12 x 6 ft · Lit · Good · 82% sure");
        expect(screen.getByTestId("competitors-analyse-cs_1").textContent).toContain("Analyse");
        expect(screen.getByTestId("competitors-analyse-cs_2").textContent).toContain("Analyse again");
    });

    it("asks the model through the row's own route and re-reads the desk", async () => {
        service.analyse.mockResolvedValueOnce(analysed());
        const { onChanged } = draw([sighting()]);
        fireEvent.click(screen.getByTestId("competitors-analyse-cs_1"));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(service.analyse).toHaveBeenCalledWith("cs_1");
    });

    it("sends the analysed facet the way the backend wants it", () => {
        const { onQuery } = draw([sighting()]);
        fireEvent.click(screen.getByText("Not yet analysed"));
        expect(onQuery).toHaveBeenLastCalledWith({ page: 1, pageSize: 50, analysed: false });
        fireEvent.click(screen.getByText("Analysed"));
        expect(onQuery).toHaveBeenLastCalledWith({ page: 1, pageSize: 50, analysed: true });
        fireEvent.click(screen.getByText("Everything"));
        expect(onQuery).toHaveBeenLastCalledWith({ page: 1, pageSize: 50, analysed: undefined });
    });

    it("exports through the authenticated door with the desk's filters and saves the file", async () => {
        blob.mockResolvedValueOnce({ blob: new Blob(["a,b\n1,2"]), filename: "competitor-sightings-2026-09-23.csv", contentType: "text/csv" });
        draw([sighting()], { query: { page: 1, pageSize: 50, brand: "Zomato", from: "2026-09-01" } });
        fireEvent.click(screen.getByTestId("competitors-export-csv"));
        await waitFor(() => expect(saved).toHaveLength(1));
        expect(blob).toHaveBeenCalledWith("/competitor-sightings/export?format=csv&brand=Zomato&from=2026-09-01");
        expect(saved[0]).toEqual({ filename: "competitor-sightings-2026-09-23.csv", size: 7 });
    });

    it("says so when nothing has been logged", () => {
        draw([]);
        expect(screen.getByText("No sightings yet")).toBeTruthy();
    });
});
