import type { Metadata } from "next";
import { SettingsLoader } from "./settings-loader";

export const metadata: Metadata = { title: "Finance settings" };

export default function FinanceSettingsPage() {
    return <SettingsLoader />;
}
