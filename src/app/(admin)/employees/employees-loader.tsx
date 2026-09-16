"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionOverviewLoader } from "@/components/adx/overview";
import { consoleHref } from "@/services/section-overviews";
import { EmployeesNav } from "./employees-nav";
import { EmployeesOverview } from "./employees-overview";

/**
 * The employees overview — package O-C: one read,
 * `GET /section-overviews/employees`, over the window in the URL. The
 * headcount and the open positions (`GET /employees/overview`, verbatim
 * inside it), who joined in the window, the KYC queue, tenure, the
 * holidays in the window, the four breakdowns and the workload measure
 * by month over the window all come from that read; the two doors out
 * (the HR tool, the work tool) and the holidays still to come are the
 * side reads they were, made inside the body and failing soft.
 */
export function EmployeesLoader() {
    return (
        <SectionOverviewLoader
            section="employees"
            title="Employees"
            subtitle="Staff records, departments and the holiday calendar — the window's movement against the same number of days before it."
            actions={
                <>
                    {/* Lot D (Q131): the intake — submitted, reviewed, approved into an HR record. */}
                    <Button variant="outline" className="h-9 bg-card" asChild>
                        <Link href="/onboarding/submissions?userType=EMPLOYEE">Onboard</Link>
                    </Button>
                    <Button className="h-9" asChild>
                        <Link href="/employees/new">
                            <Plus className="size-4" />
                            Add employee
                        </Link>
                    </Button>
                </>
            }
            nav={<EmployeesNav />}
        >
            {(data, window) => <EmployeesOverview data={data} link={(href: string | null) => consoleHref("employees", href, window)} />}
        </SectionOverviewLoader>
    );
}
