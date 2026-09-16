import type { Metadata } from "next";
import { Suspense } from "react";
import { SubNav } from "@/components/adx/sub-nav";
import { FraudLoader } from "./fraud-loader";

export const metadata: Metadata = { title: "Fraud Investigation" };

/** Suspense because the loader reads `?case=` off the URL to preselect the case a dispute links to. */
export default function FraudPage() {
    return (
        <div className="space-y-5">
            <SubNav
                items={[
                    { label: "Disputes", href: "/disputes", exact: true },
                    { label: "Fraud investigation", href: "/disputes/fraud" },
                ]}
            />
            <Suspense fallback={null}>
                <FraudLoader />
            </Suspense>
        </div>
    );
}
