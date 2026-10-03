"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Switch } from "@/components/ui/switch";

/** The URL word for the switch — `?inactive=1`, so a reload or a shared link keeps it. */
export const SHOW_INACTIVE_PARAM = "inactive";

/**
 * Whether a KYC tab shows the inactive accounts too — 2 Oct 2026 (the owner:
 * "KYC still shows up in QUEUE" after a suspension or a deactivation). The
 * queues answer working accounts only; with the switch on, each read sends
 * `include=inactive` and the suspended, deactivated, closed and departed
 * come back with their pill. Kept in the URL beside the state chip; every
 * other parameter on the path is left as it was.
 */
export function useShowInactive(): [boolean, (next: boolean) => void] {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const on = params.get(SHOW_INACTIVE_PARAM) === "1";

    const set = React.useCallback(
        (next: boolean) => {
            const query = new URLSearchParams(params.toString());
            if (next) query.set(SHOW_INACTIVE_PARAM, "1");
            else query.delete(SHOW_INACTIVE_PARAM);
            const text = query.toString();
            router.replace(text ? `${pathname}?${text}` : pathname);
        },
        [params, pathname, router]
    );

    return [on, set];
}

/** The switch in a KYC tab's filter bar, the same on all five. */
export function ShowInactiveSwitch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (next: boolean) => void }) {
    return (
        <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground" title="Suspended, deactivated and closed accounts, and agents who left">
            <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label="Show inactive accounts" data-testid="kyc-show-inactive" />
            Show inactive accounts
        </label>
    );
}
