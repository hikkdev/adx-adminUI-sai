import type { Metadata } from "next";
import { Suspense } from "react";
import { KycNav } from "../kyc-nav";
import { PrintPartnerKycLoader } from "./print-partner-kyc-loader";

export const metadata: Metadata = { title: "Print partner KYC" };

/** Lot N — the print partner KYC queue, read on the client from `/print-partner-kyc`. Suspense because the loader keeps the state chip in `?state=`. */
export default function PrintPartnerKycPage() {
    return (
        <div className="space-y-5">
            <KycNav />
            <Suspense fallback={null}>
                <PrintPartnerKycLoader />
            </Suspense>
        </div>
    );
}
