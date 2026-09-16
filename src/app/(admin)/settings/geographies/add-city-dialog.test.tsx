import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * AD-C: the add-city dialog takes its point through the shared pin picker
 * now. What this pins is that the body `POST /geo/cities` receives is the
 * one it always was — `lat` and `lng` as numbers beside the name and the
 * state — whether the coordinates were typed into the picker's inputs or
 * written back by the pin's drag report, and that a half-typed point
 * still cannot be submitted.
 */

const { backend, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
    },
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (path.startsWith("/geo/states/")) return { items: [] };
        if (path === "/geo/cities") return { slug: "navi-mumbai", name: "Navi Mumbai", stage: "PLANNED" };
        return null;
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

vi.mock("@/lib/use-maps-config", () => ({ useMapsConfig: () => ({ config: { provider: "GOOGLE", googleBrowserKey: "AIza-test" }, loading: false }) }));

vi.mock("@/components/adx/map", () => ({
    MapSurface: ({ points, onPointDragEnd }: { points: { id: string; latitude: number; longitude: number }[]; onPointDragEnd?: (point: unknown, at: { latitude: number; longitude: number }) => void }) => (
        <div data-testid="map-stub">
            {points.map((point) => (
                <span key={point.id} data-testid="marker" data-at={`${point.latitude},${point.longitude}`} />
            ))}
            {onPointDragEnd && points[0] && (
                <button type="button" data-testid="drag-pin" onClick={() => onPointDragEnd(points[0], { latitude: 19.033, longitude: 73.0297 })}>
                    drop
                </button>
            )}
        </div>
    ),
}));

import { AddCityDialog, addCityBodyOf } from "./add-city-dialog";
import type { GeoStateRow } from "@/services/geo";

const states = [{ code: "MH", name: "Maharashtra", counts: {} } as unknown as GeoStateRow];

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
});

const open = (initialName?: string) => {
    const onAdded = vi.fn();
    render(<AddCityDialog open onOpenChange={() => {}} states={states} onAdded={onAdded} initialName={initialName} />);
    return onAdded;
};

const chooseState = async () => {
    fireEvent.keyDown(screen.getByRole("combobox", { name: "State" }), { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "Maharashtra" }), { key: "Enter" });
};

describe("addCityBodyOf", () => {
    it("is the same body as before the picker: lat and lng as numbers", () => {
        expect(addCityBodyOf({ name: "Navi Mumbai", stateCode: "MH", districtCode: "", lat: "19.0330", lng: "73.0297", aliases: "", population: "", kind: "" })).toEqual({ name: "Navi Mumbai", stateCode: "MH", lat: 19.033, lng: 73.0297 });
        expect(addCityBodyOf({ name: "Navi Mumbai", stateCode: "MH", districtCode: "", lat: "19.0330", lng: "", aliases: "", population: "", kind: "" })).toBeNull();
    });
});

describe("AddCityDialog with the pin picker", () => {
    it("posts lat and lng typed into the picker's inputs", async () => {
        const onAdded = open("Navi Mumbai");
        await chooseState();
        fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "19.0330" } });
        expect(screen.getByRole("button", { name: "Add city" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "73.0297" } });
        expect(screen.getByTestId("marker")).toHaveAttribute("data-at", "19.033,73.0297");

        fireEvent.click(screen.getByRole("button", { name: "Add city" }));
        await waitFor(() => expect(onAdded).toHaveBeenCalled());
        const post = backend.calls.find((call) => call.method === "POST");
        expect(post).toEqual({ method: "POST", path: "/geo/cities", body: { name: "Navi Mumbai", stateCode: "MH", lat: 19.033, lng: 73.0297 } });
    });

    it("posts the point the pin was dropped at", async () => {
        const onAdded = open("Navi Mumbai");
        await chooseState();
        fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "19" } });
        fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "73" } });
        fireEvent.click(screen.getByTestId("drag-pin"));
        expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe("19.033");
        expect((screen.getByLabelText("Longitude") as HTMLInputElement).value).toBe("73.0297");

        fireEvent.click(screen.getByRole("button", { name: "Add city" }));
        await waitFor(() => expect(onAdded).toHaveBeenCalled());
        const post = backend.calls.find((call) => call.method === "POST");
        expect(post?.body).toMatchObject({ lat: 19.033, lng: 73.0297 });
    });
});
