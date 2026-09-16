import type { Metadata } from "next";
import { MarketDataLoader } from "./market-data-loader";

export const metadata: Metadata = { title: "Market data" };

export default function MarketDataPage() {
    return <MarketDataLoader />;
}
