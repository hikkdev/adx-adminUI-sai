import type { Metadata } from "next";
import { AnalyticsNav } from "../analytics-nav";
import { ReportsLoader } from "./reports-loader";

export const metadata: Metadata = { title: "Reports" };

/**
 * Lot G (package CG4, Q129): the frame (5102:46196) drew scheduled exports;
 * what the backend has is a catalogue of thirteen reports, run now or on a
 * cadence, so the route is named for the thing it shows.
 *
 * It was `/settings/reports` until 24 September, when the owner moved it
 * beside Analytics: Settings is for what you configure once, and a report is
 * work you repeat. `next.config.ts` redirects the old path.
 */
export default function ReportsPage() {
    return (
        <div className="space-y-5">
            <AnalyticsNav />
            <ReportsLoader />
        </div>
    );
}
