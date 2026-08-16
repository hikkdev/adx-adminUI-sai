import type { Metadata } from "next";
import { api } from "@/services";
import { PricingNav } from "../pricing-nav";
import { ApprovalsView } from "./approvals-view";

export const metadata: Metadata = { title: "Price Approvals" };

export default async function PriceApprovalsPage() {
    const approvals = await api.pricing.approvals();
    return (
        <div className="space-y-5">
            <PricingNav />
            <ApprovalsView approvals={approvals} />
        </div>
    );
}
