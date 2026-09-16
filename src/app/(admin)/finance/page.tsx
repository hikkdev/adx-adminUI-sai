import type { Metadata } from "next";
import { WithdrawalsLoader } from "./withdrawals-loader";

export const metadata: Metadata = { title: "Finance" };

export default function FinancePage() {
    return <WithdrawalsLoader />;
}
