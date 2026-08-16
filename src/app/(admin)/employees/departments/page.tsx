import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { EmployeesNav } from "../employees-nav";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
    const departments = await api.hr.departments();

    return (
        <div className="space-y-5">
            <PageHeader
                title="Departments"
                subtitle="Team structure with heads, headcount and open roles."
            />
            <EmployeesNav />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {departments.map((department) => (
                    <Card
                        key={department.slug}
                        className="group rounded-lg border-border p-5 shadow-none transition-shadow hover:shadow-sm"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold text-foreground">
                                    {department.name}
                                </h2>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Head: {department.head}
                                </p>
                            </div>
                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                {department.headcount}{" "}
                                {department.headcount === 1 ? "member" : "members"}
                            </span>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                            {department.description}
                        </p>
                        <div className="mt-4 flex items-center justify-between border-t pt-3">
                            <span className="text-xs text-muted-foreground">
                                {department.openRoles
                                    ? `${department.openRoles} open ${department.openRoles === 1 ? "role" : "roles"}`
                                    : "No open roles"}
                            </span>
                            <Link
                                href={`/employees/departments/${department.slug}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                                View team
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
