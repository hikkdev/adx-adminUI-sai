import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { StorageLoader } from "./storage-loader";

export const metadata: Metadata = { title: "Storage" };

/** ST-4 (28 Sep 2026): space by purpose, the largest files, the files nothing refers to, and the weekly sweep's removal switch. */
export default function StorageSettingsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <StorageLoader />
        </div>
    );
}
