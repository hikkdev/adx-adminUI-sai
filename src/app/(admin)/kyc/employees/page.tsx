import type { Metadata } from "next";
import { Suspense } from "react";
import { KycNav } from "../kyc-nav";
import { EmployeeKycLoader } from "./employee-kyc-loader";

export const metadata: Metadata = { title: "Employee KYC" };

/** Lot D (Q131) — the fourth KYC tab: employees; N3-B: every employee, from the moment the row exists. Suspense because the loader keeps the state chip in `?state=`. */
export default function EmployeeKycPage() {
    return (
        <div className="space-y-5">
            <KycNav />
            <Suspense fallback={null}>
                <EmployeeKycLoader />
            </Suspense>
        </div>
    );
}
