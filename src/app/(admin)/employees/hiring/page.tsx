import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { EmployeesNav } from "../employees-nav";
import { CreateHiringDialog } from "./create-hiring-dialog";
import { HiringView } from "./hiring-view";

export const metadata: Metadata = { title: "Hiring" };

export default async function HiringPage() {
    const [jobs, candidates] = await Promise.all([api.hr.jobs(), api.hr.candidates()]);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Hiring"
                subtitle="Open positions and the candidate pipeline behind them."
                actions={<CreateHiringDialog />}
            />
            <EmployeesNav />
            <HiringView jobs={jobs} candidates={candidates} />
        </div>
    );
}
