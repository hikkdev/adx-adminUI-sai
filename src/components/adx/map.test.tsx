import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { KEY_REFUSED_SENTENCE, MapSurface, type MapPoint } from "./map";
import { browserKeyOf, vendorSentence, type MapsClientConfig } from "@/services/maps";

/**
 * The map seam's first rule — G13-C, Q101/Q128: no browser key, no tiles.
 * What this pins is that every keyless state (the console on fixtures, a
 * Google provider whose key is still to come, a Mapbox provider the console
 * has no library for) draws the placeholder with the vendor sentence and
 * the markers it would have plotted — never an unauthorised grey map — and
 * that the vendor library is only ever mounted once a Google key is there.
 *
 * Z-C: OpenStreetMap has no key, so the surface draws as soon as the read
 * lands — a Leaflet TileLayer from the template and attribution
 * `GET /app/maps` answered, capped at the tiles' max zoom, the same dots
 * and bubbles on the same props, the camera followed and reported back.
 * Leaflet is mocked the way Google is: what is pinned is what the seam
 * hands the vendor, not the vendor.
 */

vi.mock("@vis.gl/react-google-maps", () => ({
    APIProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="google-api-provider">{children}</div>,
    Map: ({ children }: { children: React.ReactNode }) => <div data-testid="google-map">{children}</div>,
    AdvancedMarker: ({ children, title }: { children: React.ReactNode; title?: string }) => <div data-title={title}>{children}</div>,
}));

/** The live map the OSM branch syncs the camera against: the view it was given, a spy for the moves the seam asks for. */
const { leafletMap } = vi.hoisted(() => ({
    leafletMap: {
        view: { lat: 21.5, lng: 79, zoom: 4 },
        setView: vi.fn(),
        getCenter() {
            return { lat: this.view.lat, lng: this.view.lng };
        },
        getZoom() {
            return this.view.zoom;
        },
        handlers: {} as Record<string, (event: { target: unknown }) => void>,
    },
}));

vi.mock("leaflet", () => ({
    default: {
        divIcon: (options: Record<string, unknown>) => ({ options }),
        Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    },
}));

vi.mock("react-leaflet", () => ({
    MapContainer: ({ children, center, zoom, minZoom, maxZoom }: { children: React.ReactNode; center: [number, number]; zoom: number; minZoom: number; maxZoom: number }) => (
        <div data-testid="leaflet-map" data-center={center.join(",")} data-zoom={zoom} data-min-zoom={minZoom} data-max-zoom={maxZoom}>
            {children}
        </div>
    ),
    TileLayer: ({ url, attribution, maxZoom }: { url: string; attribution: string; maxZoom: number }) => (
        <div data-testid="leaflet-tiles" data-url={url} data-attribution={attribution} data-max-zoom={maxZoom} />
    ),
    Marker: ({ title, icon, eventHandlers }: { title?: string; icon: { options: { html: string } }; eventHandlers?: { click?: () => void } }) => (
        <div data-title={title} onClick={eventHandlers?.click} dangerouslySetInnerHTML={{ __html: icon.options.html }} />
    ),
    useMapEvents: (handlers: Record<string, (event: { target: unknown }) => void>) => {
        leafletMap.handlers = handlers;
        return leafletMap;
    },
}));

const points: MapPoint[] = [
    { id: "lst_1", latitude: 12.97, longitude: 77.59, tone: "success", title: "MG Road Billboard" },
    { id: "lst_2", latitude: 28.61, longitude: 77.2, tone: "warning", title: "Connaught Place Hoarding" },
];
const camera = { latitude: 21.5, longitude: 79, zoom: 4 };

describe("MapSurface without a key", () => {
    it("draws the fixtures placeholder when the config never arrived", () => {
        render(<MapSurface config={null} points={points} camera={camera} onCameraChange={() => {}} />);
        expect(screen.getByTestId("map-placeholder")).toBeInTheDocument();
        expect(screen.queryByTestId("google-api-provider")).not.toBeInTheDocument();
        expect(screen.getByText("2 markers would be drawn here")).toBeInTheDocument();
        expect(screen.getByText(/with the console on fixtures there is nothing to draw with/)).toBeInTheDocument();
    });

    it("draws the Google placeholder while the key is still to come", () => {
        render(
            <MapSurface
                config={{ provider: "GOOGLE", googleBrowserKey: null }}
                points={points}
                camera={camera}
                onCameraChange={() => {}}
                caption="Under the filters."
            />,
        );
        expect(screen.getByTestId("map-placeholder")).toBeInTheDocument();
        expect(screen.queryByTestId("google-api-provider")).not.toBeInTheDocument();
        expect(screen.getByText("Tiles arrive with the Google Maps key. Everything else on this screen works.")).toBeInTheDocument();
        expect(screen.getByText("Under the filters.")).toBeInTheDocument();
    });

    it("treats a blank key as no key", () => {
        render(<MapSurface config={{ provider: "GOOGLE", googleBrowserKey: "   " }} points={[]} camera={camera} onCameraChange={() => {}} />);
        expect(screen.getByTestId("map-placeholder")).toBeInTheDocument();
        expect(screen.getByText("Nothing to plot")).toBeInTheDocument();
    });

    it("draws the Mapbox placeholder even with a token — the console has no Mapbox library", () => {
        render(
            <MapSurface config={{ provider: "MAPBOX", mapboxPublicToken: "pk.test" }} points={points} camera={camera} onCameraChange={() => {}} />,
        );
        expect(screen.getByTestId("map-placeholder")).toBeInTheDocument();
        expect(screen.getByText(/Tiles arrive with the Mapbox token/)).toBeInTheDocument();
        expect(screen.getByText(/no Mapbox library yet/)).toBeInTheDocument();
    });
});

describe("MapSurface with a Google key", () => {
    it("mounts the vendor surface and one marker per point at a zoom that does not cluster them", () => {
        render(
            <MapSurface
                config={{ provider: "GOOGLE", googleBrowserKey: "AIza-test" }}
                points={points}
                camera={{ ...camera, zoom: 18 }}
                onCameraChange={() => {}}
            />,
        );
        expect(screen.queryByTestId("map-placeholder")).not.toBeInTheDocument();
        expect(screen.getByTestId("map-surface")).toBeInTheDocument();
        expect(screen.getByTestId("google-map")).toBeInTheDocument();
        expect(screen.getByLabelText("MG Road Billboard")).toBeInTheDocument();
        expect(screen.getByLabelText("Connaught Place Hoarding")).toBeInTheDocument();
    });
});

describe("MapSurface when the vendor refuses the key", () => {
    it("falls back to the placeholder naming the refusal once Google calls gm_authFailure — V-C, the owner's key refusing with 'enable Billing'", () => {
        render(
            <MapSurface
                config={{ provider: "GOOGLE", googleBrowserKey: "AIza-unbilled" }}
                points={points}
                camera={{ ...camera, zoom: 18 }}
                onCameraChange={() => {}}
                caption="Cities by stage."
            />,
        );
        expect(screen.getByTestId("map-surface")).toBeInTheDocument();
        const scope = window as Window & { gm_authFailure?: () => void };
        expect(typeof scope.gm_authFailure).toBe("function");
        act(() => scope.gm_authFailure?.());
        const placeholder = screen.getByTestId("map-placeholder");
        expect(placeholder).toHaveAttribute("data-refused", "true");
        expect(screen.queryByTestId("google-api-provider")).not.toBeInTheDocument();
        expect(screen.getByText(KEY_REFUSED_SENTENCE)).toBeInTheDocument();
        /* The markers it would have plotted and the caller's caption still print. */
        expect(screen.getByText("2 markers would be drawn here")).toBeInTheDocument();
        expect(screen.getByText("Cities by stage.")).toBeInTheDocument();
    });
});

const osmConfig: MapsClientConfig = {
    provider: "OSM",
    tileUrlTemplate: "https://tiles.example.in/{z}/{x}/{y}.png?key=abc",
    tileAttribution: "(c) OpenStreetMap contributors",
    tileMaxZoom: 17,
    publicTiles: false,
};

describe("the client half on OSM", () => {
    it("answers the tile template as what the browser draws with, and the OSM sentence", () => {
        expect(browserKeyOf(osmConfig)).toBe(osmConfig.tileUrlTemplate);
        expect(browserKeyOf({ ...osmConfig, tileUrlTemplate: "  " })).toBeNull();
        expect(vendorSentence("OSM")).toMatch(/OpenStreetMap tile server/);
        expect(vendorSentence("GOOGLE")).toMatch(/Google Maps key/);
    });
});

describe("MapSurface on OpenStreetMap", () => {
    it("draws a TileLayer from the template and attribution the read answered, capped at the tiles' max zoom — no placeholder, no Google", async () => {
        render(<MapSurface config={osmConfig} points={points} camera={{ ...camera, zoom: 18 }} onCameraChange={() => {}} />);
        expect(screen.queryByTestId("map-placeholder")).not.toBeInTheDocument();
        expect(screen.getByTestId("map-surface")).toHaveAttribute("data-provider", "OSM");
        /* The Leaflet branch is client-only and arrives after the first paint. */
        const tiles = await screen.findByTestId("leaflet-tiles");
        expect(tiles).toHaveAttribute("data-url", "https://tiles.example.in/{z}/{x}/{y}.png?key=abc");
        expect(tiles).toHaveAttribute("data-attribution", "(c) OpenStreetMap contributors");
        expect(tiles).toHaveAttribute("data-max-zoom", "17");
        const map = screen.getByTestId("leaflet-map");
        expect(map).toHaveAttribute("data-max-zoom", "17");
        expect(map).toHaveAttribute("data-min-zoom", "3");
        expect(map).toHaveAttribute("data-center", "21.5,79");
        expect(screen.queryByTestId("google-api-provider")).not.toBeInTheDocument();
        /* The same dots as the Google branch: one per point, titled and coloured by tone. */
        expect(screen.getByLabelText("MG Road Billboard")).toHaveClass("bg-success");
        expect(screen.getByLabelText("Connaught Place Hoarding")).toHaveClass("bg-warning");
    });

    it("folds points into the same bubbles, hands a click on a dot or a bubble to the caller, and follows the caller's camera", async () => {
        const onSelect = vi.fn();
        const onClusterClick = vi.fn();
        const onCameraChange = vi.fn();
        const crowd: MapPoint[] = [
            { id: "a", latitude: 12.97, longitude: 77.59, tone: "info", title: "A" },
            { id: "b", latitude: 12.971, longitude: 77.591, tone: "info", title: "B" },
            { id: "c", latitude: 28.61, longitude: 77.2, tone: "danger", title: "C" },
        ];
        leafletMap.setView.mockReset();
        leafletMap.view = { lat: 21.5, lng: 79, zoom: 4 };
        const view = render(
            <MapSurface config={osmConfig} points={crowd} camera={camera} onCameraChange={onCameraChange} onSelect={onSelect} onClusterClick={onClusterClick} />,
        );
        await screen.findByTestId("leaflet-tiles");
        const bubble = screen.getByText("2");
        fireEvent.click(bubble);
        expect(onClusterClick).toHaveBeenCalledTimes(1);
        expect(onClusterClick.mock.calls[0][0].points.map((point: MapPoint) => point.id)).toEqual(["a", "b"]);
        fireEvent.click(screen.getByLabelText("C"));
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));

        /* The map already sits where the camera is: nothing to move. */
        expect(leafletMap.setView).not.toHaveBeenCalled();
        /* The caller moves the camera (a chip, a zoom button): the live map is told once. */
        view.rerender(
            <MapSurface config={osmConfig} points={crowd} camera={{ latitude: 12.97, longitude: 77.59, zoom: 15 }} onCameraChange={onCameraChange} onSelect={onSelect} onClusterClick={onClusterClick} />,
        );
        expect(leafletMap.setView).toHaveBeenCalledWith([12.97, 77.59], 15, { animate: false });
        /* The operator drags: the map reports and the caller's camera follows. */
        leafletMap.view = { lat: 13, lng: 77.6, zoom: 15 };
        act(() => leafletMap.handlers.moveend({ target: leafletMap }));
        expect(onCameraChange).toHaveBeenLastCalledWith({ latitude: 13, longitude: 77.6, zoom: 15 });
    });

    it("still draws the placeholder while the read has not landed — the one keyless state OSM has", () => {
        render(<MapSurface config={null} points={points} camera={camera} onCameraChange={() => {}} />);
        expect(screen.getByTestId("map-placeholder")).toBeInTheDocument();
        expect(screen.queryByTestId("leaflet-map")).not.toBeInTheDocument();
    });
});
