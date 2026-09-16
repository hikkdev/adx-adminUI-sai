"use client";

import * as React from "react";
import { ApiError } from "@/lib/api-client";

export interface ApiResource<T> {
    data: T | null;
    loading: boolean;
    /** A message already fit to show a user, not a stack trace. */
    error: string | null;
    /** Re-runs the fetch. Safe to call from an event handler. */
    reload: () => void;
}

/**
 * Fetches on mount and exposes loading, error and reload.
 *
 * The console's API client keeps its token in localStorage, so any screen
 * reading real data has to do it from the browser. This is the one place that
 * knows how, so pages stay declarative and every domain wires the same way as
 * it comes off fixtures.
 *
 * `key` identifies the request rather than a dependency array: callers pass an
 * inline arrow for `fetcher`, which is a new function every render and would
 * refetch forever if depended on. A string key is stable, statically checkable,
 * and says plainly what a refetch means — `supply:attempt:att_0041` changes when
 * the attempt does and not otherwise.
 */
export function useApiResource<T>(key: string, fetcher: () => Promise<T>): ApiResource<T> {
    const [data, setData] = React.useState<T | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [nonce, setNonce] = React.useState(0);

    // Kept in a ref so the fetch effect can call the latest closure without
    // depending on it. Updated in an effect rather than during render, which
    // would be a write to a ref while React is still rendering.
    const fetcherRef = React.useRef(fetcher);
    React.useEffect(() => {
        fetcherRef.current = fetcher;
    });

    React.useEffect(() => {
        // Guards a late response from a request whose key has since changed.
        let active = true;

        void (async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await fetcherRef.current();
                if (active) setData(result);
            } catch (cause) {
                if (!active) return;
                setError(
                    cause instanceof ApiError
                        ? cause.message
                        : "Could not reach the server. Check your connection and try again."
                );
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [key, nonce]);

    const reload = React.useCallback(() => setNonce((n) => n + 1), []);

    return { data, loading, error, reload };
}
