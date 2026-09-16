import { describe, expect, it } from "vitest";
import { DEFAULT_CITY_FACETS, cityFacetsOf, cityQueryOf, geoHref, geoQuery, tabOf } from "./geographies-facets";

/** V-C — the desk's URL: the tab, and on Cities every facet the list is cut on, round-tripped. */
describe("the geographies URL", () => {
    it("reads the tab and the Cities facets off the query, ignoring what it does not know", () => {
        const params = new URLSearchParams("tab=cities&state=19&district=d1&stage=SEEDING,LAUNCHED,BOGUS&kind=STATE_CAPITAL&minPopulation=25000&q=mys&sort=name&page=3");
        expect(tabOf(params)).toBe("cities");
        expect(cityFacetsOf(params)).toEqual({ state: "19", district: "d1", stage: ["SEEDING", "LAUNCHED"], kind: ["STATE_CAPITAL"], minPopulation: 25000, q: "mys", sort: "name", page: 3 });
        expect(tabOf(new URLSearchParams("tab=nope"))).toBe("overview");
        expect(cityFacetsOf(new URLSearchParams("page=-2&minPopulation=abc"))).toEqual(DEFAULT_CITY_FACETS);
    });

    it("writes the default as the bare path and the Cities facets only on the Cities tab", () => {
        expect(geoQuery("overview")).toBe("");
        expect(geoQuery("map", { ...DEFAULT_CITY_FACETS, state: "19" })).toBe("tab=map");
        expect(geoHref("cities", { stage: ["WITHDRAWN"] })).toBe("/settings/geographies?tab=cities&stage=WITHDRAWN");
        expect(geoHref("cities", { state: "19", page: 2, sort: "name" })).toBe("/settings/geographies?tab=cities&state=19&sort=name&page=2");
        expect(geoHref("overview")).toBe("/settings/geographies");
    });

    it("hands GET /geo/cities only the facets in force, with the page size", () => {
        expect(cityQueryOf({ ...DEFAULT_CITY_FACETS, stage: ["SEEDING"], q: "pune" })).toEqual({ stage: ["SEEDING"], q: "pune", sort: "population", page: 1, pageSize: 50 });
    });
});
