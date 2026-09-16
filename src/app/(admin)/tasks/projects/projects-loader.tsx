"use client";

import * as React from "react";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import type { FilterSelection } from "@/components/adx/filter-panel";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { departmentsService } from "@/services/departments";
import { geoService } from "@/services/geo";
import { workService, type WorkListPage, type WorkOverview, type WorkProject, type WorkProjectsQuery } from "@/services/work";
import type { WorkProjectKind } from "@/types";
import { TasksNav } from "../tasks-nav";
import { TasksOffline } from "../tasks-offline";
import { ProjectsView, type ProjectStats } from "./projects-view";

/** The facets as the table sends them: `status` is a chip list, `kind` holds one value. */
export function projectsQueryOf(selection: FilterSelection, q: string): WorkProjectsQuery {
    return {
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(selection.status?.length ? { status: selection.status } : {}),
        ...(selection.kind?.[0] ? { kind: selection.kind[0] as WorkProjectKind } : {}),
        sort: "name",
        pageSize: 100,
    };
}

/** The stages a region project's city can be in — every one but PLANNED and WITHDRAWN. */
const CITY_STAGES_IN_PLAY = ["SEEDING", "LAUNCHED", "PAUSED"] as const;

/**
 * The projects table's data (Lot AB, package AB-C): `GET /work/projects`
 * under the facets in force (the server counts the status chips with that
 * facet removed), and three side reads that name what a row only carries
 * the id of — the departments (`GET /hr/departments`), the cities in play
 * (`GET /geo/cities`), and the overview's per-project open / verified /
 * progress for the ACTIVE ones (`GET /work/overview`) — each failing soft
 * so the table stands without them.
 */
export function ProjectsLoader() {
    const live = isLive("work");
    const hr = isLive("employees");
    const [selection, setSelection] = React.useState<FilterSelection>({ status: ["ACTIVE"] });
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query, 300);
    const params = projectsQueryOf(selection, q);
    const key = JSON.stringify(params);

    const projects = useApiResource<WorkListPage<WorkProject> | null>(`work:projects:${key}:${live}`, () => (live ? workService.projects.list(params) : Promise.resolve(null)));
    const overview = useApiResource<WorkOverview | null>(`work:projects:overview:${live}`, () => (live ? workService.overview().catch(() => null) : Promise.resolve(null)));
    const departments = useApiResource<Map<string, string>>(`work:projects:departments:${hr}`, async () => {
        if (!hr) return new Map();
        const rows = await departmentsService.listAll().catch(() => []);
        return new Map(rows.map((row) => [row.id, row.name]));
    });
    const cities = useApiResource<Map<string, string>>(`work:projects:cities:${live}`, async () => {
        if (!live) return new Map();
        const page = await geoService.cities({ stage: [...CITY_STAGES_IN_PLAY], pageSize: 100, sort: "population" }).catch(() => null);
        return new Map((page?.items ?? []).map((city) => [city.id, city.name]));
    });

    const stats = React.useMemo<Map<string, ProjectStats>>(() => new Map((overview.data?.projects ?? []).map((row) => [row.id, { open: row.open, verified: row.verified, progress: row.progress }])), [overview.data]);

    if (!live) return <TasksOffline title="Projects" subtitle="The frames tasks and issues sit in — one per department or region." />;

    const reload = () => {
        projects.reload();
        overview.reload();
    };

    return (
        <div className="space-y-5">
            <PageHeader title="Projects" subtitle="The frames tasks and issues sit in — one per department or region." />
            <TasksNav />
            <ResourceBoundary resource={projects}>
                {(page) =>
                    page ? (
                        <ProjectsView
                            page={page}
                            stats={stats}
                            departmentNames={departments.data ?? new Map()}
                            cityNames={cities.data ?? new Map()}
                            selection={selection}
                            onSelectionChange={setSelection}
                            query={query}
                            onQueryChange={setQuery}
                            onChanged={reload}
                        />
                    ) : null
                }
            </ResourceBoundary>
        </div>
    );
}
