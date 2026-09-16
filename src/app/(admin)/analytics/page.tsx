import type { Metadata } from "next";
import { AnalyticsLoader } from "./analytics-loader";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
    return <AnalyticsLoader />;
}
