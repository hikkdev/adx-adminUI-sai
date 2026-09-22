import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { TrackingLoader } from "./tracking-loader";

export const metadata: Metadata = { title: "Live tracking" };

/** LT-1 (live agent tracking): the ping cadence, the trail retention, the geofence, the alert thresholds and the parties' ETA. */
export default function TrackingSettingsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <TrackingLoader />
        </div>
    );
}
