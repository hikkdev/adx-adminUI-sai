import type { Metadata } from "next";
import { api } from "@/services";
import { FinanceNav } from "./finance-nav";
import { WithdrawalsView } from "./withdrawals-view";

export const metadata: Metadata = { title: "Finance" };

export default async function FinancePage() {
    const withdrawals = await api.finance.withdrawals();
    return (
        <div className="space-y-5">
            <FinanceNav />
            <WithdrawalsView withdrawals={withdrawals} />
        </div>
    );
}
