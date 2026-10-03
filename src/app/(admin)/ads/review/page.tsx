import type { Metadata } from "next";
import { ReviewQueue } from "./review-queue";

export const metadata: Metadata = { title: "Ads · Review queue" };

/** LM-1: paid display ads waiting for their artwork to be looked at. Was `/growth/ads`. */
export default function AdsReviewPage() {
    return <ReviewQueue />;
}
