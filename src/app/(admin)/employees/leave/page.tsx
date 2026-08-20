import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { EmployeesNav } from "../employees-nav";
import { LeaveView } from "./leave-view";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage() {
    const leave = await api.hr.leave();

    return (
        <div className="space-y-5">
            <PageHeader
                title="Leave"
                subtitle="Leave requests waiting on HR approval."
            />
            <EmployeesNav />
            <LeaveView leave={leave} />
        </div>
    );
}
