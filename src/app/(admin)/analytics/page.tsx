import type { Metadata } from "next";
import {
    analyticsKpis,
    dailyGmv,
    gmvByCategory,
    topPublishers,
} from "@/data/analytics";
import { AnalyticsView } from "./analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
    return (
        <AnalyticsView
            kpis={analyticsKpis}
            dailyGmv={dailyGmv}
            gmvByCategory={gmvByCategory}
            topPublishers={topPublishers}
        />
    );
}
