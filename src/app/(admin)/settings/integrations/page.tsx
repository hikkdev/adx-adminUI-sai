import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { IntegrationsLoader } from "./integrations-loader";

export const metadata: Metadata = { title: "Integrations & API Keys" };

export default function IntegrationsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <IntegrationsLoader />
        </div>
    );
}
