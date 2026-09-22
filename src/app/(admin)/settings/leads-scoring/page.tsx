import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { LeadsScoringLoader } from "./leads-scoring-loader";

export const metadata: Metadata = { title: "Leads scoring" };

/** LH1 (the Lead Hunt): the five signals behind hot / warm / cold — weights, decay, thresholds, the category table. */
export default function LeadsScoringSettingsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <LeadsScoringLoader />
        </div>
    );
}
