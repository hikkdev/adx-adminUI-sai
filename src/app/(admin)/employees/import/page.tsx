import type { Metadata } from "next";
import { EmployeesNav } from "../employees-nav";
import { ImportLoader } from "./import-loader";

export const metadata: Metadata = { title: "Import employees" };

/** Package S — the section's Import tab: upload a book of employees, read the validation report, commit. `?id=` opens one import. */
export default async function ImportEmployeesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
    const { id } = await searchParams;
    return (
        <div className="space-y-5">
            <EmployeesNav />
            <ImportLoader importId={id ?? null} />
        </div>
    );
}
