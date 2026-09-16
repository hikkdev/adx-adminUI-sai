import type { Metadata } from "next";
import { DepartmentsLoader } from "./departments-loader";

export const metadata: Metadata = { title: "Departments" };

/** The DR 10 frame `Departments · /employees/departments` — Lot G's `Department` records, with New / Edit / Delete. */
export default function DepartmentsPage() {
    return <DepartmentsLoader />;
}
