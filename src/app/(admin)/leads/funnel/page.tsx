import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { FunnelLoader } from "./funnel-loader";

export const metadata: Metadata = { title: "Leads funnel" };

/** LH2 (LH9 finishes it): the funnel by stage, source, agent, city, category and channel — aggregates only. */
export default function LeadsFunnelPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <FunnelLoader />
        </div>
    );
}
