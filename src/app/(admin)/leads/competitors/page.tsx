import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { CompetitorsLoader } from "./competitors-loader";

export const metadata: Metadata = { title: "Competitors" };

/** VA-2: competitors' hoardings our agents photographed — listed, analysed by the vision model on request, exported as a corpus. */
export default function CompetitorsPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <CompetitorsLoader />
        </div>
    );
}
