"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { todayIST } from "@/services/overview";
import { windowFromQuery, windowQuery, type OverviewWindow } from "@/services/section-overviews";

/**
 * The overview's window, kept in the URL (`?window=7D`, `?window=CUSTOM&
 * from=&to=`, `?city=`) so a window survives a reload and a narrowed
 * overview is a link. The default — the last thirty days, every city —
 * writes nothing, so the section's plain root stays the plain overview.
 * Every other query parameter on the path is left as it was.
 */
export function useOverviewWindow(): [OverviewWindow, (next: OverviewWindow) => void] {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const window = windowFromQuery(params, todayIST());

    const setWindow = React.useCallback(
        (next: OverviewWindow) => {
            const query = new URLSearchParams(params.toString());
            for (const key of ["window", "from", "to", "city"]) query.delete(key);
            const own = new URLSearchParams(windowQuery(next));
            own.forEach((value, key) => query.set(key, value));
            const text = query.toString();
            router.replace(text ? `${pathname}?${text}` : pathname);
        },
        [params, pathname, router],
    );

    return [window, setWindow];
}
