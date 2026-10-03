import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { FraudSettingsLoader } from "./fraud-settings-loader";

export const metadata: Metadata = { title: "Fraud" };

/** Order screening (2 Oct 2026): whether orders are scored, the review and hold lines, the automatic holds switch, and the signals' own numbers. */
export default function FraudSettingsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <FraudSettingsLoader />
        </div>
    );
}
