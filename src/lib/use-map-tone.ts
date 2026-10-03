"use client";

import * as React from "react";

/** The maps' look: the tiles as drawn, or the dark style. */
export type MapTone = "light" | "dark";

/** The operator's choice, kept in this browser and shared by every full-page map in the console. */
export const MAP_TONE_KEY = "adx.console.mapTone";

/*
 * One value for the tab, read from localStorage on the first read in the
 * browser; the server (and the first hydration pass) sees "light", so the
 * markup never mismatches. Another tab's change arrives through `storage`.
 */
let tone: MapTone | undefined;
const listeners = new Set<() => void>();

const toneOf = (raw: string | null): MapTone => (raw === "dark" ? "dark" : "light");

function readTone(): MapTone {
    if (tone === undefined) {
        try {
            tone = toneOf(window.localStorage.getItem(MAP_TONE_KEY));
        } catch {
            tone = "light";
        }
    }
    return tone;
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key !== MAP_TONE_KEY) return;
        tone = toneOf(event.newValue);
        listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

export function setMapTone(next: MapTone): void {
    tone = next;
    try {
        window.localStorage.setItem(MAP_TONE_KEY, next);
    } catch {
        /* Storage blocked: the choice still holds for this tab. */
    }
    listeners.forEach((listener) => listener());
}

/** For tests: forget the tab's value so the next read goes back to storage. */
export function resetMapToneForTests(): void {
    tone = undefined;
    listeners.clear();
}

/** The maps' tone and its setter — one choice across the console's full-page maps. */
export function useMapTone(): [MapTone, (next: MapTone) => void] {
    const value = React.useSyncExternalStore(subscribe, readTone, (): MapTone => "light");
    return [value, setMapTone];
}
