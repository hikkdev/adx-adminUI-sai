import type { Metadata } from "next";
import { DepartmentLoader } from "./department-loader";

export const metadata: Metadata = { title: "Department" };

interface DepartmentDetailPageProps {
    params: Promise<{ id: string }>;
}

/** The DR 10 frame `Department · /employees/departments/design` — one record: its head, open roles, regions and members. */
export default async function DepartmentDetailPage({ params }: DepartmentDetailPageProps) {
    const { id } = await params;
    return <DepartmentLoader id={decodeURIComponent(id)} />;
}
