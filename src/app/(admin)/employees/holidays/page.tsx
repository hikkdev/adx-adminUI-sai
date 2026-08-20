import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import { api } from "@/services";
import type { Holiday } from "@/types";
import { EmployeesNav } from "../employees-nav";

export const metadata: Metadata = { title: "Holidays" };

const kindBadge = (row: Holiday) => (
    <StatusBadge
        status={
            row.kind === "public"
                ? { label: "Public", tone: "success" }
                : { label: "Optional", tone: "neutral" }
        }
    />
);

export default async function HolidaysPage() {
    const holidays = await api.hr.holidays();
    const upcoming = holidays.filter((holiday) => holiday.date >= "2026-08-10");
    const past = holidays.filter((holiday) => holiday.date < "2026-08-10");

    return (
        <div className="space-y-5">
            <PageHeader
                title="Holidays"
                subtitle={`Holiday calendar 2026 · ${upcoming.length} still to come`}
            />
            <EmployeesNav />
            <div className="grid gap-4 xl:grid-cols-2">
                <SimpleTable
                    columns={[
                        {
                            key: "date",
                            label: "Upcoming",
                            render: (row: Holiday) => (
                                <span className="font-medium text-foreground">
                                    {formatDate(row.date)}
                                </span>
                            ),
                        },
                        { key: "day", label: "Day", render: (row) => row.day },
                        { key: "name", label: "Holiday", render: (row) => row.name },
                        { key: "kind", label: "Type", render: kindBadge },
                    ]}
                    rows={upcoming}
                    rowKey={(row) => row.date}
                    emptyMessage="No holidays left this year."
                />
                <SimpleTable
                    columns={[
                        {
                            key: "date",
                            label: "Earlier this year",
                            render: (row: Holiday) => (
                                <span className="text-muted-foreground">
                                    {formatDate(row.date)}
                                </span>
                            ),
                        },
                        { key: "day", label: "Day", render: (row) => row.day },
                        { key: "name", label: "Holiday", render: (row) => row.name },
                        { key: "kind", label: "Type", render: kindBadge },
                    ]}
                    rows={past}
                    rowKey={(row) => row.date}
                    emptyMessage="The year has not started yet."
                />
            </div>
        </div>
    );
}
