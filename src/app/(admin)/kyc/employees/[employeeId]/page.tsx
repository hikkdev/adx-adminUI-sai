import type { Metadata } from "next";
import { EmployeeKycRecordLoader } from "./employee-kyc-record-loader";

export const metadata: Metadata = { title: "Employee KYC record" };

/** Lot D (Q131) — one employee's KYC: recorded on their behalf, then decided. */
export default async function EmployeeKycRecordPage({ params }: { params: Promise<{ employeeId: string }> }) {
    const { employeeId } = await params;
    return <EmployeeKycRecordLoader employeeId={employeeId} />;
}
