import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadsOverviewView } from "./leads-overview";

export const metadata: Metadata = { title: "Leads" };

/**
 * LH9: the section's landing tab — the overview over
 * `GET /section-overviews/leads`. The list moved to `/leads/list`.
 * Suspense because the loader keeps the window in the URL.
 */
export default function LeadsPage() {
    return (
        <Suspense fallback={null}>
            <LeadsOverviewView />
        </Suspense>
    );
}
