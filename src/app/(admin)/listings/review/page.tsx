import type { Metadata } from "next";
import { ListingsNav } from "../listings-nav";
import { ReviewLoader } from "./review-loader";

export const metadata: Metadata = { title: "Listing review" };

export default function ListingReviewPage() {
    return (
        <div className="space-y-5">
            <ListingsNav />
            <ReviewLoader />
        </div>
    );
}
