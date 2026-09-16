import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { IdentifiersLoader } from "./identifiers-loader";

export const metadata: Metadata = { title: "Identifiers" };

export default function IdentifiersPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <IdentifiersLoader />
        </div>
    );
}
