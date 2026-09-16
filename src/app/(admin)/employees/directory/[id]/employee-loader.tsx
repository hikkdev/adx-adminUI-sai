"use client";

import { notFound } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { employeeKycService, type EmployeeKycCase } from "@/services/employee-kyc";
import { employeesService, type EmployeeDetail } from "@/services/employees";
import { EmployeesOffline } from "../../employees-nav";
import { EmployeeProfile } from "./employee-profile";

export interface ProfileData {
    /** Null for a user id with no HR record — the page answers 404. */
    employee: EmployeeDetail | null;
    /** The KYC desk's record for this person, null before anything was recorded or when the KYC domain is off. */
    kyc: EmployeeKycCase | null;
}

/**
 * One record by user id, with the deep link and the documents as the
 * viewer may see them, plus the employee's KYC case — keyed by the HR row's
 * own id — so the profile can say where their verification stands and
 * link to the desk. A failed KYC read leaves that tile empty rather than
 * failing the page; KYC is its own domain with its own screen.
 */
export function EmployeeLoader({ userId }: { userId: string }) {
    const live = isLive("employees");
    const resource = useApiResource<ProfileData>(`employees:profile:${userId}:${live}`, async () => {
        if (!live) return { employee: null, kyc: null };
        let employee: EmployeeDetail;
        try {
            employee = await employeesService.get(userId);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return { employee: null, kyc: null };
            throw cause;
        }
        const kyc = isLive("kyc") ? await employeeKycService.get(employee.id).catch(() => null) : null;
        return { employee, kyc };
    });

    if (!live) return <EmployeesOffline title="Employee" subtitle="One HR record." />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.employee) notFound();
                return <EmployeeProfile employee={data.employee} kyc={data.kyc} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
