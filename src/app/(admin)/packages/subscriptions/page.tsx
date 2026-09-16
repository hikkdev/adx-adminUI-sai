import type { Metadata } from "next";
import { PackagesNav } from "../packages-nav";
import { SubscriptionsLoader } from "./subscriptions-loader";

export const metadata: Metadata = { title: "Publisher subscriptions" };

/**
 * A client loader rather than an async server fetch: the API client keeps its
 * token in the browser, so the book has to be read from there. Lot J-C: the
 * subscriptions and the order book, the tab and the facets in the URL.
 */
export default function PublisherSubscriptionsPage() {
    return (
        <div className="space-y-5">
            <PackagesNav />
            <SubscriptionsLoader />
        </div>
    );
}
