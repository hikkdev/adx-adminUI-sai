import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { EmployeesNav } from "./employees-nav";
import { EmployeesOverview } from "./employees-overview";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage() {
    const [employees, overview, attendance, jobs, leave] = await Promise.all([
        api.hr.employees(),
        api.hr.overview(),
        api.hr.attendance(),
        api.hr.jobs(),
        api.hr.leave(),
    ]);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Employees"
                subtitle="Staff records, attendance and people operations."
                actions={
                    <Button asChild>
                        <Link href="/employees/new">
                            <Plus className="size-4" />
                            Add employee
                        </Link>
                    </Button>
                }
            />
            <EmployeesNav />
            <EmployeesOverview
                employees={employees}
                overview={overview}
                attendance={attendance}
                jobs={jobs}
                leave={leave}
            />
        </div>
    );
}
