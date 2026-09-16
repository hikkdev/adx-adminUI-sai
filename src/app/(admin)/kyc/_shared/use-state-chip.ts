"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { stateChipFromQuery, stateChipQuery, type KycStateChip } from "@/services/kyc-state";

/**
 * The state chip in force on a KYC tab, kept in the URL as `?state=` so a
 * chip survives a reload and a link from a party page (`?state=requested`)
 * lands on the rows it names. The old chip words (`awaiting_review`,
 * `needs_info`, …) fold onto the state they name; anything else is "all".
 * Every other query parameter on the path is left as it was.
 */
export function useStateChip(): [KycStateChip, (chip: KycStateChip) => void] {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const chip = stateChipFromQuery(params.get("state") ?? params.get("status"));

    const setChip = React.useCallback(
        (next: KycStateChip) => {
            const query = new URLSearchParams(params.toString());
            query.delete("status");
            const value = stateChipQuery(next);
            if (value) query.set("state", value);
            else query.delete("state");
            const text = query.toString();
            router.replace(text ? `${pathname}?${text}` : pathname);
        },
        [params, pathname, router]
    );

    return [chip, setChip];
}
