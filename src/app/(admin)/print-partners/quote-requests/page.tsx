import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { PrintPartnersNav } from "../print-partners-nav";
import { QuoteRequestsLoader } from "../quote-requests-loader";

export const metadata: Metadata = { title: "Quote requests" };

/** The quote requests out across orders (Lot H, Q147) — the desk's third tab, a route of its own since package O-C. */
export default function PrintQuoteRequestsPage() {
    return (
        <div className="space-y-5">
            <PrintPartnersNav />
            <PageHeader title="Quote requests" subtitle="Every request for print quotes out across orders — who was invited, what came back, and which award is waiting on ops." />
            <QuoteRequestsLoader />
        </div>
    );
}
