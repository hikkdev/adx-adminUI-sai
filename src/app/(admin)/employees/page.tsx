import type { Metadata } from "next";
import { Suspense } from "react";
import { EmployeesLoader } from "./employees-loader";

export const metadata: Metadata = { title: "Employees" };

/** The DR 10 frame `Employees · /employees`, over `GET /section-overviews/employees` since package O-C. Suspense because the loader keeps the window in the URL. */
export default function EmployeesPage() {
    return (
        <Suspense fallback={null}>
            <EmployeesLoader />
        </Suspense>
    );
}
