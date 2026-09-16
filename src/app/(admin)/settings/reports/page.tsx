import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { ReportsLoader } from "./reports-loader";

export const metadata: Metadata = { title: "Reports" };

/**
 * Lot G (package CG4, Q129): `/settings/reports` replaces `/settings/exports`.
 * The frame (5102:46196) drew scheduled exports; what the backend has is a
 * catalogue of twelve reports, run now or on a cadence, so the route is
 * named for the thing it shows.
 */
export default function ReportsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <ReportsLoader />
        </div>
    );
}
