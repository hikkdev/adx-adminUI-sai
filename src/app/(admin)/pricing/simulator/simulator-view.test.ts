import { describe, expect, it } from "vitest";
import type { PriceDimension, SiteOption } from "@/services/price-model";
import { guessValue } from "./simulator-view";

/** The starter dimensions' words, as the console seeds them. */
function dimension(slug: string, labels: string[]): PriceDimension {
    return {
        id: slug,
        name: slug,
        slug,
        description: null,
        sortOrder: 0,
        isActive: true,
        values: labels.map((label, index) => ({
            id: `${slug}-${index}`,
            dimensionId: slug,
            label,
            multiplier: "1.00",
            minAreaSqFt: null,
            maxAreaSqFt: null,
            sortOrder: index,
            isActive: true,
        })),
    };
}

const elevation = dimension("elevation", ["Eye level (≤ 20 ft)", "Mid rise (20-40 ft)", "High rise (> 40 ft)"]);
const visibility = dimension("visibility", ["Clear 100 m+ approach", "Partial obstruction", "Signal wait zone", "Flyover shadow"]);
const illumination = dimension("illumination", ["Non-lit", "Front-lit", "Back-lit", "Digital / LED"]);

function site(fields: Partial<SiteOption>): SiteOption {
    return {
        id: "lst_1", title: "Spot", city: null, mediaTypeId: null, areaSqFt: null, widthFt: null, heightFt: null,
        rateGrade: null, illumination: null, facing: null, elevation: null, visibility: null, ratePerDay: null,
        ...fields,
    };
}

describe("guessing a dimension value from a listing", () => {
    it("reads the coded height and sight line a listing stores since 3 Oct 2026", () => {
        expect(guessValue(elevation, site({ elevation: "ROOFTOP" }))).toBe("elevation-2");
        expect(guessValue(elevation, site({ elevation: "GROUND" }))).toBe("elevation-0");
        expect(guessValue(elevation, site({ elevation: "ELEVATED" }))).toBe("elevation-1");
        expect(guessValue(visibility, site({ visibility: "OVER_300M" }))).toBe("visibility-0");
    });

    it("guesses nothing for a short sight line rather than matching every label", () => {
        expect(guessValue(visibility, site({ visibility: "50_150M" }))).toBe("__none__");
        expect(guessValue(illumination, site({ visibility: "UNDER_50M" }))).toBe("__none__");
    });

    it("still matches the free text older listings were typed with", () => {
        expect(guessValue(illumination, site({ illumination: "Back-lit" }))).toBe("illumination-2");
        expect(guessValue(elevation, site({ elevation: "Mid rise" }))).toBe("elevation-1");
    });
});
