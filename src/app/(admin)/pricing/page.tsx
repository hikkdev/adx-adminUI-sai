import type { Metadata } from "next";
import { OverviewLoader } from "./overview-loader";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingOverviewPage() {
    return <OverviewLoader />;
}
