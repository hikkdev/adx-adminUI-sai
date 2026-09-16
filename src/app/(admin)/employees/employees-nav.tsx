import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SubNav } from "@/components/adx/sub-nav";

/**
 * Section tabs shared by the Employees pages.
 *
 * Q98: attendance, leave, payroll and hiring live in the HR tool, reached
 * by the portal link on the overview, so those four tabs are gone rather
 * than drawn over nothing. What is left is what the console owns: the
 * records, the departments they group into, and the holiday calendar the
 * staff diary shades — and, since package S, the Import tab over the party
 * importer at `/party-imports/employees`.
 */
export function EmployeesNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/employees", exact: true },
                { label: "Directory", href: "/employees/directory" },
                { label: "Departments", href: "/employees/departments" },
                { label: "Holidays", href: "/employees/holidays" },
                { label: "Import", href: "/employees/import" },
            ]}
        />
    );
}

/**
 * What the employees screens show with the API off.
 *
 * The seeded `emp_*` records are gone rather than kept as a fallback: their
 * ids were never issued by the backend. An empty screen that says why is a
 * true statement. (Region, work mode and employment type are columns on
 * `Employee` since Lot G, Q122/Q140, and the directory draws them.)
 */
export function EmployeesOffline({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="space-y-5">
            <PageHeader title={title} subtitle={subtitle} />
            <EmployeesNav />
            <EmptyState
                icon={PlugZap}
                title="Employees read the API"
                description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the real HR records, departments and holidays."
            />
        </div>
    );
}
