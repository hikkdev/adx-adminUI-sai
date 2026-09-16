import { describe, expect, it } from "vitest";
import type { AdminListing } from "@/services/listings";
import { CLUSTER_UNTIL_ZOOM, cameraFor, cameraInto, markerClusters, stepZoom } from "@/lib/map-geometry";
import { NO_CITY, clustersOf, placeable } from "./map-clusters";

/**
 * The inventory map's folding. The component used to carry its own thousand
 * listings; what this pins is that it now draws only what the API placed —
 * a row without a fix is skipped and counted, not zero-filled onto the
 * equator — and that a city is a cluster centred on its own spots.
 */

const listing = (over: Partial<AdminListing> = {}): AdminListing => ({
    id: "lst_1",
    displayId: null,
    title: "MG Road Billboard",
    category: "OUTDOOR",
    subType: null,
    status: "ACTIVE",
    city: "Bengaluru",
    address: "MG Road",
    size: null,
    ratePerDay: "18000.00",
    latitude: 12.97,
    longitude: 77.59,
    publisherName: null,
    publisherId: null,
    agentDisplayId: null,
    photoCount: 0,
    submittedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    ratingAvg: null,
    reviewCount: 0,
    instantBooking: null,
    belowFloor: null,
    slotsTotal: null,
    ...over,
});

describe("placeable", () => {
    it("keeps the rows with a fix and counts the ones without", () => {
        const { pins, skipped } = placeable([
            listing(),
            listing({ id: "lst_2", latitude: null, longitude: null }),
            listing({ id: "lst_3", latitude: 13.0, longitude: 77.6 }),
        ]);
        expect(pins.map((pin) => pin.id)).toEqual(["lst_1", "lst_3"]);
        expect(skipped).toBe(1);
    });
});

describe("clustersOf", () => {
    it("folds pins by city, largest first, centred on their mean", () => {
        const { pins } = placeable([
            listing({ id: "a", city: "Mumbai", latitude: 19.0, longitude: 72.8 }),
            listing({ id: "b", latitude: 12.9, longitude: 77.5 }),
            listing({ id: "c", latitude: 13.1, longitude: 77.7 }),
        ]);
        const clusters = clustersOf(pins);
        expect(clusters.map((cluster) => [cluster.name, cluster.pins.length])).toEqual([
            ["Bengaluru", 2],
            ["Mumbai", 1],
        ]);
        expect(clusters[0].latitude).toBeCloseTo(13.0);
        expect(clusters[0].longitude).toBeCloseTo(77.6);
    });

    it("puts a placed spot with no city under its own heading rather than dropping it", () => {
        const { pins } = placeable([listing({ city: null }), listing({ id: "x", city: "  " })]);
        const clusters = clustersOf(pins);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].name).toBe(NO_CITY);
    });
});

describe("G13-C: the markers on the map", () => {
    const { pins } = placeable([
        listing({ id: "a", latitude: 12.97, longitude: 77.59 }),
        listing({ id: "b", latitude: 12.975, longitude: 77.6 }),
        listing({ id: "c", city: "Mumbai", latitude: 19.07, longitude: 72.87 }),
    ]);

    it("folds pins in one grid cell into a bubble at a wide zoom, and draws each on its own when close", () => {
        const wide = markerClusters(pins, 10);
        expect(wide.map((cluster) => [cluster.key, cluster.points.length])).toEqual([
            ["cell:221:1324", 2],
            ["c", 1],
        ]);
        expect(wide[0].latitude).toBeCloseTo(12.9725);
        const close = markerClusters(pins, CLUSTER_UNTIL_ZOOM);
        expect(close.map((cluster) => cluster.key)).toEqual(["a", "b", "c"]);
    });

    it("finds the camera that shows a set of pins, and steps in on a bubble within the limits", () => {
        expect(cameraFor([])).toBeNull();
        // Two cities 6° apart: the country, from the middle.
        const both = cameraFor(pins)!;
        expect(both.zoom).toBe(4);
        expect(both.latitude).toBeCloseTo(15.005);
        // One spot: street level.
        expect(cameraFor(pins.slice(0, 1))!.zoom).toBe(16);
        expect(cameraInto({ latitude: 12.97, longitude: 77.59 }, 17)).toEqual({ latitude: 12.97, longitude: 77.59, zoom: 18 });
        expect(stepZoom(18, 1)).toBe(18);
        expect(stepZoom(3.4, -1)).toBe(3);
    });
});
