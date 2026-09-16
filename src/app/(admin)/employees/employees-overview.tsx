"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BreakdownTable, CountTile, MixBar, StatTile } from "@/components/adx/overview";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { WorkloadChart } from "@/components/charts/lazy";
import { WORKLOAD_COLORS } from "@/components/charts/workload-colors";
import { formatDate, formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useNow } from "@/lib/use-now";
import {
    WORKLOAD_LEVELS,
    WORKLOAD_LEVEL_LABEL,
    employeesService,
    holidayKindMeta,
    hrmsProviderLabel,
    istDateOf,
    shapeWorkloadSeries,
    splitHolidays,
    weekdayOf,
    workloadBandLabel,
    type Holiday,
} from "@/services/employees";
import { integrationsService, type HrmsSettings } from "@/services/integrations";
import { SECTION_META, kycMixItems, type EmployeesOverviewSection } from "@/services/section-overviews";
import { workService, type WorkOverview } from "@/services/work";

const meta = SECTION_META.employees;

interface Tools {
    /** The HR-tool section of the integrations row; null when that read failed. */
    hrms: HrmsSettings | null;
}

/**
 * The DR 10 frame `Employees · /employees` (`5102:29144`), rebuilt over
 * `GET /section-overviews/employees` — package O-C.
 *
 * The frame's header, tab strip, tiles, the two-card row and the
 * "Workload distribution" chart are kept. The tiles read the section's
 * one read now: the headcount and the open positions (`GET /employees/
 * overview`, carried verbatim), who joined in the window against the
 * window before, the holidays in it, and — new — the KYC queue as a mix
 * (each state opening the employees' queue with that chip on), the
 * tenure mix, and the active staff by department, work mode, employment
 * type and region. The chart is Lot G (Q120): the workload measure by
 * month over the window, the share of staff at low, medium and high
 * load, banded by the thresholds under Settings › People. The two cards
 * are the HR tool's portal (Q98) and — Lot AA, replacing the work tool's
 * link-out — the Work card over `GET /work/overview`: open, overdue and
 * awaiting review, opening the Tasks section; the table at the bottom is
 * the holidays still to come, the one HR record kept in-house. All three
 * are side reads that fail soft, so the overview stands without them.
 */
export function EmployeesOverview({ data, link }: { data: EmployeesOverviewSection; link: (href: string | null) => string | null }) {
    const { overview, tiles, breakdowns, workload } = data;
    const now = useNow();
    const today = now === null ? null : istDateOf(now);
    const year = today ? Number(today.slice(0, 4)) : null;

    const tools = useApiResource<Tools>("employees:overview:tools", () =>
        integrationsService
            .get()
            .then((settings) => ({ hrms: settings.hrms ?? null }))
            .catch(() => ({ hrms: null })),
    );
    const work = useApiResource<WorkOverview | null>("employees:overview:work", () => workService.overview().catch(() => null));
    const holidays = useApiResource<Holiday[]>(`employees:overview:holidays:${year ?? "-"}`, () =>
        year !== null ? employeesService.holidays(year).catch(() => [] as Holiday[]) : Promise.resolve([]),
    );

    const series = shapeWorkloadSeries(workload);
    const { upcoming } = today ? splitHolidays(holidays.data ?? [], today) : { upcoming: [] as Holiday[] };
    const hrms = tools.data?.hrms ?? null;
    const provider = hrmsProviderLabel(hrms?.provider);
    const workTasks = work.data?.tasks ?? null;
    const openTasks = workTasks ? (workTasks.byStatus.TODO ?? 0) + (workTasks.byStatus.IN_PROGRESS ?? 0) + (workTasks.byStatus.PENDING_REVIEW ?? 0) + (workTasks.byStatus.BLOCKED ?? 0) : 0;
    const tenureTotal = tiles.tenure.under1y + tiles.tenure.from1to3y + tiles.tenure.over3y;

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                    label="Total employees"
                    value={formatNumber(overview.headcount.total)}
                    delta={null}
                    previous={null}
                    hint={`across ${formatNumber(breakdowns.byDepartment.total)} ${breakdowns.byDepartment.total === 1 ? "department" : "departments"}`}
                    href={meta.directory}
                />
                <StatTile
                    label="Active records"
                    value={formatNumber(overview.headcount.active)}
                    delta={null}
                    previous={null}
                    hint={overview.headcount.inactive > 0 ? `${formatNumber(overview.headcount.inactive)} inactive` : "nobody inactive"}
                />
                <CountTile label="Joined in window" figure={tiles.joined} hint="records created" />
                <StatTile
                    label="Open positions"
                    value={formatNumber(overview.openPositions)}
                    delta={null}
                    previous={null}
                    hint="across the active departments' open roles"
                    href="/employees/departments"
                />
                <CountTile label="Holidays in window" figure={tiles.holidays} href="/employees/holidays" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <MixBar
                    title="KYC by state"
                    hint="Every employee, by where their verification stands now — each state opens the queue with that chip on."
                    items={kycMixItems(tiles.kyc, meta.kycQueue)}
                />
                <MixBar
                    title="Tenure"
                    hint={`${formatNumber(tenureTotal)} active staff by time since their record was created.`}
                    items={[
                        { key: "under1y", label: "Under a year", count: tiles.tenure.under1y, href: null, tone: "info" },
                        { key: "from1to3y", label: "One to three years", count: tiles.tenure.from1to3y, href: null, tone: "success" },
                        { key: "over3y", label: "Three years and more", count: tiles.tenure.over3y, href: null, tone: "neutral" },
                    ]}
                />
            </div>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">Workload distribution</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">Share of staff running at low, medium and high utilisation, by month over the window</p>
                    </div>
                    <Link href="/settings#people" className="text-xs font-medium text-primary hover:underline">
                        Thresholds
                    </Link>
                </div>
                <div className="mt-4">
                    {series.every((point) => point.staff === 0) ? (
                        <p className="text-sm text-muted-foreground">No active staff in the window, so there is nothing to band.</p>
                    ) : (
                        <WorkloadChart data={series} />
                    )}
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    {WORKLOAD_LEVELS.map((level) => (
                        <li key={level} className="flex items-center gap-1.5">
                            <span
                                className="inline-block size-2 rounded-full"
                                style={{ backgroundColor: WORKLOAD_COLORS[level.toLowerCase() as keyof typeof WORKLOAD_COLORS] }}
                                aria-hidden
                            />
                            {WORKLOAD_LEVEL_LABEL[level]} · {workloadBandLabel(level, workload.thresholds)}
                        </li>
                    ))}
                    <li className="basis-full text-[11px]">
                        Weighted items: open KYC cases ×{workload.weights.open.kyc}, tickets ×{workload.weights.open.tickets}, fraud cases ×{workload.weights.open.fraud};
                        decisions ×{workload.weights.actions.decisions}, replies ×{workload.weights.actions.replies}; a diary entry ×{workload.weights.schedule}.
                    </li>
                </ul>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownTable
                    title="By department"
                    hint="Active departments: their active members and open roles — the department's page."
                    labelHeading="Department"
                    page={breakdowns.byDepartment}
                    initialSort="headcount"
                    linkFor={(row) => link(row.href)}
                    columns={[
                        { key: "headcount", label: "Headcount", align: "right", render: (row) => formatNumber(row.headcount), sortValue: (row) => row.headcount },
                        { key: "openRoles", label: "Open roles", align: "right", render: (row) => formatNumber(row.openRoles), sortValue: (row) => row.openRoles },
                    ]}
                />
                <BreakdownTable
                    title="By region"
                    hint="Active employees per region."
                    labelHeading="Region"
                    page={breakdowns.byRegion}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Employees", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By work mode"
                    hint="Active employees per work mode."
                    labelHeading="Work mode"
                    page={breakdowns.byWorkMode}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Employees", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By employment type"
                    hint="Active employees per employment type."
                    labelHeading="Type"
                    page={breakdowns.byEmploymentType}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Employees", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h2 className="text-sm font-semibold text-foreground">HR tool</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Attendance, leave, payroll and hiring are worked in the HR tool, not here. A record's HR-tool id links its profile through.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        {tools.data === null ? (
                            <p className="text-sm text-muted-foreground">Reading the integrations row…</p>
                        ) : hrms === null ? (
                            <p className="text-sm text-muted-foreground">The integrations row could not be read, so the tool cannot be named here.</p>
                        ) : provider === null ? (
                            <p className="text-sm text-muted-foreground">No HR tool is switched on. Pick one under Settings › Integrations.</p>
                        ) : hrms.portalUrl ? (
                            <Button asChild>
                                <a href={hrms.portalUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="size-4" />
                                    Open in {provider}
                                </a>
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">{provider} is the tool, but no portal URL is set yet — add it under Settings › Integrations.</p>
                        )}
                        <Link href="/settings/integrations" className="text-xs font-medium text-primary hover:underline">
                            Integration settings
                        </Link>
                    </div>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none" data-testid="work-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <Briefcase className="size-4 text-muted-foreground" />
                                Work
                            </h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">Tasks, boards and issues are worked in the console&apos;s Tasks section — this Indian month, across every active project.</p>
                        </div>
                        <Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                            Open Tasks
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </div>
                    <div className="mt-4">
                        {work.loading && work.data === null ? (
                            <p className="text-sm text-muted-foreground">Reading the work overview…</p>
                        ) : workTasks === null ? (
                            <p className="text-sm text-muted-foreground">The Tasks section could not be read, so its numbers cannot be shown here.</p>
                        ) : (
                            <dl className="grid grid-cols-3 gap-4">
                                <div>
                                    <dt className="text-xs text-muted-foreground">Open</dt>
                                    <dd className="text-metric mt-1 text-foreground">{formatNumber(openTasks)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground">Overdue</dt>
                                    <dd className={workTasks.overdue > 0 ? "text-metric mt-1 text-danger" : "text-metric mt-1 text-foreground"}>{formatNumber(workTasks.overdue)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-muted-foreground">Awaiting review</dt>
                                    <dd className="text-metric mt-1 text-foreground">{formatNumber(workTasks.byStatus.PENDING_REVIEW ?? 0)}</dd>
                                </div>
                            </dl>
                        )}
                    </div>
                </Card>
            </div>

            <div>
                <div className="mb-2.5 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Upcoming holidays</h2>
                    <Link href="/employees/holidays" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        Full calendar
                        <ArrowRight className="size-3.5" />
                    </Link>
                </div>
                <SimpleTable
                    columns={[
                        { key: "date", label: "Date", render: (row: Holiday) => <span className="font-medium text-foreground">{formatDate(row.date)}</span> },
                        { key: "day", label: "Day", render: (row) => weekdayOf(row.date) },
                        { key: "name", label: "Holiday", render: (row) => row.name },
                        { key: "type", label: "Type", render: (row) => <StatusBadge status={holidayKindMeta(row)} /> },
                    ]}
                    rows={upcoming.slice(0, 6)}
                    rowKey={(row) => row.id}
                    emptyMessage={today && holidays.data ? "No holidays left this year." : "Reading the calendar…"}
                />
            </div>
        </>
    );
}
