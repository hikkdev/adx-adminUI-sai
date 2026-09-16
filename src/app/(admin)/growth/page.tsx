import type { Metadata } from "next";
import { GrowthLoader } from "./growth-loader";

export const metadata: Metadata = { title: "Growth CMS" };

/**
 * A client loader rather than an async server fetch: the API client keeps its
 * token in the browser, so the templates have to be read from there.
 */
export default function GrowthPage() {
    return <GrowthLoader />;
}
