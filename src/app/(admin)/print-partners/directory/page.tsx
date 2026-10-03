import type { Metadata } from "next";
import { PrintPartnersLoader } from "../print-partners-loader";
import { PrintPartnersNav } from "../print-partners-nav";

export const metadata: Metadata = { title: "Print partner directory" };

/**
 * The directory of shops — `GET /print-partners` on the list contract; the
 * desk's second tab since package O-C put the overview at the root. It was
 * `/print-partners/roster` until 24 September, when the owner pointed out
 * that every other party section calls this list a Directory.
 */
export default function PrintPartnersDirectoryPage() {
    return (
        <div className="space-y-5">
            <PrintPartnersNav />
            <PrintPartnersLoader />
        </div>
    );
}
