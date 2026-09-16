import type { Metadata } from "next";
import { EngineSettingsLoader } from "./settings-loader";

export const metadata: Metadata = { title: "Engine settings" };

export default function EngineSettingsPage() {
    return <EngineSettingsLoader />;
}
