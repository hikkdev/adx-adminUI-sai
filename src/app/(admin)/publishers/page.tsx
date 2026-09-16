import type { Metadata } from "next";
import { Suspense } from "react";
import { PublishersOverviewView } from "./publishers-overview";

export const metadata: Metadata = { title: "Publishers" };

/**
 * The section's landing tab — package O-C: the overview over
 * `GET /section-overviews/publishers`. The directory moved to
 * `/publishers/directory`; the activation funnel and the import are the
 * tabs beside it. Suspense because the loader keeps the window in the URL
 * (`useSearchParams`).
 */
export default function PublishersPage() {
    return (
        <Suspense fallback={null}>
            <PublishersOverviewView />
        </Suspense>
    );
}
