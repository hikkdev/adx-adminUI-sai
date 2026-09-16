import type { Metadata } from "next";
import { PackagesNav } from "../packages-nav";
import { SalesLoader } from "./sales-loader";

export const metadata: Metadata = { title: "Package sales" };

/**
 * A client loader rather than an async server fetch: the API client keeps its
 * token in the browser, so the sales have to be read from there.
 */
export default function PackageSalesPage() {
    return (
        <div className="space-y-5">
            <PackagesNav />
            <SalesLoader />
        </div>
    );
}
