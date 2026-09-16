import type { Metadata } from "next";
import { PublishersLoader } from "../publishers-loader";
import { PublishersNav } from "../publishers-nav";

export const metadata: Metadata = { title: "Publisher directory" };

/** The directory — the section's second tab since package O-C put the overview at the root (N3-C: the activation funnel and the import are the tabs beside it, not rail rows). */
export default function PublishersDirectoryPage() {
    return (
        <div className="space-y-5">
            <PublishersNav />
            <PublishersLoader />
        </div>
    );
}
