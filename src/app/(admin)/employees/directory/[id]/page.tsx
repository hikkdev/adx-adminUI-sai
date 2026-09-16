import type { Metadata } from "next";
import { EmployeeLoader } from "./employee-loader";

export const metadata: Metadata = { title: "Employee Profile" };

interface EmployeeProfilePageProps {
    params: Promise<{ id: string }>;
}

/** The DR 10 frame `Employee Profile · /employees/directory/emp_01`; `id` is the user id `GET /employees/:userId` keys on. */
export default async function EmployeeProfilePage({ params }: EmployeeProfilePageProps) {
    const { id } = await params;
    return <EmployeeLoader userId={id} />;
}
