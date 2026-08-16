import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { EmployeesNav } from "../employees-nav";
import { AttendanceTable } from "./attendance-table";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage() {
    const attendance = await api.hr.attendance();

    return (
        <div className="space-y-5">
            <PageHeader
                title="Attendance"
                subtitle="Check ins, work hours and exceptions across the team."
            />
            <EmployeesNav />
            <AttendanceTable attendance={attendance} />
        </div>
    );
}
