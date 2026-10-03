import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_POSITION_KEY, resetCurrentPositionForTests } from "@/lib/use-current-position";
import { MAP_TONE_KEY, resetMapToneForTests } from "@/lib/use-map-tone";
import type { LiveAgent, LiveSnapshot } from "@/services/agent-locations";
import { LiveMapView } from "./live-map-view";

const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

/* The map itself is Leaflet or Google; here it only shows where the camera is and what is marked. */
vi.mock("@/components/adx/map", () => ({
    MapSurface: ({ camera, points, tone }: { camera: { latitude: number; longitude: number; zoom: number }; points: { id: string; title?: string }[]; tone?: string }) => (
        <div data-testid="map-stub" data-tone={tone} data-camera={`${camera.latitude},${camera.longitude},${camera.zoom}`}>
            {points.map((point) => (
                <span key={point.id} data-testid="marker" data-id={point.id}>
                    {point.title}
                </span>
            ))}
        </div>
    ),
}));

const DELHI = { latitude: 28.6139, longitude: 77.209 };

function agent(id: string, fix: { latitude: number; longitude: number } | null): LiveAgent {
    return {
        agent: { id, displayId: `AGT-${id}`, userId: `usr_${id}`, name: `Agent ${id}`, mobile: "+919800000000", city: "Bengaluru", sides: ["PUBLISHER"], status: "ACTIVE", stage: "ACTIVE" },
        state: fix ? "AVAILABLE" : "OFFLINE",
        fix: fix ? { ...fix, at: "2026-09-30T10:00:00.000Z", accuracy: 10, speed: null, heading: null, ageSec: 20 } : null,
        trip: null,
        alerts: [],
    };
}

const snapshotOf = (agents: LiveAgent[]): LiveSnapshot => ({
    agents,
    counts: { OFFLINE: agents.filter((a) => !a.fix).length, AVAILABLE: agents.filter((a) => a.fix).length, TRAVELLING: 0, ON_SITE: 0, STILL: 0 },
    alerts: 0,
    at: "2026-09-30T10:00:00.000Z",
});

function browserAnswers(answer: { fix?: { latitude: number; longitude: number } } | { denied: true } | { pending: true }) {
    const getCurrentPosition = vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) => {
        if ("pending" in answer) return;
        if ("fix" in answer && answer.fix) ok({ coords: { ...answer.fix, accuracy: 20 }, timestamp: 1 } as unknown as GeolocationPosition);
        else fail?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError);
    });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    return getCurrentPosition;
}

const renderView = (agents: LiveAgent[] = [agent("a1", null)]) =>
    render(<LiveMapView snapshot={snapshotOf(agents)} loading={false} error={null} phase="open" filter={{}} onFilter={vi.fn()} mapsConfig={null} onRefresh={vi.fn()} />);

const cameraShown = () => screen.getByTestId("map-stub").getAttribute("data-camera");

beforeEach(() => {
    window.localStorage.clear();
    resetCurrentPositionForTests();
    resetMapToneForTests();
    toast.error.mockClear();
    toast.info.mockClear();
});

afterEach(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
});

describe("the live map's default view", () => {
    it("opens on the operator's own position and marks it", async () => {
        browserAnswers({ fix: DELHI });
        renderView();
        await waitFor(() => expect(cameraShown()).toBe(`${DELHI.latitude},${DELHI.longitude},13`));
        expect(screen.getByText("You are here")).toBeInTheDocument();
    });

    it("opens where the operator was last time while the browser is still answering", () => {
        window.localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ latitude: 19.076, longitude: 72.8777, accuracy: 30, at: 1 }));
        browserAnswers({ pending: true });
        renderView();
        expect(cameraShown()).toBe("19.076,72.8777,13");
    });

    it("falls back to framing the agents, then Bengaluru, when the browser gives no position", async () => {
        browserAnswers({ denied: true });
        const placed = renderView([agent("a1", { latitude: 13.0, longitude: 77.6 })]);
        await waitFor(() => expect(cameraShown()).toMatch(/^13,77\.6,/));
        placed.unmount();

        renderView([agent("a1", null)]);
        expect(cameraShown()).toBe("12.9716,77.5946,11");
        expect(screen.queryByText("You are here")).not.toBeInTheDocument();
    });
});

describe("the map's buttons", () => {
    it("Show my location centres the map on a fresh fix", async () => {
        browserAnswers({ denied: true });
        renderView();
        expect(cameraShown()).toBe("12.9716,77.5946,11");

        browserAnswers({ fix: DELHI });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Show my location" }));
        });
        await waitFor(() => expect(cameraShown()).toBe(`${DELHI.latitude},${DELHI.longitude},14`));
    });

    it("Show my location says how to unblock it when the browser refuses", async () => {
        browserAnswers({ denied: true });
        renderView();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Show my location" }));
        });
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Location is blocked for this site", expect.objectContaining({ description: expect.stringMatching(/site settings/) })));
        expect(cameraShown()).toBe("12.9716,77.5946,11");
    });

    it("Frame everyone frames the placed agents, and says so when nobody is placed", async () => {
        browserAnswers({ fix: DELHI });
        const placed = renderView([agent("a1", { latitude: 13.0, longitude: 77.6 })]);
        await waitFor(() => expect(cameraShown()).toBe(`${DELHI.latitude},${DELHI.longitude},13`));
        fireEvent.click(screen.getByRole("button", { name: "Frame everyone" }));
        expect(cameraShown()).toMatch(/^13,77\.6,/);
        placed.unmount();

        renderView([agent("a1", null)]);
        fireEvent.click(screen.getByRole("button", { name: "Frame everyone" }));
        expect(toast.info).toHaveBeenCalledWith("No agent is sharing a position right now.");
    });
});

describe("the map's style", () => {
    it("switches the map to dark and remembers it for next time", () => {
        browserAnswers({ pending: true });
        renderView();
        expect(screen.getByTestId("map-stub")).toHaveAttribute("data-tone", "light");
        fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
        expect(screen.getByTestId("map-stub")).toHaveAttribute("data-tone", "dark");
        expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
        expect(window.localStorage.getItem(MAP_TONE_KEY)).toBe("dark");
    });
});
