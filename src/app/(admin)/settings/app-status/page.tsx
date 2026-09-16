import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { AppStatusLoader } from "./app-status-loader";

export const metadata: Metadata = { title: "App status" };

export default function AppStatusPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <AppStatusLoader />
        </div>
    );
}
