import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsNav } from "../campaigns-nav";
import { LaunchQueueLoader } from "./launch-queue-loader";

export const metadata: Metadata = { title: "Launch queue" };

/**
 * 2 Oct 2026: the paid campaigns that cannot go live yet, oldest waiting
 * first, each with the one click that moves it on. Suspense because the
 * reason and the search live in the URL (`useSearchParams`).
 */
export default function LaunchQueuePage() {
    return (
        <div className="space-y-5">
            <CampaignsNav />
            <Suspense fallback={null}>
                <LaunchQueueLoader />
            </Suspense>
        </div>
    );
}
