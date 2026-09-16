import type { Metadata } from "next";
import { Suspense } from "react";
import { KycNav } from "./kyc-nav";
import { KycQueueLoader } from "./kyc-queue-loader";

export const metadata: Metadata = { title: "KYC Queue" };

/** D7 / Lot D — the publisher KYC queue, read on the client from `/publishers/kyc-queue`. Suspense because the loader keeps the state chip in `?state=`. */
export default function KycQueuePage() {
    return (
        <div className="space-y-5">
            <KycNav />
            <Suspense fallback={null}>
                <KycQueueLoader />
            </Suspense>
        </div>
    );
}
