import { describe, expect, it } from "vitest";

import { cityLabel, parseAliases, sortCities, type City } from "./cities";

/**
 * Geographies — the `City` table under pricing.
 *
 * The alias textarea is the one input on the screen that shapes a body:
 * one spelling per line or comma, trimmed, emptied and de-duplicated, and
 * never more than the schema's twenty-five.
 */

const city = (over: Partial<City> = {}): City => ({
    slug: "bengaluru",
    name: "Bengaluru",
    state: "Karnataka",
    aliases: ["bangalore"],
    isActive: true,
    ...over,
});

describe("parseAliases", () => {
    it("splits on newlines and commas, trims, and drops empties", () => {
        expect(parseAliases("Bangalore\n Bengaluru Urban ,,\n\n")).toEqual(["Bangalore", "Bengaluru Urban"]);
    });

    it("drops the obvious doubles case-insensitively, keeping the first spelling", () => {
        expect(parseAliases("Bangalore, bangalore, BANGALORE")).toEqual(["Bangalore"]);
    });

    it("stops at the schema's cap", () => {
        const text = Array.from({ length: 30 }, (_, index) => `alias-${index}`).join("\n");
        expect(parseAliases(text)).toHaveLength(25);
    });

    it("trims an alias to the schema's length", () => {
        expect(parseAliases("x".repeat(100))[0]).toHaveLength(80);
    });
});

describe("cityLabel", () => {
    it("adds the state when there is one", () => {
        expect(cityLabel(city())).toBe("Bengaluru, Karnataka");
        expect(cityLabel(city({ state: null }))).toBe("Bengaluru");
    });
});

describe("sortCities", () => {
    it("puts open cities first, then by name", () => {
        const sorted = sortCities([
            city({ slug: "pune", name: "Pune", isActive: false }),
            city({ slug: "mumbai", name: "Mumbai" }),
            city({ slug: "delhi", name: "Delhi", isActive: false }),
            city(),
        ]);
        expect(sorted.map((row) => row.slug)).toEqual(["bengaluru", "mumbai", "delhi", "pune"]);
    });
});
