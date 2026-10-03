import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Address search everywhere (the owner, 1 Oct 2026): the search-only address
 * box. What this pins: typing asks `GET /geo/autocomplete` once the keys
 * settle (the session minted on focus, as the pin picker does — it is the
 * same search code); a pick resolves the place through
 * `GET /geo/places/:placeId`, writes its line and hands the place over;
 * Enter picks the first suggestion while the list shows; and when the
 * vendor answers nothing, or the console is on fixtures, it is a plain box
 * that keeps what was typed and says nothing under itself.
 */

const { backend, mode } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string }[],
        answers: new Map<string, unknown>(),
        reset() {
            this.calls = [];
            this.answers.clear();
        },
    },
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
        if (key === undefined) throw new actual.ApiError(503, "MAPS_UNAVAILABLE", "The maps vendor did not answer.");
        return backend.answers.get(key);
    };
    return { ...actual, api: { get: (path: string) => wrap("GET", path) } };
});

import { AddressSearchInput } from "./address-search-input";
import { ADDRESS_SEARCH_PLACEHOLDER } from "./pin-picker";
import type { GeocodedPlace } from "@/services/geo";

const MG_ROAD = { formattedAddress: "12, MG Road, Bengaluru, Karnataka 560001", latitude: 12.9752, longitude: 77.6057, placeId: "pl_1", city: "Bengaluru", state: "Karnataka", postalCode: "560001", name: "MG Road" };

function Harness({ onPlace = () => {} }: { onPlace?: (place: GeocodedPlace) => void }) {
    const [value, setValue] = React.useState("");
    return (
        <>
            <label htmlFor="addr">Billing address</label>
            <AddressSearchInput id="addr" value={value} onChange={setValue} onPlace={onPlace} />
            <output data-testid="value">{value}</output>
        </>
    );
}

const box = () => screen.getByLabelText("Billing address") as HTMLInputElement;

beforeEach(() => {
    backend.reset();
    mode.live = true;
});

describe("AddressSearchInput", () => {
    it("suggests once the keys settle, and a pick writes the place's line and hands the place over", async () => {
        backend.answers.set("/geo/autocomplete", [{ placeId: "pl_1", description: "MG Road, Bengaluru", mainText: "MG Road", secondaryText: "Bengaluru, Karnataka" }]);
        backend.answers.set("/geo/places/pl_1", MG_ROAD);
        const onPlace = vi.fn();
        render(<Harness onPlace={onPlace} />);
        expect(box().placeholder).toBe(ADDRESS_SEARCH_PLACEHOLDER);

        fireEvent.focus(box());
        fireEvent.change(box(), { target: { value: "MG Road" } });
        const option = await screen.findByRole("option");
        expect(option).toHaveTextContent("Bengaluru, Karnataka");
        const autocomplete = backend.calls.filter((call) => call.path.startsWith("/geo/autocomplete"));
        expect(autocomplete).toHaveLength(1);
        const session = new URL(`http://x${autocomplete[0].path}`).searchParams.get("session");
        expect(session).toMatch(/^.{8,64}$/);

        fireEvent.click(option);
        await waitFor(() => expect(box().value).toBe(MG_ROAD.formattedAddress));
        expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ city: "Bengaluru", state: "Karnataka", postalCode: "560001" }));
        expect(backend.calls).toContainEqual({ method: "GET", path: `/geo/places/pl_1?session=${session}` });
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("picks the first suggestion on Enter while the list shows", async () => {
        backend.answers.set("/geo/autocomplete", [{ placeId: "pl_1", description: "MG Road, Bengaluru", mainText: "MG Road", secondaryText: null }]);
        backend.answers.set("/geo/places/pl_1", MG_ROAD);
        render(<Harness />);
        fireEvent.focus(box());
        fireEvent.change(box(), { target: { value: "MG Ro" } });
        await screen.findByRole("option");
        fireEvent.keyDown(box(), { key: "Enter" });
        await waitFor(() => expect(box().value).toBe(MG_ROAD.formattedAddress));
    });

    it("keeps the suggestion's words when its place cannot be looked up", async () => {
        backend.answers.set("/geo/autocomplete", [{ placeId: "pl_dead", description: "MG Road, Bengaluru", mainText: "MG Road", secondaryText: null }]);
        const onPlace = vi.fn();
        render(<Harness onPlace={onPlace} />);
        fireEvent.focus(box());
        fireEvent.change(box(), { target: { value: "MG Road" } });
        fireEvent.click(await screen.findByRole("option"));
        await waitFor(() => expect(box().value).toBe("MG Road, Bengaluru"));
        expect(onPlace).not.toHaveBeenCalled();
    });

    it("is a plain box when the vendor answers nothing: the typed text stays and nothing is said under it", async () => {
        const onPlace = vi.fn();
        render(<Harness onPlace={onPlace} />);
        fireEvent.focus(box());
        fireEvent.change(box(), { target: { value: "4, FC Road, Pune" } });
        await waitFor(() => expect(backend.calls.some((call) => call.path.startsWith("/geo/autocomplete"))).toBe(true));
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByTestId("value")).toHaveTextContent("4, FC Road, Pune");
        expect(onPlace).not.toHaveBeenCalled();
    });

    it("on fixtures is a plain textbox and asks nothing", async () => {
        mode.live = false;
        render(<Harness />);
        expect(box()).not.toHaveAttribute("role", "combobox");
        fireEvent.focus(box());
        fireEvent.change(box(), { target: { value: "4, FC Road, Pune" } });
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(box().value).toBe("4, FC Road, Pune");
        expect(backend.calls).toEqual([]);
    });
});
