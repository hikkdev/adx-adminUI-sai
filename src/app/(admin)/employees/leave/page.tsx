import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { EmployeesNav } from "../employees-nav";
import { LeaveView } from "./leave-view";

export const metadata: Metadata = { title: "Leave & Holidays" };

export default async function LeavePage() {
    const [leave, holidays] = await Promise.all([api.hr.leave(), api.hr.holidays()]);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Leave & holidays"
                subtitle="Leave requests waiting on HR, plus the 2026 holiday calendar."
            />
            <EmployeesNav />
            <LeaveView leave={leave} holidays={holidays} />
        </div>
    );
}
