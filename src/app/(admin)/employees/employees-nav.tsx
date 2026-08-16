import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by the Employees HR pages. */
export function EmployeesNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/employees", exact: true },
                { label: "Directory", href: "/employees/directory" },
                { label: "Departments", href: "/employees/departments" },
                { label: "Attendance", href: "/employees/attendance" },
                { label: "Leave & holidays", href: "/employees/leave" },
                { label: "Payroll", href: "/employees/payroll" },
                { label: "Hiring", href: "/employees/hiring" },
            ]}
        />
    );
}
