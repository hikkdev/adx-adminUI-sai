import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api-client";
import type { MapsSettings, OsmSettings } from "@/services/integrations";

/**
 * Z-C — the maps card on Integrations, with OpenStreetMap as the third
 * provider.
 *
 * What this pins: OSM is offered only where the backend answers its
 * section; choosing it draws the section in force (the read fills the
 * defaults in) with the three usage policies and the public-tiles warning
 * while the template still names tile.openstreetmap.org; the card will
 * not save OSM without a contact email and says why; the PUT is
 * `{ section: 'maps', patch }` with the provider and only the `osm`
 * fields that moved — a typed tile key, never `publicTiles`, never a
 * masked value — and an emptied field travels as null (back to the
 * default); and the backend's own 400 is printed under the field it
 * names.
 *
 * AC-C over AC-B1: under OpenStreetMap the phones still run the Mapbox
 * engine, so the OSM block carries a "Phones" line — Present / Missing
 * from the read's `phoneEngine.tokenPresent` — and the Mapbox public token
 * field is reachable without leaving OSM; a typed token travels in the
 * same PUT as the osm fields.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: {} as unknown,
        failure: null as Error | null,
        reset() {
            this.calls = [];
            this.answer = {};
            this.failure = null;
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.failure) throw backend.failure;
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { MapsSection } from "./maps-section";

/** The section as `GET /integrations` answers it on a Z-B backend: the defaults filled in, no contact email yet. */
const osm = (over: Partial<OsmSettings> = {}): OsmSettings => ({
    nominatimBaseUrl: "https://nominatim.openstreetmap.org",
    osrmBaseUrl: "https://router.project-osrm.org",
    photonBaseUrl: "https://photon.komoot.io",
    contactEmail: null,
    userAgent: "ADX/1.0.0 (no contact email set)",
    tileUrlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution: "(c) OpenStreetMap contributors",
    tileMaxZoom: 19,
    tileApiKey: null,
    publicTiles: true,
    ...over,
});

const stored = (over: Partial<MapsSettings> = {}): MapsSettings => ({
    provider: "GOOGLE",
    googleBrowserKey: "••••ab12",
    googleServerKey: null,
    mapboxPublicToken: null,
    mapboxSecretToken: null,
    osm: osm(),
    ...over,
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

/** Opens a Radix select by keyboard (jsdom has no pointer) and picks the option. */
async function pick(trigger: HTMLElement, option: string) {
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: option }));
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the provider list", () => {
    it("offers OpenStreetMap only where the backend answers its section", async () => {
        const { unmount } = render(<MapsSection stored={stored({ osm: undefined })} onChanged={() => {}} />);
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
        expect(await screen.findByRole("option", { name: "Mapbox" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "OpenStreetMap" })).toBeNull();
        unmount();

        render(<MapsSection stored={stored()} onChanged={() => {}} />);
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
        expect(await screen.findByRole("option", { name: "OpenStreetMap" })).toBeInTheDocument();
    });
});

describe("the OpenStreetMap form", () => {
    it("draws the section in force, the policies and the public-tiles warning, and will not save without a contact email", async () => {
        render(<MapsSection stored={stored()} onChanged={() => {}} />);
        expect(screen.queryByTestId("osm-policies")).toBeNull();
        await pick(screen.getByRole("combobox"), "OpenStreetMap");

        expect(screen.getByTestId("osm-policies")).toHaveTextContent("one request a second");
        expect(screen.getByLabelText(/Nominatim/)).toHaveValue("https://nominatim.openstreetmap.org");
        expect(screen.getByLabelText(/OSRM/)).toHaveValue("https://router.project-osrm.org");
        expect(screen.getByLabelText(/Photon/)).toHaveValue("https://photon.komoot.io");
        expect(screen.getByLabelText("Tile template")).toHaveValue("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
        expect(screen.getByLabelText("Attribution")).toHaveValue("(c) OpenStreetMap contributors");
        expect(screen.getByLabelText("Max zoom")).toHaveValue("19");
        expect(screen.getByLabelText("Tile key")).toHaveValue("");
        expect(screen.getByTestId("osm-public-tiles")).toHaveTextContent("tile.openstreetmap.org is for light use — point production at a tile provider.");
        expect(screen.getByText("Public tiles")).toBeInTheDocument();
        expect(screen.getByText("No contact email")).toBeInTheDocument();

        /* The provider moved, so the form is dirty — but OSM without a contact email is refused here before the round trip. */
        expect(screen.getByTestId("maps-problem")).toHaveTextContent("needs a contact email");
        expect(screen.getByRole("button", { name: "Save maps" })).toBeDisabled();

        type(/Contact email/, "ops@adx.example");
        expect(screen.queryByTestId("maps-problem")).toBeNull();
        expect(screen.getByRole("button", { name: "Save maps" })).toBeEnabled();

        /* The warning follows the template as it is typed, by the backend's rule. */
        type("Tile template", "https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key={key}");
        expect(screen.queryByTestId("osm-public-tiles")).toBeNull();
        type("Tile template", "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png");
        expect(screen.getByTestId("osm-public-tiles")).toBeInTheDocument();
        type("Tile template", "https://tiles.example.in/streets.png");
        expect(screen.getByTestId("maps-problem")).toHaveTextContent("must carry {z}, {x} and {y}");
        expect(screen.getByRole("button", { name: "Save maps" })).toBeDisabled();
    });

    it("PUTs the provider and only the osm fields that moved — the typed key, an emptied field as null, never publicTiles", async () => {
        backend.answer = { maps: stored() };
        const onChanged = vi.fn();
        render(<MapsSection stored={stored({ osm: osm({ userAgent: "ADX ops bot" }) })} onChanged={onChanged} />);
        await pick(screen.getByRole("combobox"), "OpenStreetMap");

        type(/Contact email/, "  ops@adx.example ");
        type("Tile template", "https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key={key}");
        type("Tile key", "mt-browser-key");
        type("Max zoom", "20");
        /* Emptied: back to the default on the server. */
        type("User-Agent", "");
        /* Untouched, and a re-typed identical value: not in the patch. */
        type("Attribution", "(c) OpenStreetMap contributors");

        fireEvent.click(screen.getByRole("button", { name: "Save maps" }));
        await waitFor(() => expect(backend.calls).toHaveLength(1));
        expect(backend.calls[0]).toEqual({
            method: "PUT",
            path: "/integrations",
            body: {
                section: "maps",
                patch: {
                    provider: "OSM",
                    osm: {
                        contactEmail: "ops@adx.example",
                        userAgent: null,
                        tileUrlTemplate: "https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key={key}",
                        tileMaxZoom: 20,
                        tileApiKey: "mt-browser-key",
                    },
                },
            },
        });
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(toast.success).toHaveBeenCalledWith("Maps saved", expect.objectContaining({ description: expect.stringMatching(/OpenStreetMap draws the map/) }));
    });

    it("sends no osm sub-object when nothing in it moved, and never a masked tile key", async () => {
        backend.answer = { maps: stored() };
        render(<MapsSection stored={stored({ provider: "OSM", osm: osm({ contactEmail: "ops@adx.example", tileApiKey: "••••9f3a" }) })} onChanged={() => {}} />);
        expect(screen.getByText("Connected")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save maps" })).toBeDisabled();
        type("Tile key", "••••9f3a");
        expect(screen.getByRole("button", { name: "Save maps" })).toBeDisabled();
        await pick(screen.getByRole("combobox"), "Google Maps Platform");
        fireEvent.click(screen.getByRole("button", { name: "Save maps" }));
        await waitFor(() => expect(backend.calls).toHaveLength(1));
        expect(backend.calls[0].body).toEqual({ section: "maps", patch: { provider: "GOOGLE" } });
    });

    it("prints the backend's 400 under the contact email when the server refuses OSM without one", async () => {
        backend.failure = new ApiError(400, "VALIDATION_ERROR", "OpenStreetMap needs a contact email: the public Nominatim usage policy requires one on every request.", {
            fieldErrors: { "osm.contactEmail": ["Required to select OpenStreetMap"] },
            formErrors: [],
        });
        const onChanged = vi.fn();
        render(<MapsSection stored={stored()} onChanged={onChanged} />);
        await pick(screen.getByRole("combobox"), "OpenStreetMap");
        type(/Contact email/, "ops@adx.example");
        fireEvent.click(screen.getByRole("button", { name: "Save maps" }));

        await waitFor(() => expect(screen.getByTestId("osm-error-contactEmail")).toHaveTextContent("Required to select OpenStreetMap"));
        expect(screen.getByLabelText(/Contact email/)).toHaveAttribute("aria-invalid", "true");
        expect(toast.error).toHaveBeenCalledWith("OpenStreetMap needs a contact email: the public Nominatim usage policy requires one on every request.");
        expect(onChanged).not.toHaveBeenCalled();
        /* The typed values survive the refusal so the operator can fix the one field. */
        expect(screen.getByLabelText(/Contact email/)).toHaveValue("ops@adx.example");
    });
});

describe("the phones' engine under OpenStreetMap (AC-B1)", () => {
    it("says the Mapbox public token is missing, points at the token field on the card, and sends a typed token with the osm patch", async () => {
        backend.answer = { maps: stored() };
        render(
            <MapsSection
                stored={stored({ provider: "OSM", osm: osm({ contactEmail: "ops@adx.example" }), phoneEngine: { engine: "MAPBOX", tokenPresent: false } })}
                onChanged={() => {}}
            />,
        );
        const phones = screen.getByTestId("osm-phones");
        expect(phones).toHaveTextContent("The apps draw OpenStreetMap through the Mapbox engine and need the Mapbox public token.");
        expect(within(phones).getByText("Missing")).toBeInTheDocument();
        expect(screen.getByText("Phones: no Mapbox token")).toBeInTheDocument();

        /* The token field is on the card while OSM is selected — the link reaches it. */
        const token = screen.getByLabelText("Mapbox public token (for the phones)");
        expect(token).toHaveAttribute("id", "maps-mapboxPublicToken");
        expect(screen.queryByLabelText("Secret token")).toBeNull();
        fireEvent.click(within(phones).getByRole("link", { name: "Add the token above" }));
        expect(token).toHaveFocus();

        type("Mapbox public token (for the phones)", "pk.live-token");
        /* The line follows what is typed. */
        expect(within(screen.getByTestId("osm-phones")).getByText("Present")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Save maps" }));
        await waitFor(() => expect(backend.calls).toHaveLength(1));
        expect(backend.calls[0].body).toEqual({ section: "maps", patch: { mapboxPublicToken: "pk.live-token" } });
    });

    it("says Present from the backend's verdict, and from the masked token while OSM is only picked", async () => {
        const { unmount } = render(
            <MapsSection
                stored={stored({ provider: "OSM", osm: osm({ contactEmail: "ops@adx.example" }), mapboxPublicToken: "••••tok1", phoneEngine: { engine: "MAPBOX", tokenPresent: true } })}
                onChanged={() => {}}
            />,
        );
        expect(within(screen.getByTestId("osm-phones")).getByText("Present")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Add the token above" })).toBeNull();
        expect(screen.queryByText("Phones: no Mapbox token")).toBeNull();
        unmount();

        /* Stored provider is Google, so the read carries no phoneEngine; the masked token stands in. */
        render(<MapsSection stored={stored({ mapboxPublicToken: "••••tok1" })} onChanged={() => {}} />);
        expect(screen.queryByTestId("osm-phones")).toBeNull();
        await pick(screen.getByRole("combobox"), "OpenStreetMap");
        expect(within(screen.getByTestId("osm-phones")).getByText("Present")).toBeInTheDocument();
    });
});
