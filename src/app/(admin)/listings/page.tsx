import type { Metadata } from "next";
import { Suspense } from "react";
import { ListingsOverviewView } from "./listings-overview";

export const metadata: Metadata = { title: "Listings" };

/**
 * The section's landing tab — 2 Oct 2026: the overview over
 * `GET /section-overviews/listings`, as Publishers has one. The table moved
 * to `/listings/directory`. Suspense because the loader keeps the window in
 * the URL (`useSearchParams`).
 */
export default function ListingsPage() {
    return (
        <Suspense fallback={null}>
            <ListingsOverviewView />
        </Suspense>
    );
}
