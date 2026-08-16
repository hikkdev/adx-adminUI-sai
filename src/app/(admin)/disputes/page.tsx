import type { Metadata } from "next";
import { SubNav } from "@/components/adx/sub-nav";
import { api } from "@/services";
import { DisputesView } from "./disputes-view";

export const metadata: Metadata = { title: "Disputes & Refunds" };

export default async function DisputesPage() {
    const [disputes, summary] = await Promise.all([
        api.disputes.list(),
        api.disputes.summary(),
    ]);
    return (
        <div className="space-y-5">
            <SubNav
                items={[
                    { label: "Disputes", href: "/disputes", exact: true },
                    { label: "Fraud investigation", href: "/disputes/fraud" },
                ]}
            />
            <DisputesView disputes={disputes} summary={summary} />
        </div>
    );
}
