"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { workService, type WorkOverview } from "@/services/work";
import { TasksNav } from "./tasks-nav";
import { TasksOffline } from "./tasks-offline";
import { TasksOverview } from "./tasks-overview";

/**
 * The overview's data: one read, `GET /work/overview?projectId`, keyed on
 * the project picked so a change refetches. Every tile, the donut, the
 * trend, the workload and the overdue list are the read's own numbers —
 * nothing is derived from a task list on the client.
 */
export function TasksLoader() {
    const live = isLive("work");
    const [projectId, setProjectId] = React.useState<string | null>(null);
    const overview = useApiResource<WorkOverview | null>(`work:overview:${projectId ?? ""}:${live}`, () =>
        live ? workService.overview(projectId ? { projectId } : {}) : Promise.resolve(null),
    );

    if (!live) return <TasksOffline title="Tasks" subtitle="Internal work items across departments and field regions." />;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Tasks"
                subtitle="Internal work items across departments and field regions."
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/tasks/issues">
                                Risk log
                                <ArrowRight className="size-4" />
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/tasks/new">
                                <Plus className="size-4" />
                                Create task
                            </Link>
                        </Button>
                    </div>
                }
            />
            <TasksNav />
            <ResourceBoundary resource={overview}>
                {(data) => (data ? <TasksOverview overview={data} projectId={projectId} onProjectChange={setProjectId} /> : null)}
            </ResourceBoundary>
        </div>
    );
}
