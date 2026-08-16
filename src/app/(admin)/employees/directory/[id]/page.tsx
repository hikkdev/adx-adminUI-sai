import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { DetailShell } from "@/components/adx/detail-shell";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import { api } from "@/services";
import { EMPLOYEE_TYPE_META, EMPLOYMENT_STATUS_META } from "@/types";

export const metadata: Metadata = { title: "Employee Profile" };

interface EmployeeProfilePageProps {
    params: Promise<{ id: string }>;
}

export default async function EmployeeProfilePage({ params }: EmployeeProfilePageProps) {
    const { id } = await params;
    const employee = await api.hr.employee(id);
    if (!employee) notFound();

    const tenureYears = Math.max(
        1,
        Math.round(
            (new Date("2026-08-10").getTime() - new Date(employee.joiningDate).getTime()) /
                (365 * 86400000)
        )
    );

    return (
        <DetailShell
            backHref="/employees/directory"
            backLabel="Directory"
            title={employee.name}
            subtitle={`${employee.designation} · ${employee.department}`}
            actions={
                <div className="flex items-center gap-2">
                    <StatusBadge status={EMPLOYEE_TYPE_META[employee.type]} />
                    <StatusBadge status={EMPLOYMENT_STATUS_META[employee.employment]} />
                </div>
            }
            kpis={[
                {
                    id: "code",
                    label: "Employee ID",
                    value: employee.employeeCode,
                    hint: "HRMS reference",
                },
                {
                    id: "joined",
                    label: "Joined",
                    value: formatDate(employee.joiningDate),
                    hint: `about ${tenureYears} ${tenureYears === 1 ? "year" : "years"} at ADX`,
                },
                {
                    id: "region",
                    label: "Region",
                    value: employee.region,
                    hint: employee.location,
                },
                {
                    id: "week",
                    label: "Working days",
                    value: `${employee.workingDays} days`,
                    hint: "per week",
                },
            ]}
            tabs={[
                {
                    value: "personal",
                    label: "Personal",
                    content: (
                        <div className="grid gap-4 xl:grid-cols-2">
                            <SectionCard title="Personal information">
                                <FieldList
                                    items={[
                                        ["Full name", employee.name],
                                        ["Mobile", employee.mobile],
                                        ["Personal email", employee.email],
                                        ["Date of birth", formatDate(employee.dob)],
                                        ["Gender", employee.gender],
                                        ["Marital status", employee.maritalStatus],
                                        ["Nationality", employee.nationality],
                                    ]}
                                />
                            </SectionCard>
                            <SectionCard title="Address">
                                <p className="text-sm text-foreground">{employee.address}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {employee.region}
                                </p>
                            </SectionCard>
                        </div>
                    ),
                },
                {
                    value: "professional",
                    label: "Professional",
                    content: (
                        <SectionCard title="Professional information">
                            <FieldList
                                items={[
                                    ["Employee ID", employee.employeeCode],
                                    ["Official email", employee.officialEmail],
                                    ["Department", employee.department],
                                    ["Designation", employee.designation],
                                    [
                                        "Work mode",
                                        <StatusBadge
                                            key="mode"
                                            status={EMPLOYEE_TYPE_META[employee.type]}
                                        />,
                                    ],
                                    [
                                        "Employment",
                                        <StatusBadge
                                            key="employment"
                                            status={EMPLOYMENT_STATUS_META[employee.employment]}
                                        />,
                                    ],
                                    ["Joining date", formatDate(employee.joiningDate)],
                                    ["Working days", `${employee.workingDays} per week`],
                                    ["Location", employee.location],
                                ]}
                            />
                        </SectionCard>
                    ),
                },
                {
                    value: "documents",
                    label: "Documents",
                    content: (
                        <SimpleTable
                            columns={[
                                {
                                    key: "label",
                                    label: "Document",
                                    render: (row) => (
                                        <span className="flex items-center gap-2 font-medium text-foreground">
                                            <FileText className="size-4 text-muted-foreground" />
                                            {row.label}
                                        </span>
                                    ),
                                },
                                { key: "file", label: "File", render: (row) => row.file },
                                {
                                    key: "uploaded",
                                    label: "Uploaded",
                                    render: (row) =>
                                        row.uploaded ? formatDate(row.uploaded) : "Not uploaded",
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (row) => (
                                        <StatusBadge
                                            status={
                                                row.uploaded
                                                    ? { label: "On file", tone: "success" }
                                                    : { label: "Missing", tone: "warning" }
                                            }
                                        />
                                    ),
                                },
                            ]}
                            rows={employee.documents}
                            rowKey={(row) => row.label}
                        />
                    ),
                },
                {
                    value: "accounts",
                    label: "Account access",
                    content: (
                        <SectionCard title="Connected accounts">
                            <FieldList
                                items={employee.accounts.map(
                                    (account) => [account.label, account.value] as [string, string]
                                )}
                            />
                        </SectionCard>
                    ),
                },
            ]}
        />
    );
}
