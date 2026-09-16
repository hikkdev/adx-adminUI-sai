"use client";

import * as React from "react";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import type { FilterSelection } from "@/components/adx/filter-panel";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { workService, type WorkIssue, type WorkListPage, type WorkPerson, type WorkProject, type WorkTaskCard } from "@/services/work";
import type { WorkIssueSeverity, WorkIssueStatus } from "@/types";
import { TasksNav } from "../tasks-nav";
import { TasksOffline } from "../tasks-offline";
import { IssuesView } from "./issues-view";

/** The facets as the risk log sends them: `status` is a chip list, `severity` and `project` hold one value. */
export function issuesQueryOf(selection: FilterSelection, q: string) {
    return {
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(selection.status?.length ? { status: selection.status as WorkIssueStatus[] } : {}),
        ...(selection.severity?.[0] ? { severity: selection.severity[0] as WorkIssueSeverity } : {}),
        ...(selection.project?.[0] ? { projectId: selection.project[0] } : {}),
        sort: "severity" as const,
        pageSize: 100,
    };
}

/**
 * The risk log's data: `GET /work/issues` under the facets in force (the
 * server counts the status chips with that facet removed), and three side
 * reads that fill the pickers — the ACTIVE projects, the open tasks an
 * issue can be raised on, and the people it can be assigned to — each
 * failing soft so the log stands without them.
 */
export function IssuesLoader() {
    const live = isLive("work");
    const [selection, setSelection] = React.useState<FilterSelection>({ status: ["OPEN", "IN_PROGRESS"] });
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query, 300);
    const params = issuesQueryOf(selection, q);
    const key = JSON.stringify(params);

    const issues = useApiResource<WorkListPage<WorkIssue> | null>(`work:issues:${key}:${live}`, () => (live ? workService.issues.list(params) : Promise.resolve(null)));
    const projects = useApiResource<WorkProject[]>(`work:issues:projects:${live}`, () =>
        live ? workService.projects.list({ status: ["ACTIVE"], pageSize: 100, sort: "name" }).then((page) => page.items).catch(() => [] as WorkProject[]) : Promise.resolve([]),
    );
    const tasks = useApiResource<WorkTaskCard[]>(`work:issues:tasks:${live}`, () =>
        live ? workService.tasks.list({ pageSize: 100, sort: "UPDATED" }).then((page) => page.items).catch(() => [] as WorkTaskCard[]) : Promise.resolve([]),
    );
    const people = useApiResource<WorkPerson[]>(`work:issues:people:${live}`, () => (live ? workService.people().catch(() => [] as WorkPerson[]) : Promise.resolve([])));

    if (!live) return <TasksOffline title="Risk & issues" subtitle="Performance barriers raised against tasks, with resolution context." />;

    return (
        <div className="space-y-5">
            <PageHeader title="Risk & issues" subtitle="Performance barriers raised against tasks, with resolution context." />
            <TasksNav />
            <ResourceBoundary resource={issues}>
                {(page) =>
                    page ? (
                        <IssuesView
                            page={page}
                            projects={projects.data ?? []}
                            tasks={tasks.data ?? []}
                            people={people.data ?? []}
                            selection={selection}
                            onSelectionChange={setSelection}
                            query={query}
                            onQueryChange={setQuery}
                            onChanged={issues.reload}
                        />
                    ) : null
                }
            </ResourceBoundary>
        </div>
    );
}
