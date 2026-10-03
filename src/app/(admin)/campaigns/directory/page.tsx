import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsLoader } from "../campaigns-loader";
import { CampaignsNav } from "../campaigns-nav";

export const metadata: Metadata = { title: "Campaigns" };

/**
 * The campaigns list — the section's second tab since the overview took
 * the root (2 Oct 2026). Suspense because every filter lives in the URL
 * (`useSearchParams`): the overview's tiles, the advertiser page's "View
 * campaign queue" and a pasted link all open it already narrowed.
 */
export default function CampaignsDirectoryPage() {
    return (
        <div className="space-y-5">
            <CampaignsNav />
            <Suspense fallback={null}>
                <CampaignsLoader />
            </Suspense>
        </div>
    );
}
