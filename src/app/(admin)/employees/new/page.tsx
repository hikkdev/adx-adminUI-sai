import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { api } from "@/services";
import { AddEmployeeWizard } from "./add-employee-wizard";

export const metadata: Metadata = { title: "Add Employee" };

export default async function AddEmployeePage() {
    const departments = await api.hr.departments();

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Link
                href="/employees/directory"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ChevronLeft className="size-4" />
                Directory
            </Link>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Add employee
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Five short steps: personal, professional, documents, account access, review.
                </p>
            </div>
            <AddEmployeeWizard departments={departments.map((department) => department.name)} />
        </div>
    );
}
