import type { Metadata } from "next";
import { AdsOverview } from "./overview-view";

export const metadata: Metadata = { title: "Ads · Overview" };

/**
 * AS-1 (27 Sep 2026): the Ads & sponsored section's Overview — its own
 * numbers, with what was the Performance tab. `/growth/ads/performance`
 * redirects here (`next.config.ts`).
 */
export default function AdsOverviewPage() {
    return <AdsOverview />;
}
