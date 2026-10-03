import type { Metadata } from "next";
import { AnalyticsLoader } from "./analytics-loader";
import { AnalyticsNav } from "./analytics-nav";

export const metadata: Metadata = { title: "Analytics" };

/**
 * The section's root. It grew a tab bar on 24 September, when Reports moved
 * here out of Settings; until then Analytics was a single page and needed
 * none.
 */
export default function AnalyticsPage() {
    return (
        <div className="space-y-5">
            <AnalyticsNav />
            <AnalyticsLoader />
        </div>
    );
}
