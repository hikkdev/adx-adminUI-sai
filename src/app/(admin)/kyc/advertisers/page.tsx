import type { Metadata } from "next";
import { Suspense } from "react";
import { KycNav } from "../kyc-nav";
import { AdvertiserKycLoader } from "./advertiser-kyc-loader";

export const metadata: Metadata = { title: "Advertiser KYC" };

/** The advertiser KYC tab. Suspense because the loader keeps the state chip in `?state=`. */
export default function AdvertiserKycPage() {
    return (
        <div className="space-y-5">
            <KycNav />
            <Suspense fallback={null}>
                <AdvertiserKycLoader />
            </Suspense>
        </div>
    );
}
