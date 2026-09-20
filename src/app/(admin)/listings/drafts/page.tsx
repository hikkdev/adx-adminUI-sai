import type { Metadata } from "next";
import { ListingsNav } from "../listings-nav";
import { DraftsLoader } from "./drafts-loader";

export const metadata: Metadata = { title: "Listing drafts" };

/** QR-8 — the spots publishers saved half-way on their phones, for the sales and onboarding teams to follow up. */
export default function ListingDraftsPage() {
    return (
        <div className="space-y-5">
            <ListingsNav />
            <DraftsLoader />
        </div>
    );
}
