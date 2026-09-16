import type { Metadata } from "next";
import { PackagesNav } from "../packages-nav";
import { CatalogueLoader } from "./catalogue-loader";

export const metadata: Metadata = { title: "Subscription plans" };

/**
 * A client loader rather than an async server fetch: the API client keeps its
 * token in the browser, so the catalogue has to be read from there. Lot J-C:
 * one page for both user types, the tab in `?for=`.
 */
export default function PackageCataloguePage() {
    return (
        <div className="space-y-5">
            <PackagesNav />
            <CatalogueLoader />
        </div>
    );
}
