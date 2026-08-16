import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import { api } from "@/services";
import { EMPLOYEE_TYPE_META, EMPLOYMENT_STATUS_META } from "@/types";

export const metadata: Metadata = { title: "Department" };

interface DepartmentDetailPageProps {
    params: Promise<{ slug: string }>;
}

export default async function DepartmentDetailPage({ params }: DepartmentDetailPageProps) {
    const { slug } = await params;
    const [department, employees] = await Promise.all([
        api.hr.department(slug),
        api.hr.employees(),
    ]);
    if (!department) notFound();

    const members = employees.filter((person) => person.department === department.name);
    const remote = members.filter((person) => person.type === "remote").length;

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/employees/departments"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Departments
                </Link>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {department.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{department.description}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "head",
                        label: "Department head",
                        value: department.head,
                        hint: "primary approver",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "members",
                        label: "Headcount",
                        value: String(members.length),
                        hint: `${remote} working remotely`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "roles",
                        label: "Open roles",
                        value: String(department.openRoles),
                        hint: department.openRoles ? "hiring in progress" : "fully staffed",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "regions",
                        label: "Regions covered",
                        value: String(new Set(members.map((person) => person.region)).size),
                        hint: "where the team sits",
                    }}
                />
            </div>

            <SimpleTable
                columns={[
                    {
                        key: "name",
                        label: "Member",
                        render: (row) => (
                            <Link
                                href={`/employees/directory/${row.id}`}
                                className="flex items-center gap-2.5 hover:underline"
                            >
                                <InitialsAvatar name={row.name} />
                                <span className="font-medium text-foreground">{row.name}</span>
                            </Link>
                        ),
                    },
                    { key: "designation", label: "Role", render: (row) => row.designation },
                    { key: "region", label: "Region", render: (row) => row.region },
                    {
                        key: "joined",
                        label: "Joined",
                        render: (row) => formatDate(row.joiningDate),
                    },
                    {
                        key: "type",
                        label: "Work mode",
                        render: (row) => <StatusBadge status={EMPLOYEE_TYPE_META[row.type]} />,
                    },
                    {
                        key: "employment",
                        label: "Employment",
                        render: (row) => (
                            <StatusBadge status={EMPLOYMENT_STATUS_META[row.employment]} />
                        ),
                    },
                ]}
                rows={members}
                rowKey={(row) => row.id}
                emptyMessage="No members in this department yet."
            />
        </div>
    );
}
