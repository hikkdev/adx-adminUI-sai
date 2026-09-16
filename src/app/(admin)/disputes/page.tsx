import type { Metadata } from "next";
import { SubNav } from "@/components/adx/sub-nav";
import { DisputesLoader } from "./disputes-loader";

export const metadata: Metadata = { title: "Disputes & Refunds" };

export default function DisputesPage() {
    return (
        <div className="space-y-5">
            <SubNav
                items={[
                    { label: "Disputes", href: "/disputes", exact: true },
                    { label: "Fraud investigation", href: "/disputes/fraud" },
                ]}
            />
            <DisputesLoader />
        </div>
    );
}
