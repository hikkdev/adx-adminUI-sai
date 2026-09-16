import { describe, expect, it } from "vitest";
import { directionsLink, mapsLink, mapsLinkLabel } from "./maps-links";

/**
 * AD-C: the "open in maps" link follows the provider ops chose. OSM opens
 * openstreetmap.org with the pin marked; Google opens Google Maps; Mapbox,
 * which has no public web map, opens Google Maps too; and an unknown
 * provider (config unread, the console on fixtures) is Google, the
 * platform's default.
 */

const point = { lat: 19.076, lng: 72.8777, label: "MG Road Billboard" };

describe("mapsLink", () => {
    it("under OSM marks the pin on openstreetmap.org at street zoom", () => {
        expect(mapsLink(point, "OSM")).toBe("https://www.openstreetmap.org/?mlat=19.076&mlon=72.8777#map=17/19.076/72.8777");
    });

    it("under GOOGLE searches the coordinate pair on Google Maps", () => {
        expect(mapsLink(point, "GOOGLE")).toBe("https://www.google.com/maps/search/?api=1&query=19.076,72.8777");
    });

    it("under MAPBOX falls back to the Google link, and so does an unknown provider", () => {
        expect(mapsLink(point, "MAPBOX")).toBe(mapsLink(point, "GOOGLE"));
        expect(mapsLink(point, null)).toBe(mapsLink(point, "GOOGLE"));
        expect(mapsLink(point, undefined)).toBe(mapsLink(point, "GOOGLE"));
    });

    it("never prints a coordinate in exponent notation or with trailing zeros", () => {
        expect(mapsLink({ lat: 0.0000001, lng: 77 }, "GOOGLE")).toBe("https://www.google.com/maps/search/?api=1&query=0,77");
        expect(mapsLink({ lat: -33.5, lng: 151.25 }, "OSM")).toContain("mlat=-33.5&mlon=151.25");
    });
});

describe("directionsLink", () => {
    it("routes to the point the same three ways", () => {
        expect(directionsLink(point, "OSM")).toBe("https://www.openstreetmap.org/directions?to=19.076%2C72.8777");
        expect(directionsLink(point, "GOOGLE")).toBe("https://www.google.com/maps/dir/?api=1&destination=19.076,72.8777");
        expect(directionsLink(point, "MAPBOX")).toBe(directionsLink(point, "GOOGLE"));
    });
});

describe("mapsLinkLabel", () => {
    it("names the vendor the link opens", () => {
        expect(mapsLinkLabel("OSM")).toBe("Open in OpenStreetMap");
        expect(mapsLinkLabel("GOOGLE")).toBe("Open in Google Maps");
        expect(mapsLinkLabel("MAPBOX")).toBe("Open in Google Maps");
    });
});
