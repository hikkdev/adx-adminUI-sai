import type { Metadata } from "next";
import { ScraperLoader } from "./scraper-loader";

export const metadata: Metadata = { title: "Event sources" };

export default function ScraperPage() {
    return <ScraperLoader />;
}
