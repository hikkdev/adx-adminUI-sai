import type { Metadata } from "next";
import { AiLoader } from "./ai-loader";

export const metadata: Metadata = { title: "AI settings" };

export default function AiSettingsPage() {
    return <AiLoader />;
}
