import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignsLoader } from "./campaigns-loader";

export const metadata: Metadata = { title: "Campaigns" };

/** Suspense because the loader reads `?advertiserId=` off the URL — the advertiser page's "View campaign queue". */
export default function CampaignsPage() {
    return (
        <Suspense fallback={null}>
            <CampaignsLoader />
        </Suspense>
    );
}
