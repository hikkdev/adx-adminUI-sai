import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { SequencesLoader } from "./sequences-loader";

export const metadata: Metadata = { title: "Sequences" };

/** LH6: the scripted follow-up per side and temperature — steps, delays, templates, preview. */
export default function SequencesPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <SequencesLoader />
        </div>
    );
}
