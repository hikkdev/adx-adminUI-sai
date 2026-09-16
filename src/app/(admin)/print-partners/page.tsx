import type { Metadata } from "next";
import { Suspense } from "react";
import { PrintPartnersOverviewView } from "./print-partners-overview";

export const metadata: Metadata = { title: "Print partners" };

/**
 * The print partner desk — a rail row of its own since 14 September (the
 * owner: out of Settings, into the main navigation). Package O-C: the
 * section's landing tab is the overview over
 * `GET /section-overviews/print-partners`; the roster is at
 * `/print-partners/roster` and the quote requests beside it. Suspense
 * because the loader keeps the window in the URL.
 */
export default function PrintPartnersPage() {
    return (
        <Suspense fallback={null}>
            <PrintPartnersOverviewView />
        </Suspense>
    );
}
