import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { IntegrityLoader } from "./integrity-loader";

export const metadata: Metadata = { title: "Lead integrity" };

/** LH10: the integrity desk — the scan's flags and the sampled field work. */
export default function LeadIntegrityPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <IntegrityLoader />
        </div>
    );
}
