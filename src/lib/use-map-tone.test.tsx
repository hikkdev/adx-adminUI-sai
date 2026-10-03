import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_TONE_KEY, resetMapToneForTests, useMapTone } from "./use-map-tone";

beforeEach(() => {
    window.localStorage.clear();
    resetMapToneForTests();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("useMapTone", () => {
    it("is light until the operator picks otherwise", () => {
        const { result } = renderHook(() => useMapTone());
        expect(result.current[0]).toBe("light");
    });

    it("opens on the tone this browser remembered", () => {
        window.localStorage.setItem(MAP_TONE_KEY, "dark");
        const { result } = renderHook(() => useMapTone());
        expect(result.current[0]).toBe("dark");
    });

    it("reads anything but 'dark' as light", () => {
        window.localStorage.setItem(MAP_TONE_KEY, "sepia");
        const { result } = renderHook(() => useMapTone());
        expect(result.current[0]).toBe("light");
    });

    it("keeps the choice and hands it to every map on the page", () => {
        const first = renderHook(() => useMapTone());
        const second = renderHook(() => useMapTone());
        act(() => first.result.current[1]("dark"));
        expect(first.result.current[0]).toBe("dark");
        expect(second.result.current[0]).toBe("dark");
        expect(window.localStorage.getItem(MAP_TONE_KEY)).toBe("dark");
    });

    it("follows a choice made in another tab", () => {
        const { result } = renderHook(() => useMapTone());
        act(() => {
            window.dispatchEvent(new StorageEvent("storage", { key: MAP_TONE_KEY, newValue: "dark" }));
        });
        expect(result.current[0]).toBe("dark");
    });

    it("still switches for this tab when the browser blocks storage", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const { result } = renderHook(() => useMapTone());
        act(() => result.current[1]("dark"));
        expect(result.current[0]).toBe("dark");
    });
});
