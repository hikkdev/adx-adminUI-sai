import type { Metadata } from "next";
import { ListingsNav } from "../listings-nav";
import { ClaimsLoader } from "./claims-loader";

export const metadata: Metadata = { title: "Listing claims" };

/** Q-C item 3 — ownership claims on scraped listings, decided here over `/supply/claims`. */
export default function ListingClaimsPage() {
    return (
        <div className="space-y-5">
            <ListingsNav />
            <ClaimsLoader />
        </div>
    );
}
