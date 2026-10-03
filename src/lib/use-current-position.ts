"use client";

import * as React from "react";

/** Where the browser says the person at the screen is. */
export interface CurrentPosition {
    latitude: number;
    longitude: number;
    /** The browser's own estimate, in metres; null when it gave none. */
    accuracy: number | null;
    /** When the fix was taken, epoch milliseconds. */
    at: number;
}

export type PositionStatus = "idle" | "locating" | "ready" | "denied" | "unavailable";

export type LocateResult = { ok: true; position: CurrentPosition } | { ok: false; reason: "denied" | "unavailable" };

/** The operator's own last fix, kept in this browser only — so a map opens where they were last time, not on a fixed city. */
export const LAST_POSITION_KEY = "adx.console.lastPosition";

const parse = (raw: string | null): CurrentPosition | null => {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as Partial<CurrentPosition>;
        if (typeof value.latitude !== "number" || typeof value.longitude !== "number") return null;
        return { latitude: value.latitude, longitude: value.longitude, accuracy: typeof value.accuracy === "number" ? value.accuracy : null, at: typeof value.at === "number" ? value.at : 0 };
    } catch {
        return null;
    }
};

const toPosition = (fix: GeolocationPosition): CurrentPosition => ({
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracy: Number.isFinite(fix.coords.accuracy) ? fix.coords.accuracy : null,
    at: fix.timestamp || Date.now(),
});

/** A fix up to a minute old is fine for framing a map; ten seconds before giving up. */
const ASK: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 };

const geolocationOf = (): Geolocation | undefined => (typeof navigator === "undefined" ? undefined : navigator.geolocation);

/*
 * One store for the whole tab: the value in memory is the truth (storage can be
 * blocked — a private window, site data off), loaded from localStorage on the
 * first read in the browser. `useSyncExternalStore` hands the server `null` and
 * the browser the remembered fix, so hydration never mismatches.
 */
let current: CurrentPosition | null | undefined;
const listeners = new Set<() => void>();

function readPosition(): CurrentPosition | null {
    if (current === undefined) {
        let raw: string | null = null;
        try {
            raw = window.localStorage.getItem(LAST_POSITION_KEY);
        } catch {
            raw = null;
        }
        current = parse(raw);
    }
    return current;
}

function publish(next: CurrentPosition): void {
    current = next;
    try {
        window.localStorage.setItem(LAST_POSITION_KEY, JSON.stringify(next));
    } catch {
        /* Storage blocked: the fix still lives for this tab. */
    }
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** For tests: forget the tab's fix so the next read goes back to storage. */
export function resetCurrentPositionForTests(): void {
    current = undefined;
    listeners.clear();
}

/**
 * The browser's position for the person at the screen. It asks once when the
 * page opens (the browser prompts the first time) and again on `locate()`;
 * meanwhile `position` is the last fix this browser remembered, or null.
 */
export function useCurrentPosition({ askOnMount = true }: { askOnMount?: boolean } = {}) {
    const position = React.useSyncExternalStore(subscribe, readPosition, () => null);
    const [status, setStatus] = React.useState<PositionStatus>("idle");

    const locate = React.useCallback(
        (): Promise<LocateResult> =>
            new Promise((resolve) => {
                const geolocation = geolocationOf();
                if (!geolocation) {
                    setStatus("unavailable");
                    resolve({ ok: false, reason: "unavailable" });
                    return;
                }
                setStatus("locating");
                geolocation.getCurrentPosition(
                    (fix) => {
                        const next = toPosition(fix);
                        publish(next);
                        setStatus("ready");
                        resolve({ ok: true, position: next });
                    },
                    (error) => {
                        const reason = error.code === error.PERMISSION_DENIED ? "denied" : "unavailable";
                        setStatus(reason);
                        resolve({ ok: false, reason });
                    },
                    ASK,
                );
            }),
        [],
    );

    React.useEffect(() => {
        const geolocation = geolocationOf();
        if (!askOnMount || !geolocation) return;
        // Asked quietly: no "locating" state on open, only the answer.
        geolocation.getCurrentPosition(
            (fix) => {
                publish(toPosition(fix));
                setStatus("ready");
            },
            (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
            ASK,
        );
    }, [askOnMount]);

    return { position, status, locate };
}
