import type { Metadata } from "next";
import { ReviewCaseLoader } from "./review-case-loader";

export const metadata: Metadata = { title: "Listing review" };

export default async function ReviewCasePage({
    params,
}: {
    params: Promise<{ listingId: string }>;
}) {
    const { listingId } = await params;
    return <ReviewCaseLoader listingId={listingId} />;
}
