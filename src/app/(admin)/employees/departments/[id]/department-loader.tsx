"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDate } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { departmentsService, headLabel, type DepartmentDetail, type DepartmentMember } from "@/services/departments";
import { EMPLOYEE_STATUS_META, EMPLOYMENT_TYPE_META, WORK_MODE_META } from "@/services/employees";
import { EmployeesOffline } from "../../employees-nav";

/**
 * The DR 10 frame `Department · /employees/departments/design` (`5102:30881`).
 *
 * The frame's back link, heading with the description under it, the four
 * tiles — Department head, Headcount ("n working remotely"), Open roles,
 * Regions covered — and the member table with its Region, Work mode and
 * Employment columns are all drawn from `GET /hr/departments/:id` now that
 * Lot G (Q122/Q140) put a record behind a department and the work fields
 * on the row. G11-1: the frame's **Joined** column prints the row's
 * `joinedAt` — the Employee row's `createdAt`, "on record since", not the
 * joining date, which the HR tool holds (Q98) — and the header says so.
 * The head tile's "primary approver" line is the head's designation,
 * which is what the row says about them.
 */
export function DepartmentLoader({ id }: { id: string }) {
    const live = isLive("employees");
    const resource = useApiResource<DepartmentDetail | null>(`hr:department:${id}:${live}`, async () => {
        if (!live) return null;
        try {
            return await departmentsService.get(id);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    });

    if (!live) return <EmployeesOffline title="Department" subtitle="One team: its head, open roles, regions and members." />;

    return (
        <ResourceBoundary resource={resource}>
            {(department) => {
                if (!department) notFound();
                const remote = department.members.filter((member) => member.workMode === "REMOTE").length;
                const active = department.members.filter((member) => member.active).length;
                const head = headLabel(department);
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
                                <span className="ml-2 align-middle font-mono text-xs font-normal text-muted-foreground">{department.code}</span>
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {department.description ?? "No description yet — add one from the grid's Edit."}
                                {department.parent ? ` Sits under ${department.parent.name}.` : ""}
                            </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <KpiCard
                                stat={{
                                    id: "head",
                                    label: "Department head",
                                    value: head ?? "—",
                                    hint: department.head?.designation ?? (head ? "no designation on record" : "nobody named yet"),
                                }}
                            />
                            <KpiCard
                                stat={{
                                    id: "headcount",
                                    label: "Headcount",
                                    value: String(department.memberCount),
                                    hint: `${remote} working remotely${department.memberCount - active > 0 ? ` · ${department.memberCount - active} inactive` : ""}`,
                                }}
                            />
                            <KpiCard
                                stat={{
                                    id: "roles",
                                    label: "Open roles",
                                    value: String(department.openRoles),
                                    hint: department.openRoles > 0 ? "hiring in progress" : "nothing open",
                                }}
                            />
                            <KpiCard
                                stat={{
                                    id: "regions",
                                    label: "Regions covered",
                                    value: String(department.regions.length),
                                    hint: department.regions.length ? department.regions.join(", ") : "where the team sits",
                                }}
                            />
                        </div>

                        {department.children.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                                Under it:{" "}
                                {department.children.map((child, index) => (
                                    <span key={child.id}>
                                        {index > 0 ? ", " : ""}
                                        <Link href={`/employees/departments/${encodeURIComponent(child.id)}`} className="font-medium text-primary hover:underline">
                                            {child.name}
                                        </Link>{" "}
                                        ({child.memberCount})
                                    </span>
                                ))}
                            </p>
                        )}

                        <SimpleTable
                            columns={[
                                {
                                    key: "name",
                                    label: "Member",
                                    render: (row: DepartmentMember) => (
                                        <Link href={`/employees/directory/${row.userId}`} className="flex items-center gap-2.5 hover:underline">
                                            <InitialsAvatar name={row.name ?? row.email ?? row.userId} />
                                            <span>
                                                <span className="block font-medium text-foreground">{row.name ?? row.email ?? row.userId}</span>
                                                <span className="block text-xs text-muted-foreground">{row.displayId ?? "No EMP id yet"}</span>
                                            </span>
                                        </Link>
                                    ),
                                },
                                { key: "designation", label: "Role", render: (row) => row.designation ?? "—" },
                                { key: "region", label: "Region", render: (row) => row.region ?? "—" },
                                {
                                    key: "workMode",
                                    label: "Work mode",
                                    render: (row) => (row.workMode ? <StatusBadge status={WORK_MODE_META[row.workMode]} /> : "—"),
                                },
                                {
                                    key: "employmentType",
                                    label: "Employment",
                                    render: (row) => (row.employmentType ? <StatusBadge status={EMPLOYMENT_TYPE_META[row.employmentType]} /> : "—"),
                                },
                                {
                                    key: "joined",
                                    label: "On record since",
                                    render: (row) => (row.joinedAt ? formatDate(row.joinedAt) : "—"),
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (row) => <StatusBadge status={EMPLOYEE_STATUS_META[row.active ? "active" : "inactive"]} />,
                                },
                            ]}
                            rows={department.members}
                            rowKey={(row) => row.id}
                            emptyMessage="No members in this department yet. Put someone in it from their profile's Edit."
                        />
                    </div>
                );
            }}
        </ResourceBoundary>
    );
}
