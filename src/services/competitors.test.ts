import { describe, expect, it } from "vitest";
import { competitorsService, formatLabel, sightingLine, sightingsSearch, type Sighting } from "./competitors";

/**
 * VA-2: the competitor desk's reads — the query string the list is asked
 * with, the export door, and the one-line reading of a sighting that prefers
 * what the model saw when it has looked and what the agent typed when it
 * has not.
 */

const sighting = (over: Partial<Sighting> = {}): Sighting => ({
    id: "cs_1",
    agent: { id: "agt_1", displayId: "AGT-0007", name: "Meena" },
    photoFileId: "f_1",
    photoUrl: "http://api.test/api/v1/files/f_1",
    brand: "Zomato",
    category: null,
    format: "HOARDING",
    note: null,
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

describe("the list query", () => {
    it("sends only what was asked, and always a page", () => {
        expect(sightingsSearch({})).toBe("?page=1&pageSize=50");
        expect(sightingsSearch({ q: " zomato ", brand: "Zomato", format: "HOARDING", analysed: false, page: 2, pageSize: 25, city: "Bengaluru" })).toBe(
            "?q=zomato&brand=Zomato&format=HOARDING&city=Bengaluru&analysed=false&page=2&pageSize=25",
        );
    });

    it("builds the export path with the same filters and the format asked for", () => {
        expect(competitorsService.exportPath("csv")).toBe("/competitor-sightings/export?format=csv");
        expect(competitorsService.exportPath("jsonl", { brand: "Zomato", from: "2026-09-01" })).toBe("/competitor-sightings/export?format=jsonl&brand=Zomato&from=2026-09-01");
    });
});

describe("the one-line reading", () => {
    it("is what the agent typed until the model has looked, then what the model saw", () => {
        expect(sightingLine(sighting())).toBe("Zomato · Hoarding");
        expect(sightingLine(sighting({ brand: null, format: null }))).toBe("Unknown brand");
        expect(
            sightingLine(
                sighting({
                    analysis: { brand: "Swiggy", category: "Food delivery", format: "BUS_SHELTER", estimatedSize: "12 x 6 ft", illuminated: true, condition: "GOOD", text: null, summary: "", confidence: 0.8, provider: "google", model: "gemini", perceptualHash: "0" },
                }),
            ),
        ).toBe("Swiggy · Bus shelter · 12 x 6 ft");
        expect(formatLabel("DIGITAL_SCREEN")).toBe("Digital screen");
        expect(formatLabel(null)).toBe("—");
    });
});
