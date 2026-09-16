"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { departmentsService, type DepartmentView } from "@/services/departments";
import { rolesService, type RoleConfig } from "@/services/roles";
import { EmployeesOffline } from "../employees-nav";
import { AddEmployeeWizard } from "./add-employee-wizard";

interface Loaded {
    /** Lot G (Q122): the department records, for the picker — the create takes `departmentId`. */
    departments: DepartmentView[];
    /** Console roles for the invitation step; empty when the roles domain is off or the read failed. */
    roles: RoleConfig[];
}

/**
 * What the wizard needs before the first step: the department records
 * (a new one is added under Departments, not typed here — the create
 * takes the record's id) and the console roles the invitation can attach.
 * A failed roles read leaves the picker with "Super admin" only, as the
 * users desk does, rather than failing the page.
 */
export function AddEmployeeLoader() {
    const live = isLive("employees");
    const resource = useApiResource<Loaded>(`employees:new:${live}`, async () => {
        if (!live) return { departments: [], roles: [] };
        const [departments, roles] = await Promise.all([
            departmentsService.listAll({ status: "ACTIVE" }).catch(() => [] as DepartmentView[]),
            isLive("roles") ? rolesService.list().catch(() => [] as RoleConfig[]) : Promise.resolve([] as RoleConfig[]),
        ]);
        return { departments, roles };
    });

    if (!live) return <EmployeesOffline title="Add employee" subtitle="Open an HR record on a user account." />;

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
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Add employee</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Four short steps: the person, their role, console access, review.
                </p>
            </div>
            <ResourceBoundary resource={resource}>
                {(data) => <AddEmployeeWizard departments={data.departments} roles={data.roles} />}
            </ResourceBoundary>
        </div>
    );
}
