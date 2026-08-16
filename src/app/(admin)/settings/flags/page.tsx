import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { FlagsView } from "./flags-view";

export const metadata: Metadata = { title: "Feature Flags" };

export default function FlagsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <FlagsView />
        </div>
    );
}
