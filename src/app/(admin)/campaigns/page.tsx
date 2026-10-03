import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsOverviewView } from "./campaigns-overview";

export const metadata: Metadata = { title: "Campaigns" };

/**
 * The section's landing tab — 2 Oct 2026: the overview over
 * `GET /section-overviews/campaigns`, as Listings has one. The list moved
 * to `/campaigns/directory` (old `/campaigns?advertiserId=…` links are
 * redirected there by next.config). Suspense because the loader keeps the
 * window in the URL (`useSearchParams`).
 */
export default function CampaignsPage() {
    return (
        <Suspense fallback={null}>
            <CampaignsOverviewView />
        </Suspense>
    );
}
