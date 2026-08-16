import type { Metadata } from "next";
import { api } from "@/services";
import { FinanceNav } from "../finance-nav";
import { InvoicesView } from "./invoices-view";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
    const invoices = await api.finance.invoices();
    return (
        <div className="space-y-5">
            <FinanceNav />
            <InvoicesView invoices={invoices} />
        </div>
    );
}
