import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { ZonesLoader } from "./zones-loader";

export const metadata: Metadata = { title: "Priority zones" };

/** LH5 (D7): a locality or a category worth a top-up for a while, under its budget and the monthly cap. */
export default function PriorityZonesPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <ZonesLoader />
        </div>
    );
}
