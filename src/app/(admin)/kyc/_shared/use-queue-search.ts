"use client";

import { useSearchParams } from "next/navigation";

/**
 * 2 Oct 2026 — `?q=` on a KYC queue: what its search box holds on first
 * draw. The party rosters' "Review KYC" sends a party with no case yet to
 * its queue searched for it (`kycReviewHref`), so the desk lands on that
 * one row with its request and desk-record actions.
 */
export function useQueueSearch(): string {
    return useSearchParams()?.get("q")?.trim() ?? "";
}
