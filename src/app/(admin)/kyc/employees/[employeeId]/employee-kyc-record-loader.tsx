"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { employeeKycService, type EmployeeKycCase, type EmployeeSummary } from "@/services/employee-kyc";
import { EmployeeKycRecord } from "./employee-kyc-record";

interface Loaded {
    employee: EmployeeSummary | null;
    /** Null before anything has been recorded for this employee. */
    kyc: EmployeeKycCase | null;
}

/**
 * The employee, and whatever the desk has recorded for them so far. The
 * KYC row joins the employee, so a recorded case names them on its own; a
 * first recording finds them on the HR roster instead.
 */
export function EmployeeKycRecordLoader({ employeeId }: { employeeId: string }) {
    const live = isLive("kyc");
    const resource = useApiResource<Loaded>(`employee-kyc:${employeeId}:${live}`, async () => {
        const kyc = await employeeKycService.get(employeeId);
        if (kyc) {
            return {
                kyc,
                employee: {
                    id: kyc.employeeId,
                    userId: "",
                    name: kyc.employeeName,
                    displayId: kyc.displayId,
                    department: kyc.department,
                    designation: kyc.designation,
                    mobile: kyc.mobile,
                    email: null,
                    isActive: true,
                },
            };
        }
        return { kyc: null, employee: await employeeKycService.employee(employeeId) };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.employee) notFound();
                return <EmployeeKycRecord employee={data.employee} kyc={data.kyc} live={live} onChanged={resource.reload} />;
            }}
        </ResourceBoundary>
    );
}
