import type { Metadata } from "next";
import { AddEmployeeLoader } from "./add-employee-loader";

export const metadata: Metadata = { title: "Add Employee" };

/** The DR 10 frame `Add Employee · /employees/new`, over `POST /employees` with Lot A's optional console invitation. */
export default function AddEmployeePage() {
    return <AddEmployeeLoader />;
}
