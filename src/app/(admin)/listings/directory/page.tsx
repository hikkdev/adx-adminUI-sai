import type { Metadata } from "next";
import { Suspense } from "react";
import { ListingsLoader } from "../listings-loader";
import { ListingsNav } from "../listings-nav";

export const metadata: Metadata = { title: "Listings" };

/**
 * The listings table — the section's second tab since the overview took
 * the root (2 Oct 2026). Drafts sit inside it, under the Status dropdown's
 * "Drafts" option. Suspense because the status and category live in the
 * URL (`useSearchParams`).
 */
export default function ListingsDirectoryPage() {
    return (
        <div className="space-y-5">
            <ListingsNav />
            <Suspense fallback={null}>
                <ListingsLoader />
            </Suspense>
        </div>
    );
}
