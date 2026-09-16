import type { Metadata } from "next";
import { DirectoryLoader } from "./directory-loader";

export const metadata: Metadata = { title: "Employee Directory" };

/** The DR 10 frame `Employee Directory · /employees/directory`, over `GET /employees`. */
export default function EmployeeDirectoryPage() {
    return <DirectoryLoader />;
}
