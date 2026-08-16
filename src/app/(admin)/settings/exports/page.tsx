import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { ExportsView } from "./exports-view";

export const metadata: Metadata = { title: "Scheduled Exports" };

export default function ExportsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <ExportsView />
        </div>
    );
}
