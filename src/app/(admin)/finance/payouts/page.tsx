import type { Metadata } from "next";
import { api } from "@/services";
import { FinanceNav } from "../finance-nav";
import { PayoutsView } from "./payouts-view";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage() {
    const batches = await api.finance.payoutBatches();
    return (
        <div className="space-y-5">
            <FinanceNav />
            <PayoutsView batches={batches} />
        </div>
    );
}
