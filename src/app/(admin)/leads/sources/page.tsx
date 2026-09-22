import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { SourcesLoader } from "./sources-loader";

export const metadata: Metadata = { title: "Lead sources" };

/** LH3: where leads come from — the directory feeds with their credential state and runs, the inbound doors, the referrals. */
export default function LeadSourcesPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <SourcesLoader />
        </div>
    );
}
