import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { SystemHealthLoader } from "./system-health-loader";

export const metadata: Metadata = { title: "System Health" };

export default function SystemHealthPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <SystemHealthLoader />
        </div>
    );
}
