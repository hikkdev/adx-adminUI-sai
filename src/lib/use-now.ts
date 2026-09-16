"use client";

import * as React from "react";

/**
 * The current time, as an external store rather than a render-time read.
 *
 * `Date.now()` in a render body is impure twice over. React may re-render at any
 * moment and expects the same output, and on a server-rendered page the server's
 * clock and the browser's differ — which is the shape of hydration mismatch that
 * took the console down once already, when a localStorage read sat in a
 * `useState` initialiser. The fix there was `useSyncExternalStore`, and this is
 * the same fix for the same reason.
 *
 * Returns `null` on the server and on the first client render. Callers have to
 * say what an unknown time means for them, which is the right thing to be forced
 * to decide: "no windows are live" and "we do not know yet which windows are
 * live" are different sentences, and rendering the first while meaning the
 * second is how a screen tells a confident lie for one frame.
 */

const TICK_MS = 60_000;

let current = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    if (timer === null) {
        // A minute is far finer than anything reading this needs — the coarsest
        // question asked of it is whether a multi-day event is running — and it
        // keeps a console left open overnight from insisting it is still
        // yesterday.
        timer = setInterval(() => {
            current = Date.now();
            for (const listener of listeners) listener();
        }, TICK_MS);
    }
    return () => {
        listeners.delete(onChange);
        if (listeners.size === 0 && timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    };
}

/**
 * Must return the *same* value until something notifies a change, or React
 * re-renders forever comparing two fresh timestamps. Hence the module-level
 * cache rather than a call to the clock.
 */
function getSnapshot(): number {
    if (current === 0) current = Date.now();
    return current;
}

const getServerSnapshot = (): number | null => null;

export function useNow(): number | null {
    return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
