import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MapsClientConfig } from "@/services/maps";

/**
 * AD-C: the small read-only map beside a printed coordinate. What this
 * pins: one marker goes to the seam at the point given, the camera rests
 * over it at street zoom, and the "Open in maps" link is the provider's
 * — OSM's page under OSM, Google's under Google or while the config is
 * unread. The seam is stubbed: what the mini map hands it is the test,
 * not the vendor.
 */

const { maps } = vi.hoisted(() => ({ maps: { config: null as MapsClientConfig | null } }));

vi.mock("@/lib/use-maps-config", () => ({ useMapsConfig: () => ({ config: maps.config, loading: false }) }));

vi.mock("@/components/adx/map", () => ({
    MapSurface: ({ points, camera, config }: { points: { id: string; latitude: number; longitude: number; title: string }[]; camera: { latitude: number; longitude: number; zoom: number }; config: unknown }) => (
        <div data-testid="map-stub" data-camera={`${camera.latitude},${camera.longitude},${camera.zoom}`} data-configured={config ? "yes" : "no"}>
            {points.map((point) => (
                <span key={point.id} data-testid="marker" data-at={`${point.latitude},${point.longitude}`}>
                    {point.title}
                </span>
            ))}
        </div>
    ),
}));

import { MINI_MAP_ZOOM, MiniMap } from "./mini-map";

describe("MiniMap", () => {
    it("hands the seam one marker at the point, rests the camera over it, and links to Google while the provider is unknown", () => {
        maps.config = null;
        render(<MiniMap latitude={19.076} longitude={72.8777} title="MG Road Billboard" />);
        const markers = screen.getAllByTestId("marker");
        expect(markers).toHaveLength(1);
        expect(markers[0]).toHaveAttribute("data-at", "19.076,72.8777");
        expect(markers[0]).toHaveTextContent("MG Road Billboard");
        expect(screen.getByTestId("map-stub")).toHaveAttribute("data-camera", `19.076,72.8777,${MINI_MAP_ZOOM}`);
        expect(screen.getByTestId("mini-map")).toHaveTextContent("19.07600, 72.87770");
        const link = screen.getByTestId("mini-map-link");
        expect(link).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=19.076,72.8777");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noreferrer");
        expect(link).toHaveAccessibleName("Open in Google Maps: MG Road Billboard");
    });

    it("links to openstreetmap.org under the OSM provider", () => {
        maps.config = { provider: "OSM", tileUrlTemplate: "https://tile.example/{z}/{x}/{y}.png", tileAttribution: "© OSM", tileMaxZoom: 19, publicTiles: false };
        render(<MiniMap latitude={12.97} longitude={77.59} />);
        expect(screen.getByTestId("mini-map-link")).toHaveAttribute("href", "https://www.openstreetmap.org/?mlat=12.97&mlon=77.59#map=17/12.97/77.59");
        expect(screen.getByTestId("mini-map-link")).toHaveAccessibleName("Open in OpenStreetMap: The spot");
    });

    it("moves the camera when the point changes", () => {
        maps.config = null;
        const { rerender } = render(<MiniMap latitude={12.97} longitude={77.59} />);
        rerender(<MiniMap latitude={28.61} longitude={77.2} />);
        expect(screen.getByTestId("map-stub")).toHaveAttribute("data-camera", `28.61,77.2,${MINI_MAP_ZOOM}`);
        expect(screen.getByTestId("marker")).toHaveAttribute("data-at", "28.61,77.2");
    });
});
