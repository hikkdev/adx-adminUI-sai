import type { Metadata } from "next";
import { OrdersNav } from "../orders-nav";
import { FraudReviewLoader } from "./fraud-review-loader";

export const metadata: Metadata = { title: "Fraud review" };

/**
 * Order screening (the owner, 2 Oct 2026): the orders the automatic score
 * flagged, for a person to hold, release, clear or cancel as fraud — the
 * Orders section's fourth tab.
 */
export default function FraudReviewPage() {
    return (
        <div className="space-y-5">
            <OrdersNav />
            <FraudReviewLoader />
        </div>
    );
}
