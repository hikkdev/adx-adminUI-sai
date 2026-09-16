import type { Metadata } from "next";
import { SettingsNav } from "./settings-nav";
import { SettingsLoader } from "./settings-loader";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <SettingsLoader />
        </div>
    );
}
