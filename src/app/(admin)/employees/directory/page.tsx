import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { EmployeesNav } from "../employees-nav";
import { DirectoryTable } from "./directory-table";

export const metadata: Metadata = { title: "Employee Directory" };

export default async function EmployeeDirectoryPage() {
    const employees = await api.hr.employees();

    return (
        <div className="space-y-5">
            <PageHeader
                title="Directory"
                subtitle={`${employees.length} people on the ADX team.`}
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
            <DirectoryTable employees={employees} />
        </div>
    );
}
