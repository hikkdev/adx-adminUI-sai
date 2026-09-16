"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import {
    reportsReadApi,
    reportsService,
    type ListPage,
    type ReportKind,
    type ReportRunStatus,
    type ReportSchedule,
    type RunsPage,
    type ScheduleStatus,
} from "@/services/reports";
import { ReportsView } from "./reports-view";

const PAGE_SIZE = 50;

export type RunChip = "all" | ReportRunStatus;
export type ScheduleChip = "all" | ScheduleStatus;

export interface ReportsData {
    catalogue: ReportKind[];
    schedules: ListPage<ReportSchedule>;
    runs: RunsPage;
}

/**
 * Three reads with two lifetimes: the catalogue never moves (it is code on
 * the server), the schedules move when somebody edits one, and the runs
 * move every time somebody clicks Run now or a schedule fires. They are
 * read together anyway because the page is small and a run's kind is
 * printed by the catalogue's name for it; the two chip rows are the list
 * contract's own cuts, so choosing one refetches its page with `counts`
 * computed with the facet removed.
 */
export function ReportsLoader() {
    const live = reportsReadApi();
    const [runChip, setRunChip] = React.useState<RunChip>("all");
    const [scheduleChip, setScheduleChip] = React.useState<ScheduleChip>("all");

    const resource = useApiResource<ReportsData>(`reports:${live}:${runChip}:${scheduleChip}`, async () => {
        if (!live) {
            const empty = { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, counts: {} };
            return { catalogue: [], schedules: empty, runs: empty };
        }
        const [catalogue, schedules, runs] = await Promise.all([
            reportsService.catalogue(),
            reportsService.schedules({ status: scheduleChip === "all" ? undefined : [scheduleChip], sort: "newest", pageSize: PAGE_SIZE }),
            reportsService.runs({ status: runChip === "all" ? undefined : [runChip], sort: "newest", pageSize: PAGE_SIZE }),
        ]);
        return { catalogue, schedules, runs };
    });

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="Reports read the API"
                description="The twelve reports are rendered on the server into private files, and a schedule mails a signed link. There is no seeded report: a fixture here would be a file nobody rendered. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <ReportsView
                    data={data}
                    runChip={runChip}
                    onRunChipChange={setRunChip}
                    scheduleChip={scheduleChip}
                    onScheduleChipChange={setScheduleChip}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
