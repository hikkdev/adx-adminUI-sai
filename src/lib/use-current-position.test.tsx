import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_POSITION_KEY, resetCurrentPositionForTests, useCurrentPosition } from "./use-current-position";

/** A browser Geolocation whose answer each test sets. */
function fakeGeolocation(answer: { fix?: { latitude: number; longitude: number; accuracy?: number }; deniedCode?: 1 | 2 | 3 }) {
    const getCurrentPosition = vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) => {
        if (answer.fix) {
            ok({ coords: { latitude: answer.fix.latitude, longitude: answer.fix.longitude, accuracy: answer.fix.accuracy ?? 25 }, timestamp: 1_727_000_000_000 } as unknown as GeolocationPosition);
        } else {
            fail?.({ code: answer.deniedCode ?? 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "no" } as GeolocationPositionError);
        }
    });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    return getCurrentPosition;
}

beforeEach(() => {
    window.localStorage.clear();
    resetCurrentPositionForTests();
});

afterEach(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    vi.restoreAllMocks();
});

describe("useCurrentPosition", () => {
    it("asks the browser once when it mounts, answers the fix and remembers it in this browser", async () => {
        const ask = fakeGeolocation({ fix: { latitude: 28.6139, longitude: 77.209 } });
        const { result } = renderHook(() => useCurrentPosition());
        await waitFor(() => expect(result.current.position).toMatchObject({ latitude: 28.6139, longitude: 77.209, accuracy: 25 }));
        expect(result.current.status).toBe("ready");
        expect(ask).toHaveBeenCalledTimes(1);
        expect(JSON.parse(window.localStorage.getItem(LAST_POSITION_KEY) ?? "null")).toMatchObject({ latitude: 28.6139, longitude: 77.209 });
    });

    it("opens on the fix remembered from last time, before the browser answers", () => {
        window.localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ latitude: 19.076, longitude: 72.8777, accuracy: 40, at: 1 }));
        fakeGeolocation({ deniedCode: 1 });
        const { result } = renderHook(() => useCurrentPosition({ askOnMount: false }));
        expect(result.current.position).toEqual({ latitude: 19.076, longitude: 72.8777, accuracy: 40, at: 1 });
    });

    it("ignores a remembered value that is not a position", () => {
        window.localStorage.setItem(LAST_POSITION_KEY, "{not json");
        const { result } = renderHook(() => useCurrentPosition({ askOnMount: false }));
        expect(result.current.position).toBeNull();
    });

    it("says denied when the person blocked location, and keeps no position", async () => {
        fakeGeolocation({ deniedCode: 1 });
        const { result } = renderHook(() => useCurrentPosition({ askOnMount: false }));
        let answer: Awaited<ReturnType<typeof result.current.locate>> | undefined;
        await act(async () => {
            answer = await result.current.locate();
        });
        expect(answer).toEqual({ ok: false, reason: "denied" });
        expect(result.current.status).toBe("denied");
        expect(result.current.position).toBeNull();
    });

    it("says unavailable on a timeout, and when the browser has no geolocation at all", async () => {
        fakeGeolocation({ deniedCode: 3 });
        const first = renderHook(() => useCurrentPosition({ askOnMount: false }));
        await act(async () => {
            await expect(first.result.current.locate()).resolves.toEqual({ ok: false, reason: "unavailable" });
        });

        Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
        const second = renderHook(() => useCurrentPosition({ askOnMount: false }));
        await act(async () => {
            await expect(second.result.current.locate()).resolves.toEqual({ ok: false, reason: "unavailable" });
        });
        expect(second.result.current.status).toBe("unavailable");
    });

    it("still answers the fix for this tab when the browser blocks storage", async () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        fakeGeolocation({ fix: { latitude: 12.97, longitude: 77.59 } });
        const { result } = renderHook(() => useCurrentPosition({ askOnMount: false }));
        await act(async () => {
            await result.current.locate();
        });
        expect(result.current.position).toMatchObject({ latitude: 12.97, longitude: 77.59 });
    });
});
