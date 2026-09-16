import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MapsClientConfig } from "@/services/maps";

/**
 * AD-C: the one coordinate picker. What this pins: a prediction picked
 * from `GET /geo/autocomplete` (asked once the keystrokes settle, with the
 * session minted on focus) is resolved through `GET /geo/places/:placeId`
 * and fills the two inputs; the seam's drag report writes the drop back
 * and, once it rests, `GET /geo/reverse` names the address under the pin
 * with "Use this address"; typing a coordinate moves the marker the seam
 * is handed; and with no vendor to draw with the seam's placeholder
 * explains while the search and the inputs keep working. The vendor is
 * never mounted: the seam is stubbed where a key exists and left to draw
 * its own placeholder where none does.
 */

const { backend, maps, mode } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string }[],
        answers: new Map<string, unknown>(),
        reset() {
            this.calls = [];
            this.answers.clear();
        },
    },
    maps: { config: null as MapsClientConfig | null },
    mode: { live: true },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return {
        ...actual,
        apiConfig: {
            ...actual.apiConfig,
            get live() {
                return mode.live;
            },
        },
        isLive: () => mode.live,
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string) => {
        backend.calls.push({ method, path });
        const key = [...backend.answers.keys()].find((prefix) => path.startsWith(prefix));
        if (key === undefined) throw new actual.ApiError(404, "NOT_FOUND", "No address is known for that point.");
        return backend.answers.get(key);
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string) => wrap("POST", path),
            patch: (path: string) => wrap("PATCH", path),
            put: (path: string) => wrap("PUT", path),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

vi.mock("@/lib/use-maps-config", () => ({ useMapsConfig: () => ({ config: maps.config, loading: false }) }));

/* A keyed config gets the stub, which exposes the seam's props; a keyless one gets the real surface, which draws its placeholder without any vendor. */
vi.mock("@/components/adx/map", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/adx/map")>();
    const { browserKeyOf } = await import("@/services/maps");
    type Props = Parameters<typeof actual.MapSurface<import("./map").MapPoint>>[0];
    const MapSurface = (props: Props) => {
        if (!browserKeyOf(props.config)) return <actual.MapSurface {...props} />;
        return (
            <div data-testid="map-stub" data-camera={`${props.camera.latitude},${props.camera.longitude},${props.camera.zoom}`}>
                {props.points.map((point) => (
                    <span key={point.id} data-testid="marker" data-at={`${point.latitude},${point.longitude}`}>
                        {point.title}
                    </span>
                ))}
                {props.onPointDragEnd && props.points[0] && (
                    <button type="button" data-testid="drag-pin" onClick={() => props.onPointDragEnd!(props.points[0], { latitude: 19.1234567, longitude: 72.9876543 })}>
                        drop the pin
                    </button>
                )}
            </div>
        );
    };
    return { ...actual, MapSurface };
});

import { FIXTURES_SEARCH_SENTENCE, NO_MAP_CAPTION, PinPicker, formatCoordinate, parseCoordinate } from "./pin-picker";
import { vendorSentence } from "@/services/maps";

const GOOGLE: MapsClientConfig = { provider: "GOOGLE", googleBrowserKey: "AIza-test" };
const KEYLESS: MapsClientConfig = { provider: "GOOGLE", googleBrowserKey: null };

/** A controlled harness: the strings the form would own. */
function Harness({ initial = { latitude: "", longitude: "" }, onAddress }: { initial?: { latitude: string; longitude: string }; onAddress?: (place: { formattedAddress: string }) => void }) {
    const [coords, setCoords] = React.useState(initial);
    return (
        <>
            <PinPicker id="spot" latitude={coords.latitude} longitude={coords.longitude} onChange={setCoords} onAddress={onAddress} title="The hoarding" />
            <output data-testid="payload">{`${coords.latitude}|${coords.longitude}`}</output>
        </>
    );
}

const latInput = () => screen.getByLabelText("Latitude") as HTMLInputElement;
const lngInput = () => screen.getByLabelText("Longitude") as HTMLInputElement;
const searchInput = () => screen.getByRole("combobox") as HTMLInputElement;

beforeEach(() => {
    backend.reset();
    maps.config = GOOGLE;
    mode.live = true;
});

describe("parseCoordinate / formatCoordinate", () => {
    it("accepts a coordinate inside its range and nothing else", () => {
        expect(parseCoordinate(" 19.076 ", 90)).toBe(19.076);
        expect(parseCoordinate("", 90)).toBeNull();
        expect(parseCoordinate("abc", 90)).toBeNull();
        expect(parseCoordinate("91", 90)).toBeNull();
        expect(parseCoordinate("-179.9", 180)).toBe(-179.9);
    });

    it("prints six decimals at most and no trailing zeros", () => {
        expect(formatCoordinate(19.1234567)).toBe("19.123457");
        expect(formatCoordinate(77)).toBe("77");
        expect(formatCoordinate(72.5)).toBe("72.5");
    });
});

describe("PinPicker — the address search", () => {
    it("asks the autocomplete once the keystrokes settle, with the session minted on focus, and a pick fills the inputs through the place lookup", async () => {
        backend.answers.set("/geo/autocomplete", [
            { placeId: "pl_1", description: "MG Road, Bengaluru", mainText: "MG Road", secondaryText: "Bengaluru, Karnataka" },
            { placeId: "pl_2", description: "MG Road, Pune", mainText: "MG Road", secondaryText: "Pune, Maharashtra" },
        ]);
        backend.answers.set("/geo/places/pl_1", { formattedAddress: "MG Road, Bengaluru, Karnataka 560001", latitude: 12.9752, longitude: 77.6057, placeId: "pl_1", city: "Bengaluru", state: "Karnataka", postalCode: "560001", name: "MG Road" });
        const onAddress = vi.fn();
        render(<Harness onAddress={onAddress} />);

        fireEvent.focus(searchInput());
        fireEvent.change(searchInput(), { target: { value: "MG Road" } });

        const options = await screen.findAllByRole("option", {}, { timeout: 2000 });
        expect(options).toHaveLength(2);
        expect(options[1]).toHaveTextContent("Pune, Maharashtra");

        const autocomplete = backend.calls.filter((call) => call.path.startsWith("/geo/autocomplete"));
        expect(autocomplete).toHaveLength(1);
        const params = new URL(`http://x${autocomplete[0].path}`).searchParams;
        expect(params.get("input")).toBe("MG Road");
        expect(params.get("session")).toMatch(/^.{8,64}$/);
        /* No point yet, so nothing to bias toward. */
        expect(params.get("latitude")).toBeNull();

        fireEvent.click(options[0]);

        await waitFor(() => expect(latInput().value).toBe("12.9752"));
        expect(lngInput().value).toBe("77.6057");
        expect(screen.getByTestId("payload")).toHaveTextContent("12.9752|77.6057");
        expect(backend.calls.some((call) => call.path === `/geo/places/pl_1?session=${params.get("session")}`)).toBe(true);
        expect(onAddress).toHaveBeenCalledWith(expect.objectContaining({ formattedAddress: "MG Road, Bengaluru, Karnataka 560001", city: "Bengaluru" }));
        expect(searchInput().value).toBe("MG Road, Bengaluru, Karnataka 560001");
        /* The marker the seam draws is the picked point. */
        expect(screen.getByTestId("marker")).toHaveAttribute("data-at", "12.9752,77.6057");
        expect(screen.getByTestId("map-stub").getAttribute("data-camera")).toBe("12.9752,77.6057,16");
    });

    it("falls back to the geocoder on Enter when nothing was predicted", async () => {
        backend.answers.set("/geo/autocomplete", []);
        backend.answers.set("/geo/geocode", { formattedAddress: "Connaught Place, New Delhi 110001", latitude: 28.6315, longitude: 77.2167, placeId: null, city: "New Delhi", state: "Delhi", postalCode: "110001" });
        render(<Harness />);

        fireEvent.focus(searchInput());
        fireEvent.change(searchInput(), { target: { value: "Connaught Place" } });
        await screen.findByText(/Nothing matches/, {}, { timeout: 2000 });

        fireEvent.keyDown(searchInput(), { key: "Enter" });
        await waitFor(() => expect(latInput().value).toBe("28.6315"));
        expect(lngInput().value).toBe("77.2167");
        expect(backend.calls.some((call) => call.path === "/geo/geocode?address=Connaught%20Place")).toBe(true);
    });

    it("prints the server's refusal when the place cannot be looked up", async () => {
        backend.answers.set("/geo/autocomplete", []);
        render(<Harness />);
        fireEvent.focus(searchInput());
        fireEvent.change(searchInput(), { target: { value: "Nowhere at all" } });
        await screen.findByText(/Nothing matches/, {}, { timeout: 2000 });
        fireEvent.keyDown(searchInput(), { key: "Enter" });
        expect(await screen.findByRole("alert")).toHaveTextContent("No address is known for that point.");
        expect(latInput().value).toBe("");
    });
});

describe("PinPicker — the pin and the inputs", () => {
    it("writes the seam's drag report into the inputs, then names the address under the pin with 'Use this address'", async () => {
        backend.answers.set("/geo/reverse", { formattedAddress: "Powai, Mumbai, Maharashtra 400076", latitude: 19.1234567, longitude: 72.9876543, placeId: "pl_9", city: "Mumbai", state: "Maharashtra", postalCode: "400076" });
        const onAddress = vi.fn();
        render(<Harness initial={{ latitude: "19.0760", longitude: "72.8777" }} onAddress={onAddress} />);
        expect(screen.getByTestId("marker")).toHaveAttribute("data-at", "19.076,72.8777");

        fireEvent.click(screen.getByTestId("drag-pin"));
        expect(latInput().value).toBe("19.123457");
        expect(lngInput().value).toBe("72.987654");
        expect(screen.getByTestId("payload")).toHaveTextContent("19.123457|72.987654");

        const line = await screen.findByTestId("pin-picker-reverse", {}, { timeout: 2000 });
        await waitFor(() => expect(line).toHaveTextContent("Under the pin: Powai, Mumbai, Maharashtra 400076"), { timeout: 2000 });
        expect(backend.calls.filter((call) => call.path.startsWith("/geo/reverse"))).toEqual([{ method: "GET", path: "/geo/reverse?latitude=19.1234567&longitude=72.9876543" }]);

        fireEvent.click(screen.getByRole("button", { name: "Use this address" }));
        expect(onAddress).toHaveBeenCalledWith(expect.objectContaining({ formattedAddress: "Powai, Mumbai, Maharashtra 400076" }));
    });

    it("moves the marker when a coordinate is typed, and draws none while the pair is incomplete or off the planet", () => {
        render(<Harness />);
        expect(screen.queryByTestId("marker")).not.toBeInTheDocument();

        fireEvent.change(latInput(), { target: { value: "12.97" } });
        expect(screen.queryByTestId("marker")).not.toBeInTheDocument();

        fireEvent.change(lngInput(), { target: { value: "77.59" } });
        expect(screen.getByTestId("marker")).toHaveAttribute("data-at", "12.97,77.59");
        expect(screen.getByTestId("map-stub")).toHaveAttribute("data-camera", "12.97,77.59,16");

        fireEvent.change(latInput(), { target: { value: "28.61" } });
        expect(screen.getByTestId("marker")).toHaveAttribute("data-at", "28.61,77.59");

        fireEvent.change(latInput(), { target: { value: "95" } });
        expect(screen.queryByTestId("marker")).not.toBeInTheDocument();
        expect(latInput()).toHaveAttribute("aria-invalid", "true");
        /* The form's own string is untouched by the check. */
        expect(screen.getByTestId("payload")).toHaveTextContent("95|77.59");
    });
});

describe("PinPicker — without a vendor", () => {
    it("draws the seam's placeholder with the explanation while the search and the inputs keep working", async () => {
        maps.config = KEYLESS;
        backend.answers.set("/geo/autocomplete", [{ placeId: "pl_1", description: "MG Road, Bengaluru", mainText: "MG Road", secondaryText: "Bengaluru" }]);
        render(<Harness initial={{ latitude: "12.97", longitude: "77.59" }} />);

        const placeholder = screen.getByTestId("map-placeholder");
        expect(placeholder).toHaveTextContent("1 marker would be drawn here");
        expect(placeholder).toHaveTextContent(NO_MAP_CAPTION);
        expect(placeholder).toHaveTextContent(vendorSentence("GOOGLE"));
        expect(screen.queryByTestId("google-api-provider")).not.toBeInTheDocument();

        fireEvent.change(latInput(), { target: { value: "13" } });
        expect(screen.getByTestId("payload")).toHaveTextContent("13|77.59");

        fireEvent.focus(searchInput());
        fireEvent.change(searchInput(), { target: { value: "MG Road" } });
        expect(await screen.findByRole("option", {}, { timeout: 2000 })).toHaveTextContent("MG Road");
    });

    it("on fixtures disables the search, says why, and leaves the inputs alone", () => {
        mode.live = false;
        maps.config = null;
        render(<Harness />);
        expect(searchInput()).toBeDisabled();
        expect(screen.getByText(FIXTURES_SEARCH_SENTENCE)).toBeInTheDocument();
        expect(screen.getByTestId("map-placeholder")).toHaveTextContent("Nothing to plot");
        fireEvent.change(latInput(), { target: { value: "12.97" } });
        fireEvent.change(lngInput(), { target: { value: "77.59" } });
        expect(screen.getByTestId("payload")).toHaveTextContent("12.97|77.59");
        expect(screen.getByTestId("map-placeholder")).toHaveTextContent("1 marker would be drawn here");
        expect(backend.calls).toEqual([]);
    });
});
