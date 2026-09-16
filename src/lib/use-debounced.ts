"use client";

import * as React from "react";

/**
 * The value, once it has stopped changing.
 *
 * Used for the price indicator, which asks the server a question on every
 * keystroke otherwise. A publisher typing "12500" would fire five evaluations,
 * four of them about prices they never meant — and the last two would race, so
 * the verdict shown could be the one for "1250".
 */
export function useDebounced<T>(value: T, ms = 400): T {
    const [settled, setSettled] = React.useState(value);

    React.useEffect(() => {
        const timer = setTimeout(() => setSettled(value), ms);
        return () => clearTimeout(timer);
    }, [value, ms]);

    return settled;
}
