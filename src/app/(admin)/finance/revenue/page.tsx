import type { Metadata } from "next";
import { RevenueLoader } from "./revenue-loader";

export const metadata: Metadata = { title: "Commission & fees" };

export default function RevenuePage() {
    return <RevenueLoader />;
}
