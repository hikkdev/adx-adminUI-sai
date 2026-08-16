import type { Metadata } from "next";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { formatINR } from "@/lib/format";
import { api } from "@/services";
import { EmployeesNav } from "../employees-nav";
import { PayrollTable } from "./payroll-table";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage() {
    const payroll = await api.hr.payroll();

    const totalNet = payroll.reduce((sum, row) => sum + row.netPay, 0);
    const paid = payroll.filter((row) => row.status === "paid");
    const paidNet = paid.reduce((sum, row) => sum + row.netPay, 0);
    const deductions = payroll.reduce((sum, row) => sum + row.deductions, 0);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Payroll"
                subtitle="July 2026 run. Salaries release after attendance sign off."
            />
            <EmployeesNav />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "net",
                        label: "Net payable",
                        value: formatINR(totalNet),
                        hint: `${payroll.length} employees`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "paid",
                        label: "Released",
                        value: formatINR(paidNet),
                        hint: `${paid.length} paid on 31 Jul`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "pending",
                        label: "Awaiting release",
                        value: formatINR(totalNet - paidNet),
                        hint: `${payroll.length - paid.length} employees`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "deductions",
                        label: "Deductions",
                        value: formatINR(deductions),
                        hint: "late marks and advances",
                    }}
                />
            </div>
            <PayrollTable payroll={payroll} />
        </div>
    );
}
