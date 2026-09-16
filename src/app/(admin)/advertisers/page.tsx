import type { Metadata } from "next";
import { Suspense } from "react";
import { AdvertisersOverviewView } from "./advertisers-overview";

export const metadata: Metadata = { title: "Advertisers" };

/**
 * The section's landing tab — package O-C: the overview over
 * `GET /section-overviews/advertisers`. The directory moved to
 * `/advertisers/directory`; the activation funnel is the tab beside it.
 * Suspense because the loader keeps the window in the URL.
 */
export default function AdvertisersPage() {
    return (
        <Suspense fallback={null}>
            <AdvertisersOverviewView />
        </Suspense>
    );
}
