import type { Metadata } from "next";
import { FinanceNav } from "../finance-nav";
import { ReconciliationView } from "./reconciliation-view";

export const metadata: Metadata = { title: "Reconciliation" };

export default function ReconciliationPage() {
    return (
        <div className="space-y-5">
            <FinanceNav />
            <ReconciliationView />
        </div>
    );
}
