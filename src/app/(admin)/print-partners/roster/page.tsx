import type { Metadata } from "next";
import { PrintPartnersLoader } from "../print-partners-loader";
import { PrintPartnersNav } from "../print-partners-nav";

export const metadata: Metadata = { title: "Print partner roster" };

/** The roster of shops — `GET /print-partners` on the list contract; the desk's second tab since package O-C put the overview at the root. */
export default function PrintPartnersRosterPage() {
    return (
        <div className="space-y-5">
            <PrintPartnersNav />
            <PrintPartnersLoader />
        </div>
    );
}
